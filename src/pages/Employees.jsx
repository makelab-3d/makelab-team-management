import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' }
const EMP_TYPES = ['hourly', 'salary', 'contract', 'intern']

export default function Employees() {
  const { isAdmin, isManager } = useAuth()
  const canSeePay = isAdmin // managers cannot see pay info
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [message, setMessage] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(getBlankAddForm())
  const [adding, setAdding] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState(null)
  const [resetPassword, setResetPassword] = useState(null) // { name, password }

  function getBlankAddForm() {
    return {
      full_name: '',
      email: '',
      phone_number: '',
      title: '',
      employee_type: 'hourly',
      rate: '',
      fixed_amount: '',
      pay_type: 'W2',
      department: 'General',
      tracks_hours: true,
      schedule_days: new Set([1, 2, 3, 4, 5]),
      schedule_start: '09:00',
      schedule_end: '17:00',
    }
  }

  const fetchEmployees = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .order('full_name', { ascending: true })
    setEmployees(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  // --- Add employee ---
  function toggleAddDay(dayNum) {
    const next = new Set(addForm.schedule_days)
    if (next.has(dayNum)) next.delete(dayNum)
    else next.add(dayNum)
    setAddForm({ ...addForm, schedule_days: next })
  }

  async function handleAdd() {
    setAdding(true)
    setMessage(null)
    setGeneratedPassword(null)
    try {
      const token = await getAuthToken()
      const schedule = {
        days: Array.from(addForm.schedule_days).sort((a, b) => a - b),
        start_time: addForm.schedule_start,
        end_time: addForm.schedule_end,
      }
      const res = await fetch('/.netlify/functions/create-employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: addForm.full_name,
          email: addForm.email,
          phone_number: addForm.phone_number || null,
          title: addForm.title || null,
          employee_type: addForm.employee_type,
          rate: addForm.employee_type === 'hourly' ? addForm.rate : 0,
          fixed_amount: ['salary', 'contract'].includes(addForm.employee_type) ? addForm.fixed_amount : null,
          pay_type: addForm.pay_type,
          department: addForm.department,
          tracks_hours: addForm.tracks_hours,
          schedule,
        }),
      })
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status}). Make sure you're running with 'netlify dev' and env vars are set.`)
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create employee')
      setGeneratedPassword({ password: data.password, sent: data.sent })
      const sentVia = [data.sent?.email && 'email', data.sent?.slack && 'Slack'].filter(Boolean).join(' + ')
      setMessage({ type: 'success', text: `${addForm.full_name} created${sentVia ? ` — credentials sent via ${sentVia}` : ''}` })
      setAddForm(getBlankAddForm())
      fetchEmployees()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setAdding(false)
    }
  }

  // --- Reset password ---
  async function handleResetPassword(emp) {
    setResetPassword(null)
    setMessage(null)
    try {
      const token = await getAuthToken()
      const res = await fetch('/.netlify/functions/create-employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'reset_password', employee_id: emp.id }),
      })
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status}). Make sure you're running with 'netlify dev' and env vars are set.`)
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset password')
      const sentVia = [data.sent?.email && 'email', data.sent?.slack && 'Slack'].filter(Boolean).join(' + ')
      setResetPassword({ name: emp.full_name, password: data.password, sent: data.sent })
      if (sentVia) setMessage({ type: 'success', text: `New password sent to ${emp.full_name} via ${sentVia}` })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  // --- Edit employee ---
  function startEdit(emp) {
    const sched = emp.schedule || DEFAULT_SCHEDULE
    setEditing(emp.id)
    setForm({
      full_name: emp.full_name || '',
      email: emp.email || '',
      phone_number: emp.phone_number || '',
      title: emp.title || '',
      rate: emp.rate || '',
      pay_type: emp.pay_type || 'W2',
      is_active: emp.is_active !== false,
      tracks_hours: emp.tracks_hours !== false,
      employee_type: emp.employee_type || 'hourly',
      department: emp.department || 'General',
      fixed_amount: emp.fixed_amount || '',
      schedule_days: new Set(sched.days || [1, 2, 3, 4, 5]),
      schedule_start: sched.start_time || '09:00',
      schedule_end: sched.end_time || '17:00',
    })
    setMessage(null)
  }

  function cancelEdit() {
    setEditing(null)
    setForm({})
    setMessage(null)
  }

  function toggleDay(dayNum) {
    const next = new Set(form.schedule_days)
    if (next.has(dayNum)) next.delete(dayNum)
    else next.add(dayNum)
    setForm({ ...form, schedule_days: next })
  }

  async function saveEdit(empId) {
    setMessage(null)
    try {
      const schedule = {
        days: Array.from(form.schedule_days).sort((a, b) => a - b),
        start_time: form.schedule_start,
        end_time: form.schedule_end,
      }
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: form.full_name,
          email: form.email,
          phone_number: form.phone_number || null,
          title: form.title || null,
          rate: Number(form.rate) || 0,
          pay_type: form.pay_type,
          is_active: form.is_active,
          tracks_hours: form.tracks_hours,
          employee_type: form.employee_type,
          department: form.department,
          fixed_amount: ['salary', 'contract'].includes(form.employee_type) ? Number(form.fixed_amount) || null : null,
          schedule,
        })
        .eq('id', empId)
      if (error) throw error
      setMessage({ type: 'success', text: 'Saved' })
      setEditing(null)
      fetchEmployees()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  if (loading) {
    return <div className="text-center mt-16"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
  }

  const active = employees.filter(e => e.is_active !== false)
  const inactive = employees.filter(e => e.is_active === false)

  function formatScheduleBrief(emp) {
    const sched = emp.schedule || DEFAULT_SCHEDULE
    const dayLetters = (sched.days || []).map(d => DAY_LABELS[d]?.[0]).join('')
    return `${dayLetters} ${sched.start_time || '09:00'}-${sched.end_time || '17:00'}`
  }

  function renderPayInfo(emp) {
    const type = emp.employee_type || 'hourly'
    if (type === 'hourly') return `$${Number(emp.rate || 0).toFixed(2)}/hr`
    if (type === 'salary' || type === 'contract') return emp.fixed_amount ? `$${Number(emp.fixed_amount).toFixed(2)}/period` : 'fixed'
    return '' // intern
  }

  // Shared schedule editor JSX
  function renderScheduleEditor(days, start, end, onToggle, onStartChange, onEndChange) {
    return (
      <div style={{ marginBottom: 8 }}>
        <label className="input-label">Schedule</label>
        <div className="schedule-editor">
          <div className="schedule-days-row">
            {DAY_LABELS.map((label, i) => (
              <button key={label} type="button" className={`schedule-day-chip ${days?.has(i) ? 'active' : ''}`} onClick={() => onToggle(i)}>
                {label}
              </button>
            ))}
          </div>
          <div className="input-row" style={{ marginTop: 8 }}>
            <div>
              <label className="input-label">Start</label>
              <input type="time" className="input" value={start} onChange={e => onStartChange(e.target.value)} />
            </div>
            <div>
              <label className="input-label">End</label>
              <input type="time" className="input" value={end} onChange={e => onEndChange(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderEmpList(title, list) {
    return (
      <div className="card mt-12">
        <div className="card-title">{title}</div>
        {list.length === 0 ? (
          <p className="text-muted text-center">None.</p>
        ) : list.map(emp => (
          <div key={emp.id} className="admin-emp-row">
            {editing === emp.id ? (
              <div className="edit-form">
                <div className="input-row" style={{ marginBottom: 8 }}>
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="input-label">Email</label>
                    <input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="input-row" style={{ marginBottom: 8 }}>
                  <div>
                    <label className="input-label">Phone</label>
                    <input className="input" type="tel" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="555-123-4567" />
                  </div>
                  <div>
                    <label className="input-label">Title</label>
                    <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Production Tech, Designer" />
                  </div>
                </div>
                <div className="input-row" style={{ marginBottom: 8 }}>
                  <div>
                    <label className="input-label">Type</label>
                    <select className="input" value={form.employee_type} onChange={e => setForm({ ...form, employee_type: e.target.value })}>
                      {EMP_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Department</label>
                    <input className="input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
                  </div>
                </div>
                {canSeePay && (
                  <div className="input-row" style={{ marginBottom: 8 }}>
                    {form.employee_type === 'hourly' && (
                      <div>
                        <label className="input-label">Rate ($/hr)</label>
                        <input className="input" type="number" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
                      </div>
                    )}
                    {['salary', 'contract'].includes(form.employee_type) && (
                      <div>
                        <label className="input-label">Fixed Amount ($/period)</label>
                        <input className="input" type="number" step="0.01" value={form.fixed_amount} onChange={e => setForm({ ...form, fixed_amount: e.target.value })} />
                      </div>
                    )}
                    <div>
                      <label className="input-label">Pay Type</label>
                      <select className="input" value={form.pay_type} onChange={e => setForm({ ...form, pay_type: e.target.value })}>
                        <option value="W2">W2</option>
                        <option value="1099">1099</option>
                      </select>
                    </div>
                  </div>
                )}
                {canSeePay && (
                  <div className="input-row" style={{ marginBottom: 8 }}>
                    <div>
                      <label className="input-label">Status</label>
                      <select className="input" value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div>
                      <label className="input-label">Tracks Hours</label>
                      <select className="input" value={form.tracks_hours ? 'yes' : 'no'} onChange={e => setForm({ ...form, tracks_hours: e.target.value === 'yes' })}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  </div>
                )}
                {renderScheduleEditor(
                  form.schedule_days, form.schedule_start, form.schedule_end,
                  toggleDay,
                  v => setForm({ ...form, schedule_start: v }),
                  v => setForm({ ...form, schedule_end: v }),
                )}
                <div className="edit-actions">
                  {canSeePay && <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(emp)}>Reset Password</button>}
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(emp.id)}>Save</button>
                </div>
              </div>
            ) : (
              <div className="admin-emp-row-main" onClick={() => startEdit(emp)}>
                <div>
                  <div className="admin-emp-name">
                    {emp.full_name}
                    {emp.title && <span className="admin-emp-title-pill">{emp.title}</span>}
                    <span className={`emp-type-badge ${emp.employee_type || 'hourly'}`}>
                      {emp.employee_type || 'hourly'}
                    </span>
                    {emp.tracks_hours === false && (
                      <span className="emp-type-badge" style={{ background: '#666', color: '#fff' }}>no time tracking</span>
                    )}
                  </div>
                  <div className="admin-emp-meta">
                    {emp.email}{emp.phone_number ? ` \u00b7 ${emp.phone_number}` : ''}
                    {canSeePay && <> &middot; {renderPayInfo(emp)} &middot; {emp.pay_type || 'W2'}</>}
                  </div>
                  <div className="admin-emp-meta">
                    {emp.department || 'General'} &middot; {formatScheduleBrief(emp)}
                  </div>
                </div>
                <span className={`admin-emp-status ${emp.is_active !== false ? 'active' : 'inactive'}`}>
                  {emp.is_active !== false ? 'active' : 'inactive'}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="admin-kpis">
        <div className="admin-kpi">
          <div className="admin-kpi-value">{employees.length}</div>
          <div className="admin-kpi-label">Total</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-value">{active.length}</div>
          <div className="admin-kpi-label">Active</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-value">{inactive.length}</div>
          <div className="admin-kpi-label">Inactive</div>
        </div>
      </div>

      {message && (
        <div className={`toast ${message.type}`} style={{ marginTop: 12 }}>
          {message.text}
        </div>
      )}

      {/* Password display boxes (admin only) */}
      {canSeePay && generatedPassword && (
        <div className="password-box mt-12">
          <div className="password-box-label">
            New employee password{generatedPassword.sent?.email || generatedPassword.sent?.slack ? ' (sent to employee)' : ' (share this once)'}:
          </div>
          <div className="password-box-value">{generatedPassword.password}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setGeneratedPassword(null)}>&times; Dismiss</button>
        </div>
      )}

      {canSeePay && resetPassword && (
        <div className="password-box mt-12">
          <div className="password-box-label">
            New password for {resetPassword.name}{resetPassword.sent?.email || resetPassword.sent?.slack ? ' (sent to them)' : ''}:
          </div>
          <div className="password-box-value">{resetPassword.password}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setResetPassword(null)}>&times; Dismiss</button>
        </div>
      )}

      {/* Add employee (admin only) */}
      {canSeePay && <div className="mt-12">
        {!showAdd ? (
          <button className="btn btn-primary btn-full" onClick={() => { setShowAdd(true); setGeneratedPassword(null) }}>
            + Add Employee
          </button>
        ) : (
          <div className="card">
            <div className="card-title">New Employee</div>
            <div className="input-row" style={{ marginBottom: 8 }}>
              <div>
                <label className="input-label">Full Name</label>
                <input className="input" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div>
                <label className="input-label">Email</label>
                <input className="input" type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="jane@makelab.com" />
              </div>
            </div>
            <div className="input-row" style={{ marginBottom: 8 }}>
              <div>
                <label className="input-label">Phone</label>
                <input className="input" type="tel" value={addForm.phone_number} onChange={e => setAddForm({ ...addForm, phone_number: e.target.value })} placeholder="555-123-4567" />
              </div>
              <div>
                <label className="input-label">Title</label>
                <input className="input" value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })} placeholder="e.g. Production Tech, Designer" />
              </div>
            </div>
            <div className="input-row" style={{ marginBottom: 8 }}>
              <div>
                <label className="input-label">Type</label>
                <select className="input" value={addForm.employee_type} onChange={e => setAddForm({ ...addForm, employee_type: e.target.value })}>
                  {EMP_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Department</label>
                <input className="input" value={addForm.department} onChange={e => setAddForm({ ...addForm, department: e.target.value })} placeholder="General" />
              </div>
            </div>
            <div className="input-row" style={{ marginBottom: 8 }}>
              {addForm.employee_type === 'hourly' && (
                <div>
                  <label className="input-label">Rate ($/hr)</label>
                  <input className="input" type="number" step="0.01" value={addForm.rate} onChange={e => setAddForm({ ...addForm, rate: e.target.value })} />
                </div>
              )}
              {['salary', 'contract'].includes(addForm.employee_type) && (
                <div>
                  <label className="input-label">Fixed Amount ($/period)</label>
                  <input className="input" type="number" step="0.01" value={addForm.fixed_amount} onChange={e => setAddForm({ ...addForm, fixed_amount: e.target.value })} />
                </div>
              )}
              <div>
                <label className="input-label">Pay Type</label>
                <select className="input" value={addForm.pay_type} onChange={e => setAddForm({ ...addForm, pay_type: e.target.value })}>
                  <option value="W2">W2</option>
                  <option value="1099">1099</option>
                </select>
              </div>
            </div>
            {renderScheduleEditor(
              addForm.schedule_days, addForm.schedule_start, addForm.schedule_end,
              toggleAddDay,
              v => setAddForm({ ...addForm, schedule_start: v }),
              v => setAddForm({ ...addForm, schedule_end: v }),
            )}
            <div className="edit-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding || !addForm.full_name || !addForm.email}>
                {adding ? 'Creating...' : 'Create Employee'}
              </button>
            </div>
          </div>
        )}
      </div>}

      {renderEmpList('Active Employees', active)}

      {inactive.length > 0 && renderEmpList('Inactive', inactive)}
    </>
  )
}
