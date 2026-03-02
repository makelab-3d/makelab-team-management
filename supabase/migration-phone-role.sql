-- Migration: Add phone_number, role, and title columns to employees
-- Run this in your Supabase SQL editor

-- Phone number (optional)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Role: admin, manager, employee (default)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee'
  CHECK (role IN ('admin', 'manager', 'employee'));

-- Title (already used in UI, may not be in table yet)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title TEXT;

-- Set Christina as admin
UPDATE employees SET role = 'admin' WHERE email = 'christina@makelab.com';

-- Manager can update employees (schedule, details — NOT pay, handled in frontend)
DROP POLICY IF EXISTS "manager_update_employees" ON employees;
CREATE POLICY "manager_update_employees" ON employees
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_id = auth.uid() AND e.role = 'manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_id = auth.uid() AND e.role = 'manager'
    )
  );
