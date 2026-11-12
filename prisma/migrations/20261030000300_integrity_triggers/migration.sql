-- =====================================================================
-- Migration 0003 — Integrity triggers & functions (database-level rules)
-- Errors raised here use the prefix  TS_<RULE>:  so the API layer can turn
-- them into friendly messages instead of leaking raw database errors.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. updated_at maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_trips_updated_at BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_activity_embeddings_updated_at BEFORE UPDATE ON activity_embeddings FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. A trip must always keep at least one active organizer
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_guard_last_organizer() RETURNS trigger AS $$
BEGIN
    IF OLD.member_role = 'organizer' AND OLD.status = 'active'
       AND (TG_OP = 'DELETE' OR NEW.member_role <> 'organizer' OR NEW.status <> 'active') THEN
        -- When the whole trip is being deleted the cascade must be allowed.
        IF NOT EXISTS (SELECT 1 FROM trips WHERE trip_id = OLD.trip_id) THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM trip_members
            WHERE trip_id = OLD.trip_id AND user_id <> OLD.user_id
              AND member_role = 'organizer' AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'TS_LAST_ORGANIZER: a trip must keep at least one organizer';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_last_organizer
    BEFORE UPDATE OR DELETE ON trip_members
    FOR EACH ROW EXECUTE FUNCTION fn_guard_last_organizer();

-- ---------------------------------------------------------------------
-- 3. Everything scheduled must fall inside the trip dates
--    (destinations, transports, accommodations, itinerary slots)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_enforce_trip_window() RETURNS trigger AS $$
DECLARE
    t_start DATE;
    t_end   DATE;
    s       TIMESTAMP;
    e       TIMESTAMP;
BEGIN
    SELECT start_date, end_date INTO t_start, t_end FROM trips WHERE trip_id = NEW.trip_id;
    IF NOT FOUND THEN
        RETURN NEW;  -- the foreign key reports the missing trip
    END IF;

    IF TG_TABLE_NAME = 'destinations' THEN
        s := NEW.arrival_date::timestamp;
        e := (NEW.departure_date + 1)::timestamp;
    ELSIF TG_TABLE_NAME = 'transports' THEN
        s := NEW.departure_time;
        e := NEW.arrival_time;
    ELSIF TG_TABLE_NAME = 'accommodations' THEN
        s := NEW.check_in;
        e := NEW.check_out;
    ELSE  -- itinerary_slots
        s := NEW.start_time;
        e := NEW.end_time;
    END IF;

    IF s < t_start::timestamp OR e > (t_end + 1)::timestamp THEN
        RAISE EXCEPTION 'TS_OUTSIDE_TRIP_WINDOW: % is outside the trip dates (% to %)', TG_TABLE_NAME, t_start, t_end;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_destinations_window     BEFORE INSERT OR UPDATE ON destinations     FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window();
CREATE TRIGGER trg_transports_window       BEFORE INSERT OR UPDATE ON transports       FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window();
CREATE TRIGGER trg_accommodations_window   BEFORE INSERT OR UPDATE ON accommodations   FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window();
CREATE TRIGGER trg_itinerary_slots_window  BEFORE INSERT OR UPDATE ON itinerary_slots  FOR EACH ROW EXECUTE FUNCTION fn_enforce_trip_window();

-- Shrinking a trip may not orphan anything that is already scheduled.
CREATE OR REPLACE FUNCTION fn_guard_trip_shrink() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM destinations WHERE trip_id = NEW.trip_id AND (arrival_date < NEW.start_date OR departure_date > NEW.end_date))
       OR EXISTS (SELECT 1 FROM transports WHERE trip_id = NEW.trip_id AND (departure_time < NEW.start_date::timestamp OR arrival_time > (NEW.end_date + 1)::timestamp))
       OR EXISTS (SELECT 1 FROM accommodations WHERE trip_id = NEW.trip_id AND (check_in < NEW.start_date::timestamp OR check_out > (NEW.end_date + 1)::timestamp))
       OR EXISTS (SELECT 1 FROM itinerary_slots WHERE trip_id = NEW.trip_id AND (start_time < NEW.start_date::timestamp OR end_time > (NEW.end_date + 1)::timestamp))
    THEN
        RAISE EXCEPTION 'TS_TRIP_SHRINK: new trip dates would leave scheduled items outside the trip';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trips_guard_shrink
    BEFORE UPDATE OF start_date, end_date ON trips
    FOR EACH ROW WHEN (OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.end_date IS DISTINCT FROM NEW.end_date)
    EXECUTE FUNCTION fn_guard_trip_shrink();

-- ---------------------------------------------------------------------
-- 4. An activity's destination must belong to the same trip
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_slot_destination_same_trip() RETURNS trigger AS $$
BEGIN
    IF NEW.destination_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM destinations WHERE destination_id = NEW.destination_id AND trip_id = NEW.trip_id
    ) THEN
        RAISE EXCEPTION 'TS_DESTINATION_TRIP_MISMATCH: destination does not belong to this trip';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_slot_destination_same_trip
    BEFORE INSERT OR UPDATE OF destination_id, trip_id ON itinerary_slots
    FOR EACH ROW EXECUTE FUNCTION fn_slot_destination_same_trip();

-- ---------------------------------------------------------------------
-- 5. Expense integrity: payer / split members must be active trip members;
--    the payer's own share is settled by definition.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expense_payer_is_member() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = NEW.trip_id AND user_id = NEW.paid_by AND status = 'active') THEN
        RAISE EXCEPTION 'TS_NOT_A_MEMBER: payer is not an active member of this trip';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_payer_is_member
    BEFORE INSERT OR UPDATE OF paid_by, trip_id ON expenses
    FOR EACH ROW EXECUTE FUNCTION fn_expense_payer_is_member();

CREATE OR REPLACE FUNCTION fn_split_member_check() RETURNS trigger AS $$
DECLARE
    v_trip  INTEGER;
    v_payer INTEGER;
BEGIN
    SELECT trip_id, paid_by INTO v_trip, v_payer FROM expenses WHERE expense_id = NEW.expense_id;
    IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_trip AND user_id = NEW.user_id AND status = 'active') THEN
        RAISE EXCEPTION 'TS_NOT_A_MEMBER: split user is not an active member of this trip';
    END IF;
    IF NEW.user_id = v_payer THEN
        NEW.is_settled := TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_split_member_check
    BEFORE INSERT OR UPDATE OF user_id, expense_id ON expense_splits
    FOR EACH ROW EXECUTE FUNCTION fn_split_member_check();

-- ---------------------------------------------------------------------
-- 6. Splits must add up EXACTLY to the expense amount.
--    A DEFERRED constraint trigger checks at COMMIT, so an expense and its
--    splits can be inserted in any order inside one transaction.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expense_splits_sum() RETURNS trigger AS $$
DECLARE
    v_id     INTEGER;
    v_amount NUMERIC(12,2);
    v_sum    NUMERIC(12,2);
    v_count  INTEGER;
BEGIN
    v_id := COALESCE(NEW.expense_id, OLD.expense_id);
    SELECT amount INTO v_amount FROM expenses WHERE expense_id = v_id;
    IF NOT FOUND THEN
        RETURN NULL;  -- expense deleted (cascade)
    END IF;
    SELECT COALESCE(SUM(share_amount), 0), COUNT(*) INTO v_sum, v_count FROM expense_splits WHERE expense_id = v_id;
    IF v_count > 0 AND v_sum <> v_amount THEN
        RAISE EXCEPTION 'TS_SPLIT_SUM: splits total % but the expense amount is %', v_sum, v_amount;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_expense_splits_sum
    AFTER INSERT OR UPDATE OR DELETE ON expense_splits
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_expense_splits_sum();

CREATE CONSTRAINT TRIGGER trg_expense_amount_matches_splits
    AFTER UPDATE OF amount ON expenses
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_expense_splits_sum();
