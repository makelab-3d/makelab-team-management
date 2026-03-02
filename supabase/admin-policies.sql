-- ============================================================
-- Admin + Auth RLS policies
-- Run AFTER rls.sql
-- ============================================================

-- Drop existing policies first (safe to run if they don't exist)
DROP POLICY IF EXISTS "employees_read_by_email" ON employees;
DROP POLICY IF EXISTS "employees_update_own_auth_id" ON employees;
DROP POLICY IF EXISTS "admin_read_all_employees" ON employees;
DROP POLICY IF EXISTS "admin_read_all_time_entries" ON time_entries;
DROP POLICY IF EXISTS "admin_read_all_summaries" ON timesheet_summaries;

-- Allow employees to find their own row by email (for auth_id auto-linking)
-- This is needed because new employees may not have auth_id set yet
CREATE POLICY "employees_read_by_email" ON employees
  FOR SELECT USING (
    email = auth.jwt()->>'email'
  );

-- Allow employees to update their own auth_id (for auto-linking)
CREATE POLICY "employees_update_own_auth_id" ON employees
  FOR UPDATE USING (
    email = auth.jwt()->>'email'
  )
  WITH CHECK (
    email = auth.jwt()->>'email'
  );

-- All authenticated users can read employees (for schedule view)
CREATE POLICY "employees_read_all_authenticated" ON employees
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- Admin can read ALL employees (kept for explicitness, above policy covers this)
CREATE POLICY "admin_read_all_employees" ON employees
  FOR SELECT USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );

-- Admin can read ALL time entries
CREATE POLICY "admin_read_all_time_entries" ON time_entries
  FOR SELECT USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );

-- Admin can read ALL timesheet summaries
CREATE POLICY "admin_read_all_summaries" ON timesheet_summaries
  FOR SELECT USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );

-- Admin can read pay periods
DROP POLICY IF EXISTS "admin_read_pay_periods" ON pay_periods;
CREATE POLICY "admin_read_pay_periods" ON pay_periods
  FOR SELECT USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );

-- Admin can update pay periods (close/reopen)
DROP POLICY IF EXISTS "admin_update_pay_periods" ON pay_periods;
CREATE POLICY "admin_update_pay_periods" ON pay_periods
  FOR UPDATE USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  )
  WITH CHECK (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );

-- Admin can update ALL employees (edit info from Employees page)
DROP POLICY IF EXISTS "admin_update_all_employees" ON employees;
CREATE POLICY "admin_update_all_employees" ON employees
  FOR UPDATE USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );

-- Admin can update ALL time entries (override hours from timesheet view)
DROP POLICY IF EXISTS "admin_update_all_time_entries" ON time_entries;
CREATE POLICY "admin_update_all_time_entries" ON time_entries
  FOR UPDATE USING (
    auth.jwt()->>'email' = 'christina@makelab.com'
  );
