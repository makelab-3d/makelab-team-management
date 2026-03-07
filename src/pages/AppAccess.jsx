import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const APP_SLUGS = [
  { slug: 'team-management', label: 'Team Mgmt' },
  { slug: 'production-projects', label: 'Production' },
  { slug: 'holiday-hub', label: 'Holidays' },
  { slug: 'inventory', label: 'Inventory' },
  { slug: 'part-photos', label: 'Part Photos' },
  { slug: 'marketing-map', label: 'Mktg Map' },
  { slug: 'brand-bible', label: 'Brand Bible' },
  { slug: 'tools', label: 'Tools' },
  { slug: 'mission-control', label: 'Mission Ctrl' },
  { slug: 'huddle', label: 'Huddle' },
]

const ROLES = ['admin', 'manager', 'employee']

export default function AppAccess() {
  const { isAdmin, user } = useAuth()

  // Admin only
  if (!isAdmin) {
    return (
      <div className="card text-center mt-16">
        <h2>Access Denied</h2>
        <p className="text-muted">Only admins can manage app access.</p>
      </div>
    )
  }
  const [employees, setEmployees] = useState([])
  const [permissions, setPermissions] = useState([])
  const [defaults, setDefaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [tab, setTab] = useState('users')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isAdmin) loadData()
  }, [isAdmin])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch('/.netlify/functions/manage-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'get_all' }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }
      setEmployees(data.employees || [])
      setPermissions(data.permissions || [])
      setDefaults(data.defaults || [])
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  function getEffectiveAccess(emp, slug) {
    const override = permissions.find(p => p.employee_id === emp.id && p.app_slug === slug)
    if (override) return { access: override.has_access, isOverride: true }
    const roleDef = defaults.find(d => d.role === (emp.role || 'employee') && d.app_slug === slug)
    return { access: roleDef?.has_access ?? false, isOverride: false }
  }

  function getRoleDefault(role, slug) {
    const d = defaults.find(d => d.role === role && d.app_slug === slug)
    return d?.has_access ?? false
  }

  async function apiCall(body) {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    await fetch('/.netlify/functions/manage-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  }

  async function togglePermission(emp, slug) {
    const key = `${emp.id}-${slug}`
    setSaving(key)
    const { access, isOverride } = getEffectiveAccess(emp, slug)

    // Set explicit override with toggled value
    await apiCall({ action: 'set_permission', employee_id: emp.id, app_slug: slug, has_access: !access })

    // Update local state
    setPermissions(prev => {
      const filtered = prev.filter(p => !(p.employee_id === emp.id && p.app_slug === slug))
      return [...filtered, { employee_id: emp.id, app_slug: slug, has_access: !access }]
    })
    setSaving(null)
  }

  async function clearOverride(emp, slug) {
    const key = `${emp.id}-${slug}`
    setSaving(key)
    await apiCall({ action: 'remove_permission', employee_id: emp.id, app_slug: slug })
    setPermissions(prev => prev.filter(p => !(p.employee_id === emp.id && p.app_slug === slug)))
    setSaving(null)
  }

  async function toggleRoleDefault(role, slug) {
    const key = `${role}-${slug}`
    setSaving(key)
    const current = getRoleDefault(role, slug)
    await apiCall({ action: 'set_role_default', role, app_slug: slug, has_access: !current })
    setDefaults(prev => {
      const filtered = prev.filter(d => !(d.role === role && d.app_slug === slug))
      return [...filtered, { role, app_slug: slug, has_access: !current }]
    })
    setSaving(null)
  }

  if (!isAdmin) {
    return <div className="page-message"><p>Admin access required.</p></div>
  }

  if (loading) {
    return <div className="page-message"><div className="loading-spinner" /></div>
  }

  if (error) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Error Loading Access Data</h2>
        <p style={{ color: '#888', marginBottom: 16, fontSize: 14 }}>{error}</p>
        <button className="btn btn-primary btn-sm" onClick={loadData}>Retry</button>
      </div>
    )
  }

  const activeEmployees = employees.filter(e => e.is_active !== false)

  return (
    <div style={{ padding: '16px 0' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>App Access</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Manage which apps each team member can access.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[{ id: 'users', label: 'Per User' }, { id: 'roles', label: 'Role Defaults' }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 400,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              position: 'relative',
              borderBottom: tab === t.id ? '2px solid #ffcc00' : '2px solid transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Role</th>
                {APP_SLUGS.map(a => (
                  <th key={a.slug} style={{ ...thStyle, textAlign: 'center', minWidth: 70 }}>{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map(emp => (
                <tr key={emp.id}>
                  <td style={tdStyle}>{emp.full_name}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
                      {emp.role || 'employee'}
                    </span>
                  </td>
                  {APP_SLUGS.map(a => {
                    const { access, isOverride } = getEffectiveAccess(emp, a.slug)
                    const key = `${emp.id}-${a.slug}`
                    const isSaving = saving === key
                    const isAdminRole = emp.role === 'admin'
                    return (
                      <td key={a.slug} style={{ ...tdStyle, textAlign: 'center', position: 'relative' }}>
                        <button
                          onClick={() => !isAdminRole && togglePermission(emp, a.slug)}
                          disabled={isSaving || isAdminRole}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: isOverride ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: access ? (isOverride ? 'var(--accent-light)' : 'rgba(34, 197, 94, 0.15)') : 'var(--bg-card)',
                            cursor: isAdminRole ? 'default' : 'pointer',
                            fontSize: 14,
                            opacity: isSaving ? 0.5 : 1,
                          }}
                          title={isAdminRole ? 'Admins have full access' : isOverride ? 'Per-user override (click to toggle, right-click to reset)' : 'Using role default (click to override)'}
                          onContextMenu={e => {
                            e.preventDefault()
                            if (isOverride && !isAdminRole) clearOverride(emp, a.slug)
                          }}
                        >
                          {access ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            Gold border = per-user override. Right-click to reset to role default.
          </p>
        </div>
      )}

      {tab === 'roles' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Role</th>
                {APP_SLUGS.map(a => (
                  <th key={a.slug} style={{ ...thStyle, textAlign: 'center', minWidth: 70 }}>{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map(role => (
                <tr key={role}>
                  <td style={tdStyle}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 500, color: 'var(--text)' }}>{role}</span>
                  </td>
                  {APP_SLUGS.map(a => {
                    const access = getRoleDefault(role, a.slug)
                    const key = `${role}-${a.slug}`
                    const isSaving = saving === key
                    const isAdminRole = role === 'admin'
                    return (
                      <td key={a.slug} style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => toggleRoleDefault(role, a.slug)}
                          disabled={isSaving}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid #ddd',
                            background: access ? '#e8f5e9' : '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                            opacity: isSaving ? 0.5 : 1,
                          }}
                        >
                          {access ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            These are the default permissions for each role. Per-user overrides take priority.
          </p>
        </div>
      )}
    </div>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: 'var(--text-muted)',
}

const tdStyle = {
  padding: '10px 10px',
  borderBottom: '1px solid var(--border)',
}
