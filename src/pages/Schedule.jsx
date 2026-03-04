import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEPT_COLOR_MAP = {
  'Production': '#f3e8ff',   // purple
  'Marketing': '#dbeafe',    // blue
  'Leadership': '#fef9c3',   // yellow
}
const DEPT_COLOR_FALLBACK = '#f1f5f9' // neutral gray for unmapped departments

// Sort order: hourly/salary/contract first, intern last
const TYPE_ORDER = { hourly: 0, salary: 0, contract: 0, intern: 1 }

function getWeekDates(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - day + offset * 7)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    dates.push(formatDate(d))
  }
  return dates
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}`
}

function getDayCount(emp) {
  return emp.schedule?.days?.length || 0
}

function sortEmployees(list) {
  return [...list].sort((a, b) => {
    // Interns always last
    const aIntern = (a.employee_type || 'hourly') === 'intern' ? 1 : 0
    const bIntern = (b.employee_type || 'hourly') === 'intern' ? 1 : 0
    if (aIntern !== bIntern) return aIntern - bIntern
    // Most scheduled days first
    const dayDiff = getDayCount(b) - getDayCount(a)
    if (dayDiff !== 0) return dayDiff
    return (a.full_name || '').localeCompare(b.full_name || '')
  })
}

export default function Schedule() {
  const { employee: currentUser, isAdmin, isManager } = useAuth()

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [view, setView] = useState('weekly')
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))

  const fetchEmployees = useCallback(async () => {
    if (!supabase) return
    let query = supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('department', { ascending: true })
      .order('full_name', { ascending: true })

    const { data } = await query
    setEmployees(data || [])
    setLoading(false)
  }, [isAdmin, currentUser?.department])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  if (loading) {
    return <div className="text-center mt-16"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
  }

  const weekDates = getWeekDates(weekOffset)
  const weekLabel = `${formatDateShort(weekDates[0])} - ${formatDateShort(weekDates[6])}`
  const todayStr = formatDate(new Date())

  // Only include employees who have scheduled days
  const scheduled = employees.filter(emp => {
    const days = emp.schedule?.days
    return days && days.length > 0
  })

  // Group by department
  const departments = {}
  scheduled.forEach(emp => {
    const dept = emp.department || 'General'
    if (!departments[dept]) departments[dept] = []
    departments[dept].push(emp)
  })
  const deptNames = Object.keys(departments).sort()

  // Sort employees within each department (interns last)
  deptNames.forEach(dept => {
    departments[dept] = sortEmployees(departments[dept])
  })

  const deptColorMap = {}
  deptNames.forEach(name => {
    deptColorMap[name] = DEPT_COLOR_MAP[name] || DEPT_COLOR_FALLBACK
  })

  function isScheduledOn(emp, dateStr) {
    const sched = emp.schedule || { days: [1, 2, 3, 4, 5] }
    const dayNum = new Date(dateStr + 'T00:00:00').getDay()
    return (sched.days || []).includes(dayNum)
  }

  function getShiftLabel(emp) {
    const sched = emp.schedule || { start_time: '09:00', end_time: '17:00' }
    const start = sched.start_time || '09:00'
    const end = sched.end_time || '17:00'
    const [sh] = start.split(':').map(Number)
    const [eh] = end.split(':').map(Number)
    const hours = eh - sh
    if (hours >= 8) return 'Full Day'
    if (sh < 12 && eh <= 13) return 'Morning'
    if (sh >= 11) return 'Afternoon'
    return 'Full Day'
  }

  // Daily view
  const dailyDow = new Date(selectedDate + 'T00:00:00').getDay()
  const dailyWorkers = sortEmployees(scheduled.filter(emp => isScheduledOn(emp, selectedDate)))
  const dailyByDept = {}
  dailyWorkers.forEach(emp => {
    const dept = emp.department || 'General'
    if (!dailyByDept[dept]) dailyByDept[dept] = []
    dailyByDept[dept].push(emp)
  })

  return (
    <>
      <div className="sched-header">
        <div className="sched-toggle">
          <button className={`sched-toggle-btn ${view === 'weekly' ? 'active' : ''}`} onClick={() => setView('weekly')}>Weekly</button>
          <button className={`sched-toggle-btn ${view === 'daily' ? 'active' : ''}`} onClick={() => setView('daily')}>Daily</button>
        </div>

        {view === 'weekly' ? (
          <div className="sched-nav">
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)}>&larr;</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>This Week</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)}>&rarr;</button>
          </div>
        ) : (
          <div className="sched-nav">
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const d = new Date(selectedDate + 'T00:00:00')
              d.setDate(d.getDate() - 1)
              setSelectedDate(formatDate(d))
            }}>&larr;</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(formatDate(new Date()))}>Today</button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const d = new Date(selectedDate + 'T00:00:00')
              d.setDate(d.getDate() + 1)
              setSelectedDate(formatDate(d))
            }}>&rarr;</button>
          </div>
        )}
      </div>

      {view === 'weekly' ? (
        <>
          <div className="sched-week-label">{weekLabel}</div>
          <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="sched-grid">
              <thead>
                <tr>
                  <th className="sched-dept-col" />
                  <th className="sched-name-col">Employee</th>
                  <th className="sched-title-col">Title</th>
                  {weekDates.map((d, i) => (
                    <th key={d} className={d === todayStr ? 'sched-today-col' : ''}>
                      <div>{DAY_LABELS[i]}</div>
                      <div className="sched-th-date">{new Date(d + 'T00:00:00').getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptNames.map((dept, deptIdx) => (
                  departments[dept].map((emp, empIdx) => (
                    <tr key={emp.id} style={{ background: deptColorMap[dept] }}>
                      {empIdx === 0 && (
                        <td className="sched-dept-label" rowSpan={departments[dept].length} style={{ background: deptColorMap[dept] }}>
                          <span>{dept}</span>
                        </td>
                      )}
                      <td className="sched-name-col" style={{ background: deptColorMap[dept] }}>
                        <span className="sched-emp-name">{emp.full_name}</span>
                      </td>
                      <td className="sched-title-col" style={{ background: deptColorMap[dept] }}>
                        {emp.title && <span className="sched-emp-pill">{emp.title}</span>}
                      </td>
                      {weekDates.map(d => {
                        const scheduled = isScheduledOn(emp, d)
                        return (
                          <td key={d} className={`sched-cell ${scheduled ? 'filled' : ''} ${d === todayStr ? 'sched-today-col' : ''}`}>
                            {scheduled && (
                              <div className="sched-shift">{getShiftLabel(emp)}</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="sched-week-label">
            {DAY_LABELS[dailyDow]}, {formatDateShort(selectedDate)}
          </div>
          <div className="sched-daily-summary">
            <strong>{dailyWorkers.length}</strong> scheduled
          </div>

          <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="sched-grid">
              <thead>
                <tr>
                  <th className="sched-dept-col" />
                  <th className="sched-name-col">Employee</th>
                  <th className="sched-title-col">Title</th>
                  <th>Shift</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {deptNames.map(dept => {
                  const deptEmps = dailyByDept[dept]
                  if (!deptEmps?.length) return null
                  return deptEmps.map((emp, empIdx) => (
                    <tr key={emp.id} style={{ background: deptColorMap[dept] }}>
                      {empIdx === 0 && (
                        <td className="sched-dept-label" rowSpan={deptEmps.length} style={{ background: deptColorMap[dept] }}>
                          <span>{dept}</span>
                        </td>
                      )}
                      <td className="sched-name-col" style={{ background: deptColorMap[dept] }}>
                        <span className="sched-emp-name">{emp.full_name}</span>
                      </td>
                      <td className="sched-title-col" style={{ background: deptColorMap[dept] }}>
                        {emp.title && <span className="sched-emp-pill">{emp.title}</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="sched-shift">{getShiftLabel(emp)}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="sched-shift">{(emp.employee_type || 'hourly').charAt(0).toUpperCase() + (emp.employee_type || 'hourly').slice(1)}</span>
                      </td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>

          {dailyWorkers.length === 0 && (
            <div className="card mt-12 text-center text-muted">
              <p>No one scheduled on this day.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}
