-- =====================================================================
-- Migration 0004 — Reporting views and stored functions
-- Views are read by the API (not just defined) so reports always come from
-- persisted rows: vw_trip_timeline, vw_budget_vs_actual, vw_member_balances.
-- =====================================================================

-- Unified chronological timeline of fixed logistics and flexible activities.
CREATE OR REPLACE VIEW vw_trip_timeline AS
SELECT t.trip_id, 'transport'::text AS item_type, t.transport_id AS item_id,
       (t.transport_type || ': ' || t.provider)::text AS title,
       t.departure_time AS start_time, t.arrival_time AS end_time,
       t.cost, t.status::text AS status, t.booking_reference::text AS booking_reference, TRUE AS is_fixed
FROM transports t
UNION ALL
SELECT a.trip_id, 'accommodation'::text, a.accommodation_id, a.name::text,
       a.check_in, a.check_out, a.cost, a.status::text, a.booking_reference::text, TRUE
FROM accommodations a
UNION ALL
SELECT s.trip_id, 'activity'::text, s.slot_id, s.title::text,
       s.start_time, s.end_time, NULL::numeric, NULL::text, NULL::text, s.is_locked
FROM itinerary_slots s;

-- Budget vs. actual. FULL JOIN so a category that has expenses but no planned
-- budget still appears (planned = 0) instead of silently vanishing from totals.
CREATE OR REPLACE VIEW vw_budget_vs_actual AS
SELECT COALESCE(b.trip_id, s.trip_id)               AS trip_id,
       COALESCE(b.category, s.category)::text       AS category,
       COALESCE(b.planned_amount, 0)                AS planned,
       COALESCE(s.spent, 0)                         AS spent,
       COALESCE(b.planned_amount, 0) - COALESCE(s.spent, 0) AS remaining,
       CASE WHEN COALESCE(b.planned_amount, 0) > 0
            THEN ROUND(COALESCE(s.spent, 0) / b.planned_amount * 100, 1)
       END                                          AS utilization_pct,
       b.remarks
FROM budgets b
FULL OUTER JOIN (
    SELECT trip_id, category, SUM(amount) AS spent
    FROM expenses
    GROUP BY trip_id, category
) s ON s.trip_id = b.trip_id AND s.category = b.category;

-- Per-member balance including settlements.
--   net = paid - share + settlements_made - settlements_received
--   net > 0  => the group owes this member,  net < 0 => this member owes the group
--   dues_outstanding = gross shares of expenses paid by OTHERS that this member has not yet settled
CREATE OR REPLACE VIEW vw_member_balances AS
SELECT tm.trip_id, u.user_id, u.name::text AS name, tm.member_role::text AS member_role,
       COALESCE(paid.total, 0)  AS total_paid,
       COALESCE(share.total, 0) AS total_share,
       COALESCE(made.total, 0)  AS settlements_made,
       COALESCE(recv.total, 0)  AS settlements_received,
       COALESCE(paid.total, 0) - COALESCE(share.total, 0) + COALESCE(made.total, 0) - COALESCE(recv.total, 0) AS net_balance,
       COALESCE(due.total, 0)   AS dues_outstanding
FROM trip_members tm
JOIN users u ON u.user_id = tm.user_id
LEFT JOIN (SELECT trip_id, paid_by AS user_id, SUM(amount) AS total FROM expenses GROUP BY trip_id, paid_by) paid
       ON paid.trip_id = tm.trip_id AND paid.user_id = tm.user_id
LEFT JOIN (SELECT e.trip_id, es.user_id, SUM(es.share_amount) AS total
           FROM expense_splits es JOIN expenses e ON e.expense_id = es.expense_id
           GROUP BY e.trip_id, es.user_id) share
       ON share.trip_id = tm.trip_id AND share.user_id = tm.user_id
LEFT JOIN (SELECT e.trip_id, p.paid_by AS user_id, SUM(p.amount) AS total
           FROM payments p JOIN expenses e ON e.expense_id = p.expense_id
           WHERE p.status = 'completed' GROUP BY e.trip_id, p.paid_by) made
       ON made.trip_id = tm.trip_id AND made.user_id = tm.user_id
LEFT JOIN (SELECT e.trip_id, e.paid_by AS user_id, SUM(p.amount) AS total
           FROM payments p JOIN expenses e ON e.expense_id = p.expense_id
           WHERE p.status = 'completed' GROUP BY e.trip_id, e.paid_by) recv
       ON recv.trip_id = tm.trip_id AND recv.user_id = tm.user_id
LEFT JOIN (SELECT e.trip_id, es.user_id, SUM(es.share_amount) AS total
           FROM expense_splits es JOIN expenses e ON e.expense_id = es.expense_id
           WHERE es.is_settled = FALSE AND e.paid_by <> es.user_id GROUP BY e.trip_id, es.user_id) due
       ON due.trip_id = tm.trip_id AND due.user_id = tm.user_id
WHERE tm.status = 'active';

-- ---------------------------------------------------------------------
-- Stored function: headline numbers for one trip (dashboard cards)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_trip_stats(p_trip_id INTEGER)
RETURNS TABLE (
    total_destinations INTEGER, total_transports INTEGER, total_accommodations INTEGER,
    total_activities INTEGER, total_members INTEGER, total_planned NUMERIC, total_spent NUMERIC,
    trip_duration_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*)::INTEGER FROM destinations    WHERE trip_id = p_trip_id),
        (SELECT COUNT(*)::INTEGER FROM transports      WHERE trip_id = p_trip_id AND status <> 'cancelled'),
        (SELECT COUNT(*)::INTEGER FROM accommodations  WHERE trip_id = p_trip_id AND status <> 'cancelled'),
        (SELECT COUNT(*)::INTEGER FROM itinerary_slots WHERE trip_id = p_trip_id),
        (SELECT COUNT(*)::INTEGER FROM trip_members    WHERE trip_id = p_trip_id AND status = 'active'),
        (SELECT COALESCE(SUM(planned_amount), 0) FROM budgets  WHERE trip_id = p_trip_id),
        (SELECT COALESCE(SUM(amount), 0)         FROM expenses WHERE trip_id = p_trip_id),
        (SELECT (end_date - start_date) + 1 FROM trips WHERE trip_id = p_trip_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- Stored function: settle every outstanding share of one member in one go.
-- Runs as a single atomic statement: marks the splits settled AND records one
-- payment per split (payer = the member, payee = the expense's original payer).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_settle_member_dues(p_trip_id INTEGER, p_user_id INTEGER, p_method VARCHAR DEFAULT 'cash')
RETURNS TABLE (settled_count INTEGER, total_settled NUMERIC) AS $$
BEGIN
    RETURN QUERY
    WITH due AS (
        UPDATE expense_splits es
           SET is_settled = TRUE
          FROM expenses e
         WHERE es.expense_id = e.expense_id
           AND e.trip_id = p_trip_id
           AND es.user_id = p_user_id
           AND es.is_settled = FALSE
           AND e.paid_by <> p_user_id
        RETURNING es.expense_id, es.share_amount
    ), pay AS (
        INSERT INTO payments (expense_id, paid_by, amount, payment_method)
        SELECT expense_id, p_user_id, share_amount, p_method FROM due WHERE share_amount > 0
        RETURNING amount
    )
    SELECT COUNT(*)::INTEGER, COALESCE(SUM(amount), 0) FROM pay;
END;
$$ LANGUAGE plpgsql;
