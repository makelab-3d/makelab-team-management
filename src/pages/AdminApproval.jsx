import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatPeriodRange, formatDayShort, formatDate, getYear, getPeriodDays } from '../lib/dates'
import { formatHours, formatTime12, timeToMinutes } from '../lib/hours'
import { getHolidaySet, getHolidayName } from '../lib/holidays'

const PAGE_SIZE = 5

export default function AdminApproval() {
  const { employee, isAdmin } = useAuth()

  // Admin only
  if (!isAdmin) {
    return (
      <div className="card text-center mt-16">
        <h2>Access Denied</h2>
        <p className="text-muted">Only admins can view timesheets.</p>
      </div>
    )
  }
  const [periods, setPeriods] = useState([])
  const [periodStats, setPeriodStats] = useState({}) // { periodId: { employees, hours, cost } }
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [employeeData, setEmployeeData] = useState([])
  const [allEmployees, setAllEmployees] = useState([]) // all hourly employees
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [page, setPage] = useState(0)
  const [yearFilter, setYearFilter] = useState(null) // null = all
  const [editingCell, setEditingCell] = useState(null) // { entryId, employeeName, date, employeeId, isNew }
  const [editForm, setEditForm] = useState({})
  const [sendingReminders, setSendingReminders] = useState(false)
  const [reminderResult, setReminderResult] = useState(null)
  const [showAddEmployee, setShowAddEmployee] = useState(false)

  // Fetch periods + per-period stats
  const fetchPeriods = useCallback(async () => {
    if (!supabase) return
    const today = formatDate(new Date())
    const { data } = await supabase
      .from('pay_periods')
      .select('*')
      .lte('start_date', today)
      .order('start_date', { ascending: false })

    setPeriods(data || [])

    // Fetch summary stats for all periods
    if (data && data.length > 0) {
      const periodIds = data.map(p => p.id)
      const { data: entries } = await supabase
        .from('time_entries')
        .select('pay_period_id, employee_id, net_hours, employees(rate)')
        .in('pay_period_id', periodIds)

      const stats = {}
      for (const entry of entries || []) {
        const pid = entry.pay_period_id
        if (!stats[pid]) stats[pid] = { employeeSet: new Set(), hours: 0, cost: 0 }
        stats[pid].employeeSet.add(entry.employee_id)
        const h = Number(entry.net_hours || 0)
        stats[pid].hours += h
        stats[pid].cost += h * Number(entry.employees?.rate || 0)
      }
      // Convert sets to counts and round
      const result = {}
      for (const [pid, s] of Object.entries(stats)) {
        result[pid] = {
          employees: s.employeeSet.size,
          hours: Math.round(s.hours * 100) / 100,
          cost: Math.round(s.cost * 100) / 100,
        }
      }
      setPeriodStats(result)
    }

    setLoading(false)
  }, [])

  useEffect(() => { fetchPeriods() }, [fetchPeriods])

  // Fetch all hourly employees
  const fetchAllEmployees = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('employees')
      .select('id, full_name, rate, pay_type, employee_type')
      .eq('employee_type', 'hourly')
      .order('full_name', { ascending: true })
    setAllEmployees(data || [])
  }, [])

  // Fetch employee timesheets for selected period
  const fetchEmployeeData = useCallback(async () => {
    if (!supabase || !selectedPeriod) return

    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, employees(full_name, rate, pay_type)')
      .eq('pay_period_id', selectedPeriod.id)
      .order('work_date', { ascending: true })

    const byEmployee = {}
    for (const entry of entries || []) {
      const eid = entry.employee_id
      if (!byEmployee[eid]) {
        byEmployee[eid] = {
          employee_id: eid,
          full_name: entry.employees?.full_name || 'Unknown',
          rate: Number(entry.employees?.rate || 0),
          pay_type: entry.employees?.pay_type || 'W2',
          total_hours: 0,
          gross_amount: 0,
          entries: [],
          byDate: {},
        }
      }
      byEmployee[eid].entries.push(entry)
      byEmployee[eid].total_hours += Number(entry.net_hours || 0)
      byEmployee[eid].byDate[entry.work_date] = entry
    }
    for (const emp of Object.values(byEmployee)) {
      emp.total_hours = Math.round(emp.total_hours * 100) / 100
      emp.gross_amount = Math.round(emp.total_hours * emp.rate * 100) / 100
    }
    setEmployeeData(Object.values(byEmployee))
  }, [selectedPeriod])

  useEffect(() => { fetchEmployeeData(); fetchAllEmployees() }, [fetchEmployeeData, fetchAllEmployees])

  async function handleClose() {
    setMessage(null)
    try {
      const { data, error } = await supabase
        .from('pay_periods')
        .update({ status: 'closed' })
        .eq('id', selectedPeriod.id)
        .select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update failed — check RLS policies')
      setSelectedPeriod({ ...selectedPeriod, status: 'closed' })
      setMessage({ type: 'success', text: 'Period closed' })
      await fetchPeriods()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleReopen() {
    setMessage(null)
    try {
      const { data, error } = await supabase
        .from('pay_periods')
        .update({ status: 'open' })
        .eq('id', selectedPeriod.id)
        .select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update failed — check RLS policies')
      setSelectedPeriod({ ...selectedPeriod, status: 'open' })
      setMessage({ type: 'success', text: 'Period reopened' })
      await fetchPeriods()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleSendReminders() {
    setSendingReminders(true)
    setReminderResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/send-reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (data.reminders === 0) {
        setReminderResult({ type: 'success', text: 'All hourly employees have logged hours!' })
      } else {
        const names = data.results.map(r => r.name).join(', ')
        setReminderResult({ type: 'success', text: `Sent ${data.reminders} reminder(s): ${names}` })
      }
    } catch (err) {
      setReminderResult({ type: 'error', text: err.message })
    } finally {
      setSendingReminders(false)
    }
  }

  function openCellEdit(entry, employeeName, date) {
    setEditingCell({ entryId: entry.id, employeeName, date, isNew: false })
    setEditForm({
      start_time: entry.start_time || '',
      end_time: entry.end_time || '',
      break_minutes: entry.break_minutes ?? '',
    })
    setMessage(null)
  }

  function openNewCellEdit(employeeId, employeeName, date) {
    setEditingCell({ employeeId, employeeName, date, isNew: true })
    setEditForm({
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 60,
    })
    setMessage(null)
  }

  async function handleAddEmployee(emp) {
    // Add employee to the view with empty entries
    setEmployeeData(prev => {
      if (prev.find(e => e.employee_id === emp.id)) return prev
      return [...prev, {
        employee_id: emp.id,
        full_name: emp.full_name,
        rate: Number(emp.rate || 0),
        pay_type: emp.pay_type || 'W2',
        total_hours: 0,
        gross_amount: 0,
        entries: [],
        byDate: {},
      }]
    })
    setShowAddEmployee(false)
  }

  async function saveCellEdit() {
    setMessage(null)
    try {
      const startMin = timeToMinutes(editForm.start_time)
      const endMin = timeToMinutes(editForm.end_time)
      const gross = endMin > startMin ? (endMin - startMin) / 60 : 0
      const breakMin = Number(editForm.break_minutes) || 0
      const net = Math.max(0, gross - breakMin / 60)

      if (editingCell.isNew) {
        const { error } = await supabase
          .from('time_entries')
          .insert({
            employee_id: editingCell.employeeId,
            pay_period_id: selectedPeriod.id,
            work_date: editingCell.date,
            start_time: editForm.start_time,
            end_time: editForm.end_time,
            break_minutes: breakMin,
            gross_hours: Math.round(gross * 100) / 100,
            net_hours: Math.round(net * 100) / 100,
          })
        if (error) throw error
        setMessage({ type: 'success', text: 'Entry created' })
      } else {
        const { error } = await supabase
          .from('time_entries')
          .update({
            start_time: editForm.start_time,
            end_time: editForm.end_time,
            break_minutes: breakMin,
            gross_hours: Math.round(gross * 100) / 100,
            net_hours: Math.round(net * 100) / 100,
          })
          .eq('id', editingCell.entryId)
        if (error) throw error
        setMessage({ type: 'success', text: 'Updated' })
      }
      setEditingCell(null)
      fetchEmployeeData()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  if (loading) {
    return <div className="text-center mt-16"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
  }

  // ── Period detail view ──────────────────────────────────────
  if (selectedPeriod) {
    const days = getPeriodDays(selectedPeriod.start_date, selectedPeriod.end_date)
    const holidayDates = getHolidaySet(selectedPeriod.start_date, selectedPeriod.end_date)

    return (
      <>
        <button className="btn-back" onClick={() => { setSelectedPeriod(null); setMessage(null) }}>
          &larr; All Periods
        </button>

        <div className="period-header" style={{ marginTop: 8 }}>
          <span className="period-range">{formatPeriodRange(selectedPeriod.start_date, selectedPeriod.end_date)}</span>
          <span className={`period-status ${selectedPeriod.status}`}>{selectedPeriod.status}</span>
        </div>

        {message && (
          <div className={`toast ${message.type}`} style={{ marginBottom: 12 }}>
            {message.text}
          </div>
        )}

        {/* Summary bar */}
        {employeeData.length > 0 && (
          <div className="admin-kpis mb-12">
            <div className="admin-kpi">
              <div className="admin-kpi-value">{employeeData.length}</div>
              <div className="admin-kpi-label">Employees</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-value">
                {formatHours(employeeData.reduce((sum, e) => sum + e.total_hours, 0))}
              </div>
              <div className="admin-kpi-label">Total Hours</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-value">
                ${employeeData.reduce((sum, e) => sum + e.gross_amount, 0).toLocaleString()}
              </div>
              <div className="admin-kpi-label">Total Cost</div>
            </div>
          </div>
        )}

        {/* Timesheet table */}
        {employeeData.length === 0 ? (
          <div className="card text-center">
            <p className="text-muted">No timesheets submitted for this period.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="timesheet-table">
              <thead>
                <tr>
                  <th className="sticky-col">Employee</th>
                  {days.map(d => {
                    const hName = getHolidayName(d)
                    return (
                      <th key={d} className={hName ? 'cell-holiday' : ''} title={hName || undefined}>
                        {formatDayShort(d)}
                        {hName && <span className="cell-holiday-dot" />}
                      </th>
                    )
                  })}
                  <th>Total</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {employeeData.map(emp => (
                  <tr key={emp.employee_id}>
                    <td className="sticky-col">
                      <div className="table-emp-name">{emp.full_name}</div>
                      <div className="table-emp-rate">${Number(emp.rate).toFixed(2)}/hr</div>
                    </td>
                    {days.map(d => {
                      const entry = emp.byDate[d]
                      return (
                        <td
                          key={d}
                          className={`cell-clickable${entry ? ' has-hours' : ''}`}
                          onClick={entry
                            ? () => openCellEdit(entry, emp.full_name, d)
                            : () => openNewCellEdit(emp.employee_id, emp.full_name, d)
                          }
                        >
                          {entry ? (
                            <div className="cell-hours">
                              <span className="cell-net">{formatHours(entry.net_hours)}</span>
                              <span className="cell-break">
                                {formatHours(entry.gross_hours)}&minus;{entry.break_minutes || 0}m
                              </span>
                              <span className="cell-times">{formatTime12(entry.start_time)}-{formatTime12(entry.end_time)}</span>
                            </div>
                          ) : (
                            <span className="cell-empty cell-add-hint">+</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="cell-total">{formatHours(emp.total_hours)}</td>
                    <td className="cell-total">${emp.gross_amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add employee button */}
        <div style={{ marginTop: 12, position: 'relative' }}>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--muted)', color: 'var(--text)' }}
            onClick={() => setShowAddEmployee(!showAddEmployee)}
          >
            + Add Employee
          </button>
          {showAddEmployee && (() => {
            const existingIds = new Set(employeeData.map(e => e.employee_id))
            const available = allEmployees.filter(e => !existingIds.has(e.id))
            return (
              <div className="card" style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, marginTop: 4, maxHeight: 240, overflowY: 'auto', minWidth: 220, padding: 0 }}>
                {available.length === 0 ? (
                  <div style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>All hourly employees are already listed</div>
                ) : available.map(emp => (
                  <div
                    key={emp.id}
                    onClick={() => handleAddEmployee(emp)}
                    style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    className="cell-clickable"
                  >
                    <div style={{ fontWeight: 500 }}>{emp.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>${Number(emp.rate).toFixed(2)}/hr</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Edit panel */}
        {editingCell && (
          <div className="card mt-12">
            <div className="card-title">
              {editingCell.isNew ? 'Add' : 'Edit'}: {editingCell.employeeName} &mdash; {formatDayShort(editingCell.date)}
            </div>
            <div className="input-row" style={{ marginBottom: 8 }}>
              <div>
                <label className="input-label">Start Time</label>
                <input className="input" type="time" value={editForm.start_time} onChange={e => setEditForm({ ...editForm, start_time: e.target.value })} />
              </div>
              <div>
                <label className="input-label">End Time</label>
                <input className="input" type="time" value={editForm.end_time} onChange={e => setEditForm({ ...editForm, end_time: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Break (min)</label>
                <input className="input" type="number" min="0" step="5" value={editForm.break_minutes} onChange={e => setEditForm({ ...editForm, break_minutes: e.target.value })} />
              </div>
            </div>
            {editForm.start_time && editForm.end_time && (() => {
              const startMin = timeToMinutes(editForm.start_time)
              const endMin = timeToMinutes(editForm.end_time)
              const gross = endMin > startMin ? (endMin - startMin) / 60 : 0
              const breakH = (Number(editForm.break_minutes) || 0) / 60
              const net = Math.max(0, gross - breakH)
              return (
                <div className="hours-preview" style={{ marginBottom: 12 }}>
                  <strong>{net.toFixed(1)}h net</strong>
                  <span className="lunch-note"> ({gross.toFixed(1)}h &minus; {Number(editForm.break_minutes) || 0}m break)</span>
                </div>
              )
            })()}
            <div className="edit-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingCell(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveCellEdit}>{editingCell.isNew ? 'Add Entry' : 'Save'}</button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="admin-actions mt-16">
          {selectedPeriod.status === 'open' && (
            <button className="btn btn-primary btn-full" onClick={handleClose}>
              Close Period
            </button>
          )}
          {selectedPeriod.status === 'closed' && (
            <button className="btn btn-full" onClick={handleReopen} style={{ background: 'var(--muted)', color: 'var(--text)' }}>
              Reopen Period
            </button>
          )}
        </div>
      </>
    )
  }

  // ── Period list view ────────────────────────────────────────
  // Get unique years for filter
  const years = [...new Set(periods.map(p => getYear(p.start_date)))].sort((a, b) => b - a)
  const filtered = yearFilter ? periods.filter(p => getYear(p.start_date) === yearFilter) : periods
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pagedPeriods = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Find current open period (most recent that hasn't ended yet)
  const todayStr = formatDate(new Date())
  const currentPeriod = periods.find(p => p.status === 'open' && p.end_date >= todayStr)

  // Days until current period ends
  let daysLeft = null
  if (currentPeriod) {
    const end = new Date(currentPeriod.end_date + 'T00:00:00')
    const now = new Date(todayStr + 'T00:00:00')
    daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
  }

  // Close deadline = 1 week after period ends
  let daysToClose = null
  if (currentPeriod) {
    const closeDeadline = new Date(currentPeriod.end_date + 'T00:00:00')
    closeDeadline.setDate(closeDeadline.getDate() + 7)
    const now = new Date(todayStr + 'T00:00:00')
    daysToClose = Math.ceil((closeDeadline - now) / (1000 * 60 * 60 * 24))
  }

  // Open periods that have already ended (past deadline, need closing)
  const pastOpen = periods.filter(p => p.status === 'open' && p.end_date < todayStr)

  return (
    <>
      {/* KPI boxes */}
      <div className="admin-kpis">
        <div className="admin-kpi">
          <div className="admin-kpi-value">{daysLeft !== null ? daysLeft : '--'}</div>
          <div className="admin-kpi-label">Days Left</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-value">{daysToClose !== null ? daysToClose : '--'}</div>
          <div className="admin-kpi-label">Close Deadline</div>
        </div>
        <div className={`admin-kpi ${pastOpen.length > 0 ? 'kpi-alert' : ''}`}>
          <div className="admin-kpi-value">{pastOpen.length}</div>
          <div className="admin-kpi-label">Need Closing</div>
        </div>
      </div>

      {/* Year filter */}
      {years.length > 1 && (
        <div className="year-filter">
          <button
            className={`year-btn ${!yearFilter ? 'active' : ''}`}
            onClick={() => { setYearFilter(null); setPage(0) }}
          >
            All
          </button>
          {years.map(y => (
            <button
              key={y}
              className={`year-btn ${yearFilter === y ? 'active' : ''}`}
              onClick={() => { setYearFilter(y); setPage(0) }}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Paginated period list */}
      <div className="card mt-12">
        <div className="card-title">Pay Periods</div>
        {pagedPeriods.length === 0 ? (
          <p className="text-muted text-center">No periods found.</p>
        ) : pagedPeriods.map(p => {
          const stats = periodStats[p.id]
          return (
            <div key={p.id} className={`admin-period-row ${p.status === 'closed' ? 'is-closed' : ''}`} onClick={() => setSelectedPeriod(p)} style={{ cursor: 'pointer', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{formatPeriodRange(p.start_date, p.end_date)}</span>
                {stats && (
                  <div className="period-stats">
                    <span className="period-stat"><strong>{stats.employees}</strong> {stats.employees === 1 ? 'person' : 'people'}</span>
                    <span className="period-stat"><strong>{formatHours(stats.hours)}</strong></span>
                    <span className="period-stat"><strong>${stats.cost.toLocaleString()}</strong></span>
                  </div>
                )}
              </div>
              <span className={`period-status ${p.status}`}>{p.status}</span>
            </div>
          )
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn-page" disabled={page === 0} onClick={() => setPage(page - 1)}>
              &larr; Newer
            </button>
            <span className="page-info">{page + 1} / {totalPages}</span>
            <button className="btn-page" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Older &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Send Reminders */}
      <button
        className="btn btn-full mt-12"
        style={{ background: 'var(--muted)', color: 'var(--text)' }}
        onClick={handleSendReminders}
        disabled={sendingReminders}
      >
        {sendingReminders ? 'Sending...' : 'Send Hour Reminders'}
      </button>
      {reminderResult && (
        <div className={`toast ${reminderResult.type}`} style={{ marginTop: 8 }}>
          {reminderResult.text}
        </div>
      )}
    </>
  )
}
