-- ============================================================
-- Makelab Time Tracking — Triggers
-- Run AFTER schema.sql
-- ============================================================

-- 1. Auto-compute break and hours on time_entries insert/update
CREATE OR REPLACE FUNCTION compute_time_entry_hours()
RETURNS TRIGGER AS $$
BEGIN
  NEW.gross_hours := ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0, 2);

  -- Auto-deduct 1 hour lunch if shift > 6 hours
  IF NEW.gross_hours > 6 THEN
    NEW.break_minutes := 60;
  ELSE
    NEW.break_minutes := 0;
  END IF;

  NEW.net_hours := ROUND(NEW.gross_hours - (NEW.break_minutes / 60.0), 2);
  NEW.updated_at := now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_hours ON time_entries;
CREATE TRIGGER trg_compute_hours
  BEFORE INSERT OR UPDATE OF start_time, end_time
  ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION compute_time_entry_hours();

-- 2. Validate work_date falls within pay period
CREATE OR REPLACE FUNCTION validate_work_date_in_period()
RETURNS TRIGGER AS $$
DECLARE
  pp_start DATE;
  pp_end   DATE;
BEGIN
  SELECT start_date, end_date INTO pp_start, pp_end
  FROM pay_periods WHERE id = NEW.pay_period_id;

  IF NEW.work_date < pp_start OR NEW.work_date > pp_end THEN
    RAISE EXCEPTION 'work_date % is outside pay period % to %',
      NEW.work_date, pp_start, pp_end;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_work_date ON time_entries;
CREATE TRIGGER trg_validate_work_date
  BEFORE INSERT OR UPDATE OF work_date, pay_period_id
  ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION validate_work_date_in_period();

-- 3. Prevent edits when pay period is closed
CREATE OR REPLACE FUNCTION prevent_edit_locked_period()
RETURNS TRIGGER AS $$
DECLARE
  pp_status TEXT;
  pp_id UUID;
BEGIN
  -- For DELETE, use OLD; for INSERT/UPDATE, use NEW
  pp_id := COALESCE(NEW.pay_period_id, OLD.pay_period_id);

  SELECT status INTO pp_status
  FROM pay_periods WHERE id = pp_id;

  IF pp_status = 'closed' THEN
    RAISE EXCEPTION 'Cannot modify time entries for a closed pay period';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_edits ON time_entries;
CREATE TRIGGER trg_prevent_locked_edits
  BEFORE INSERT OR UPDATE OR DELETE
  ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_edit_locked_period();

-- 4. Generate biweekly pay periods
CREATE OR REPLACE FUNCTION generate_pay_periods(
  p_start DATE,
  p_count INTEGER DEFAULT 26
)
RETURNS void AS $$
DECLARE
  i INTEGER;
  period_start DATE;
  period_end DATE;
BEGIN
  FOR i IN 0..(p_count - 1) LOOP
    period_start := p_start + (i * 14);
    period_end := period_start + 13;

    INSERT INTO pay_periods (start_date, end_date, status)
    VALUES (period_start, period_end,
            CASE WHEN period_end < CURRENT_DATE THEN 'closed' ELSE 'open' END)
    ON CONFLICT (start_date) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Example: Generate 2026 pay periods starting Monday Jan 5
-- SELECT generate_pay_periods('2026-01-05', 26);
