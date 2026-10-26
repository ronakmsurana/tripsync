-- ============================================
-- TripSync PostgreSQL Seed Script
-- ============================================
-- Contains:
-- 1. Extension setup (pgvector)
-- 2. Advanced DB features: Views, Triggers,
--    Stored Functions, Indexes
-- 3. Sample seed data
-- ============================================

-- ==========================================
-- EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- VIEWS (Advanced Feature #1)
-- ==========================================

-- View: Unified Trip Timeline
-- Merges transport, accommodation, and activities into one chronological view
CREATE OR REPLACE VIEW vw_trip_timeline AS
SELECT
    trip_id,
    'transport' AS item_type,
    transport_id AS item_id,
    CONCAT(transport_type, ': ', provider) AS title,
    departure_time AS start_time,
    arrival_time AS end_time,
    cost,
    status,
    TRUE AS is_fixed
FROM transports

UNION ALL

SELECT
    trip_id,
    'accommodation' AS item_type,
    accommodation_id AS item_id,
    name AS title,
    check_in AS start_time,
    check_out AS end_time,
    cost,
    status,
    TRUE AS is_fixed
FROM accommodations

UNION ALL

SELECT
    trip_id,
    'activity' AS item_type,
    slot_id AS item_id,
    title,
    start_time,
    end_time,
    NULL::decimal AS cost,
    NULL AS status,
    is_locked AS is_fixed
FROM itinerary_slots

ORDER BY start_time;


-- View: Budget vs Actual Spending
CREATE OR REPLACE VIEW vw_budget_vs_actual AS
SELECT
    b.trip_id,
    b.category,
    b.planned_amount AS planned,
    COALESCE(SUM(e.amount), 0) AS spent,
    b.planned_amount - COALESCE(SUM(e.amount), 0) AS remaining,
    CASE
        WHEN b.planned_amount > 0
        THEN ROUND((COALESCE(SUM(e.amount), 0) / b.planned_amount) * 100, 1)
        ELSE 0
    END AS utilization_pct
FROM budgets b
LEFT JOIN expenses e
    ON e.trip_id = b.trip_id AND e.category = b.category
GROUP BY b.trip_id, b.budget_id, b.category, b.planned_amount
ORDER BY b.category;


-- View: Member Settlement Summary
CREATE OR REPLACE VIEW vw_member_settlements AS
SELECT
    tm.trip_id,
    u.user_id,
    u.name,
    COALESCE(paid.total, 0) AS total_paid,
    COALESCE(owed.total, 0) AS total_owed,
    COALESCE(paid.total, 0) - COALESCE(owed.total, 0) AS net_balance
FROM trip_members tm
INNER JOIN users u ON u.user_id = tm.user_id
LEFT JOIN (
    SELECT paid_by AS user_id, trip_id, SUM(amount) AS total
    FROM expenses
    GROUP BY paid_by, trip_id
) paid ON paid.user_id = u.user_id AND paid.trip_id = tm.trip_id
LEFT JOIN (
    SELECT es.user_id, e.trip_id, SUM(es.share_amount) AS total
    FROM expense_splits es
    INNER JOIN expenses e ON e.expense_id = es.expense_id
    GROUP BY es.user_id, e.trip_id
) owed ON owed.user_id = u.user_id AND owed.trip_id = tm.trip_id
WHERE tm.status = 'active'
ORDER BY tm.trip_id, net_balance DESC;


-- ==========================================
-- TRIGGERS (Advanced Feature #2)
-- ==========================================

-- Trigger Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- Trigger Function: Validate that expense splits sum matches expense amount
CREATE OR REPLACE FUNCTION fn_validate_expense_splits()
RETURNS TRIGGER AS $$
DECLARE
    total_splits DECIMAL(12,2);
    expense_amount DECIMAL(12,2);
BEGIN
    SELECT SUM(share_amount) INTO total_splits
    FROM expense_splits WHERE expense_id = NEW.expense_id;

    SELECT amount INTO expense_amount
    FROM expenses WHERE expense_id = NEW.expense_id;

    -- Allow minor floating point differences (within 1 unit)
    IF total_splits IS NOT NULL AND ABS(total_splits - expense_amount) > 1 THEN
        RAISE WARNING 'Expense splits total (%) does not match expense amount (%)',
            total_splits, expense_amount;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_splits
    AFTER INSERT OR UPDATE ON expense_splits
    FOR EACH ROW EXECUTE FUNCTION fn_validate_expense_splits();


-- Trigger Function: Prevent overlapping transport for the same trip
CREATE OR REPLACE FUNCTION fn_check_transport_overlap()
RETURNS TRIGGER AS $$
DECLARE
    overlap_count INT;
BEGIN
    SELECT COUNT(*) INTO overlap_count
    FROM transports
    WHERE trip_id = NEW.trip_id
      AND transport_id != NEW.transport_id
      AND status != 'cancelled'
      AND departure_time < NEW.arrival_time
      AND arrival_time > NEW.departure_time;

    IF overlap_count > 0 THEN
        RAISE WARNING 'Transport schedule overlaps with % existing transport(s)', overlap_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_transport_overlap_check
    BEFORE INSERT OR UPDATE ON transports
    FOR EACH ROW EXECUTE FUNCTION fn_check_transport_overlap();


-- ==========================================
-- STORED FUNCTIONS (Advanced Feature #3)
-- ==========================================

-- Function: Get comprehensive trip budget summary
CREATE OR REPLACE FUNCTION fn_trip_budget_summary(p_trip_id INTEGER)
RETURNS TABLE(
    category VARCHAR,
    planned DECIMAL,
    spent DECIMAL,
    remaining DECIMAL,
    utilization_pct DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.category,
        b.planned_amount,
        COALESCE(SUM(e.amount), 0) AS spent,
        b.planned_amount - COALESCE(SUM(e.amount), 0) AS remaining,
        CASE
            WHEN b.planned_amount > 0
            THEN ROUND((COALESCE(SUM(e.amount), 0) / b.planned_amount) * 100, 1)
            ELSE 0::DECIMAL
        END AS utilization_pct
    FROM budgets b
    LEFT JOIN expenses e ON e.trip_id = b.trip_id AND e.category = b.category
    WHERE b.trip_id = p_trip_id
    GROUP BY b.category, b.planned_amount;
END;
$$ LANGUAGE plpgsql;


-- Function: Settle all expense splits for a given expense
CREATE OR REPLACE FUNCTION fn_settle_expense(p_expense_id INTEGER, p_payment_method VARCHAR DEFAULT 'cash')
RETURNS TABLE(
    settled_count INT,
    total_settled DECIMAL
) AS $$
DECLARE
    v_count INT := 0;
    v_total DECIMAL := 0;
BEGIN
    -- Mark all unsettled splits as settled
    UPDATE expense_splits
    SET is_settled = TRUE
    WHERE expense_id = p_expense_id AND is_settled = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    SELECT COALESCE(SUM(share_amount), 0) INTO v_total
    FROM expense_splits
    WHERE expense_id = p_expense_id AND is_settled = TRUE;

    settled_count := v_count;
    total_settled := v_total;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;


-- Function: Calculate trip statistics
CREATE OR REPLACE FUNCTION fn_trip_stats(p_trip_id INTEGER)
RETURNS TABLE(
    total_destinations INT,
    total_transports INT,
    total_accommodations INT,
    total_activities INT,
    total_expenses DECIMAL,
    total_members INT,
    trip_duration_days INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*)::INT FROM destinations WHERE trip_id = p_trip_id),
        (SELECT COUNT(*)::INT FROM transports WHERE trip_id = p_trip_id),
        (SELECT COUNT(*)::INT FROM accommodations WHERE trip_id = p_trip_id),
        (SELECT COUNT(*)::INT FROM itinerary_slots WHERE trip_id = p_trip_id),
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE trip_id = p_trip_id),
        (SELECT COUNT(*)::INT FROM trip_members WHERE trip_id = p_trip_id AND status = 'active'),
        (SELECT EXTRACT(DAY FROM (end_date - start_date))::INT FROM trips WHERE trip_id = p_trip_id);
END;
$$ LANGUAGE plpgsql;


-- ==========================================
-- INDEXES (Advanced Feature #4)
-- ==========================================

-- These complement the Prisma-generated indexes
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(trip_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_payments_expense ON payments(expense_id);
CREATE INDEX IF NOT EXISTS idx_destinations_trip ON destinations(trip_id, arrival_date);
CREATE INDEX IF NOT EXISTS idx_members_user ON trip_members(user_id);


-- ==========================================
-- SEED DATA
-- ==========================================

-- Users (passwords are bcrypt hash of "password123")
INSERT INTO users (name, email, password_hash, phone, status) VALUES
    ('Ronak', 'ronak@example.com', '$2a$12$LJ3dOZnlM2Rd0iKCk8FYVuCz7raU0Q8G7c9Q3yLJ7e5I6x0G7H9Hy', '9876543210', 'active'),
    ('Arjun', 'arjun@example.com', '$2a$12$LJ3dOZnlM2Rd0iKCk8FYVuCz7raU0Q8G7c9Q3yLJ7e5I6x0G7H9Hy', '9876543211', 'active'),
    ('Priya', 'priya@example.com', '$2a$12$LJ3dOZnlM2Rd0iKCk8FYVuCz7raU0Q8G7c9Q3yLJ7e5I6x0G7H9Hy', '9876543212', 'active')
ON CONFLICT (email) DO NOTHING;

-- Trip
INSERT INTO trips (trip_name, description, start_date, end_date, currency, status, created_by) VALUES
    ('Hampi Heritage Tour', 'A 4-day exploration of the ancient Vijayanagara Empire ruins and surrounding temples.', '2026-12-20', '2026-12-24', 'INR', 'planning', 1)
ON CONFLICT DO NOTHING;

-- Trip Members
INSERT INTO trip_members (trip_id, user_id, member_role, status) VALUES
    (1, 1, 'organizer', 'active'),
    (1, 2, 'member', 'active'),
    (1, 3, 'viewer', 'active')
ON CONFLICT DO NOTHING;

-- Destinations
INSERT INTO destinations (trip_id, name, location, arrival_date, departure_date, notes) VALUES
    (1, 'Bangalore', 'Bangalore, Karnataka', '2026-12-20', '2026-12-20', 'Starting point — depart by overnight bus'),
    (1, 'Hampi', 'Hampi, Bellary, Karnataka', '2026-12-21', '2026-12-23', 'Main destination — ancient ruins, temples, riverside'),
    (1, 'Hospet', 'Hospet, Karnataka', '2026-12-23', '2026-12-24', 'Nearest town to Hampi — return journey')
ON CONFLICT DO NOTHING;

-- Transport
INSERT INTO transports (trip_id, transport_type, provider, departure_destination_id, arrival_destination_id, departure_time, arrival_time, booking_reference, cost, status) VALUES
    (1, 'bus', 'KSRTC Airavat', 1, 2, '2026-12-20 22:00:00', '2026-12-21 05:30:00', 'KSRTC-HMP-1220', 850.00, 'confirmed'),
    (1, 'bus', 'KSRTC Airavat', 3, 1, '2026-12-23 22:00:00', '2026-12-24 05:30:00', 'KSRTC-BLR-1223', 850.00, 'confirmed')
ON CONFLICT DO NOTHING;

-- Accommodation
INSERT INTO accommodations (trip_id, destination_id, name, address, check_in, check_out, booking_reference, cost, status) VALUES
    (1, 2, 'Hampi Heritage Guest House', 'Near Virupaksha Temple, Hampi Bazaar', '2026-12-21 06:00:00', '2026-12-23 11:00:00', 'HMP-GH-2026', 3200.00, 'confirmed')
ON CONFLICT DO NOTHING;

-- Budget Categories
INSERT INTO budgets (trip_id, category, planned_amount, remarks) VALUES
    (1, 'transport', 2000.00, 'Bus tickets both ways'),
    (1, 'accommodation', 4000.00, 'Guest house for 2 nights'),
    (1, 'food', 3000.00, 'Meals for 4 days'),
    (1, 'activities', 1500.00, 'Entry tickets, guides'),
    (1, 'shopping', 1000.00, 'Souvenirs')
ON CONFLICT DO NOTHING;

-- Expenses
INSERT INTO expenses (trip_id, paid_by, category, amount, description, expense_date) VALUES
    (1, 1, 'transport', 1700.00, 'Bus tickets for 2 (both ways)', '2026-12-15'),
    (1, 1, 'accommodation', 3200.00, 'Guest house booking', '2026-12-15'),
    (1, 2, 'food', 450.00, 'Dinner at Mango Tree restaurant', '2026-12-21')
ON CONFLICT DO NOTHING;

-- Expense Splits
INSERT INTO expense_splits (expense_id, user_id, share_amount, is_settled) VALUES
    (1, 1, 850.00, FALSE),
    (1, 2, 850.00, FALSE),
    (2, 1, 1600.00, FALSE),
    (2, 2, 1600.00, FALSE),
    (3, 1, 225.00, FALSE),
    (3, 2, 225.00, FALSE)
ON CONFLICT DO NOTHING;

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================
-- Run these to verify the setup works:

-- SELECT * FROM vw_trip_timeline WHERE trip_id = 1;
-- SELECT * FROM vw_budget_vs_actual WHERE trip_id = 1;
-- SELECT * FROM vw_member_settlements WHERE trip_id = 1;
-- SELECT * FROM fn_trip_budget_summary(1);
-- SELECT * FROM fn_trip_stats(1);
