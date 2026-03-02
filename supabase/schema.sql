-- ============================================================
-- Makelab Time Tracking — Database Schema
-- Run this in your Supabase SQL editor (in order)
-- ============================================================

-- 1. EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  pay_type    TEXT NOT NULL DEFAULT 'W2' CHECK (pay_type IN ('W2', '1099')),
  rate        NUMERIC(10,2) NOT NULL,
  method      TEXT DEFAULT 'direct_deposit',
  slack_user_id TEXT,
  schedule    JSONB DEFAULT '{"days":[1,2,3,4,5],"start_time":"09:00","end_time":"17:00"}',
  department  TEXT DEFAULT 'General',
  employee_type TEXT NOT NULL DEFAULT 'hourly'
                CHECK (employee_type IN ('hourly', 'salary', 'contract', 'intern')),
  fixed_amount NUMERIC(10,2),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_auth_id ON employees(auth_id);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

-- 2. PAY PERIODS
CREATE TABLE IF NOT EXISTS pay_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date  DATE NOT NULL UNIQUE,
  end_date    DATE NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'closed')),
  locked_at   TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_periods_status ON pay_periods(status);
CREATE INDEX IF NOT EXISTS idx_pay_periods_dates ON pay_periods(start_date, end_date);

-- 3. TIME ENTRIES
CREATE TABLE IF NOT EXISTS time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_id   UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  work_date       DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  break_minutes   INTEGER NOT NULL DEFAULT 0,
  gross_hours     NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_hours       NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_employee_date UNIQUE (employee_id, work_date),
  CONSTRAINT chk_end_after_start CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_period ON time_entries(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(work_date);

-- 4. TIMESHEET SUMMARIES
CREATE TABLE IF NOT EXISTS timesheet_summaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employees(id),
  pay_period_id     UUID NOT NULL REFERENCES pay_periods(id),
  total_hours       NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_days        INTEGER NOT NULL DEFAULT 0,
  rate_used         NUMERIC(10,2) NOT NULL,
  gross_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'synced')),
  payroll_record_id UUID,
  approved_at       TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_employee_period UNIQUE (employee_id, pay_period_id)
);
