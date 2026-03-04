-- ============================================================
-- Migration: App-level access control
-- Run this in your Supabase SQL editor
-- Adds per-user app permissions + role-based defaults
-- ============================================================

-- 1. APP PERMISSIONS (per-user overrides)
CREATE TABLE IF NOT EXISTS app_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  app_slug    TEXT NOT NULL,
  has_access  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, app_slug)
);

CREATE INDEX IF NOT EXISTS idx_app_permissions_employee ON app_permissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_app_permissions_slug ON app_permissions(app_slug);

ALTER TABLE app_permissions ENABLE ROW LEVEL SECURITY;

-- Employees can read their own permissions
CREATE POLICY "app_perms_read_own" ON app_permissions
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employees WHERE auth_id = auth.uid())
  );

-- 2. ROLE APP DEFAULTS (role-based fallback)
CREATE TABLE IF NOT EXISTS role_app_defaults (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role       TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  app_slug   TEXT NOT NULL,
  has_access BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (role, app_slug)
);

ALTER TABLE role_app_defaults ENABLE ROW LEVEL SECURITY;

-- Everyone can read role defaults
CREATE POLICY "role_defaults_read" ON role_app_defaults
  FOR SELECT USING (true);

-- 3. SEED ROLE DEFAULTS

-- Admin gets everything
INSERT INTO role_app_defaults (role, app_slug, has_access) VALUES
  ('admin', 'team-management', true),
  ('admin', 'production-projects', true),
  ('admin', 'holiday-hub', true),
  ('admin', 'inventory', true),
  ('admin', 'part-photos', true),
  ('admin', 'marketing-map', true),
  ('admin', 'brand-bible', true),
  ('admin', 'tools', true)
ON CONFLICT (role, app_slug) DO NOTHING;

-- Manager gets most apps
INSERT INTO role_app_defaults (role, app_slug, has_access) VALUES
  ('manager', 'team-management', true),
  ('manager', 'production-projects', true),
  ('manager', 'holiday-hub', true),
  ('manager', 'inventory', true),
  ('manager', 'part-photos', true),
  ('manager', 'tools', true),
  ('manager', 'marketing-map', false),
  ('manager', 'brand-bible', false)
ON CONFLICT (role, app_slug) DO NOTHING;

-- Employee gets basics
INSERT INTO role_app_defaults (role, app_slug, has_access) VALUES
  ('employee', 'team-management', true),
  ('employee', 'holiday-hub', true),
  ('employee', 'tools', true),
  ('employee', 'production-projects', false),
  ('employee', 'inventory', false),
  ('employee', 'part-photos', false),
  ('employee', 'marketing-map', false),
  ('employee', 'brand-bible', false)
ON CONFLICT (role, app_slug) DO NOTHING;
