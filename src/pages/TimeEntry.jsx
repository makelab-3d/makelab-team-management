import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePayPeriod } from '../hooks/usePayPeriod'
import { useTimeEntries } from '../hooks/useTimeEntries'
import { supabase } from '../lib/supabase'
import { getPeriodDays, formatPeriodRange, formatDateShort, formatDayShort, formatDate, isToday, isWeekend, today } from '../lib/dates'
import { computeHours, formatHours, formatTime12 } from '../lib/hours'
import { getHolidaySet, getHolidayName } from '../lib/holidays'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getFullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return {
    dayName: DAY_NAMES[d.getDay()],
    monthDay: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
  }
}

function getPayDate(endDateStr) {
  const d = new Date(endDateStr + 'T00:00:00')
  const dow = d.getDay()
  const daysToFri = dow === 5 ? 7 : ((5 - dow + 7) % 7) || 7
  d.setDate(d.getDate() + daysToFri)
  return d
}

function formatPayDate(date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
}

export default function TimeEntry() {
  const { employee } = useAuth()
  const { currentPeriod, allPeriods, loading: periodLoading } = usePayPeriod()
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [periodSummaries, setPeriodSummaries] = useState({})

  // Fetch per-period hour summaries for the list view
  const fetchSummaries = useCallback(async () => {
    if (!supabase || !employee) return
    const { data } = await supabase
      .from('time_entries')
      .select('pay_period_id, net_hours')
      .eq('employee_id', employee.id)
    const map = {}
    ;(data || []).forEach(e => {
      if (!map[e.pay_period_id]) map[e.pay_period_id] = 0
      map[e.pay_period_id] += Number(e.net_hours || 0)
    })
    setPeriodSummaries(map)
  }, [employee])

  useEffect(() => { fetchSummaries() }, [fetchSummaries])

  // Auto-select the current period on first load
  useEffect(() => {
    if (currentPeriod && !selectedPeriod) {
      setSelectedPeriod(currentPeriod)
    }
  }, [currentPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  if (periodLoading) {
    return <div className="text-center mt-16"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
  }

  if (!selectedPeriod) {
    // ── Period list view ──
    const todayStr = formatDate(new Date())
    return (
      <div className="te">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Pay Periods</h2>
        {allPeriods.length === 0 ? (
          <div className="card text-center">
            <p>No pay periods found.</p>
            <p className="text-muted mt-8">Contact your admin to set up pay periods.</p>
          </div>
        ) : (
          <div className="card">
            {allPeriods.map(p => {
              const hours = periodSummaries[p.id] || 0
              const isCurrent = p.status === 'open' && p.start_date <= todayStr && p.end_date >= todayStr
              return (
                <div
                  key={p.id}
                  className={`admin-period-row${p.status === 'closed' ? ' is-closed' : ''}`}
                  onClick={() => setSelectedPeriod(p)}
                  style={{ cursor: 'pointer', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>
                      {formatPeriodRange(p.start_date, p.end_date)}
                    </span>
                    {isCurrent && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>CURRENT</span>}
                    <div className="period-stats">
                      <span className="period-stat"><strong>{formatHours(hours)}</strong></span>
                    </div>
                  </div>
                  <span className={`period-status ${p.status}`}>{p.status}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Period detail view ──
  return (
    <PeriodDetail
      employee={employee}
      period={selectedPeriod}
      isCurrent={currentPeriod?.id === selectedPeriod.id}
      onBack={() => { setSelectedPeriod(null); fetchSummaries() }}
    />
  )
}

function PeriodDetail({ employee, period, isCurrent, onBack }) {
  const {
    entries, loading: entriesLoading, totalHours,
    addEntry, updateEntry, deleteEntry
  } = useTimeEntries(employee?.id, period?.id)

  const [selectedDate, setSelectedDate] = useState(null)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [reminderDismissed, setReminderDismissed] = useState(false)

  const schedule = employee?.schedule || { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' }
  const scheduledDays = new Set(schedule.days || [])
  const holidayDates = getHolidaySet(period.start_date, period.end_date)

  function isScheduled(dateStr) {
    if (holidayDates.has(dateStr)) return false
    const day = new Date(dateStr + 'T00:00:00').getDay()
    return scheduledDays.has(day)
  }

  useEffect(() => {
    if (!period || entriesLoading) return
    setSelectedDate(null) // reset on period change
  }, [period?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!period || entriesLoading || selectedDate) return
    const periodDays = getPeriodDays(period.start_date, period.end_date)
    const entryDates = new Set(entries.map(e => e.work_date))
    const todayStr = today()

    if (isCurrent && periodDays.includes(todayStr)) {
      selectDay(todayStr, entryDates)
      return
    }
    const nextUnlogged = periodDays.find(d => isScheduled(d) && !entryDates.has(d))
    if (nextUnlogged) {
      selectDay(nextUnlogged, entryDates)
      return
    }
    selectDay(periodDays[0], entryDates)
  }, [period?.id, entriesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectDay(dateStr, entryDatesSet) {
    const entryDates = entryDatesSet || new Set(entries.map(e => e.work_date))
    const existing = entryDates.has(dateStr)
      ? entries.find(e => e.work_date === dateStr)
      : null

    setSelectedDate(dateStr)
    if (existing) {
      setStartTime(existing.start_time)
      setEndTime(existing.end_time)
    } else {
      setStartTime(schedule.start_time || '09:00')
      setEndTime(schedule.end_time || '17:00')
    }
    setError(null)
  }

  if (entriesLoading) {
    return <div className="text-center mt-16"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
  }

  const periodDays = getPeriodDays(period.start_date, period.end_date)
  const entryMap = {}
  entries.forEach(e => { entryMap[e.work_date] = e })

  const firstDate = new Date(periodDays[0] + 'T00:00:00')
  const startDow = firstDate.getDay()

  const loggedCount = entries.length
  const scheduledCount = periodDays.filter(d => isScheduled(d)).length
  const remaining = Math.max(0, scheduledCount - loggedCount)
  const progress = scheduledCount > 0 ? loggedCount / scheduledCount : 0

  const todayStr = today()
  const todayEntry = entryMap[todayStr]
  const todayInPeriod = periodDays.includes(todayStr)
  const todayScheduled = todayInPeriod && isScheduled(todayStr)
  const todayInfo = getFullDate(todayStr)

  const currentEntry = selectedDate ? entryMap[selectedDate] : null
  const preview = computeHours(startTime, endTime)

  const ringR = 24
  const ringC = 2 * Math.PI * ringR
  const ringOffset = ringC * (1 - progress)

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      if (currentEntry) {
        await updateEntry(currentEntry.id, {
          start_time: startTime,
          end_time: endTime,
        })
      } else {
        await addEntry({
          work_date: selectedDate,
          start_time: startTime,
          end_time: endTime,
        })
      }
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!currentEntry) return
    setSubmitting(true)
    try {
      await deleteEntry(currentEntry.id)
      setStartTime(schedule.start_time || '09:00')
      setEndTime(schedule.end_time || '17:00')
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to delete')
    } finally {
      setSubmitting(false)
    }
  }

  const isFriday = new Date().getDay() === 5
  const showReminder = isCurrent && isFriday && remaining > 0 && !reminderDismissed

  return (
    <div className="te">
      <button className="btn-back" onClick={onBack}>&larr; All Periods</button>

      {showReminder && (
        <div className="te-reminder">
          <span>You have <strong>{remaining} day{remaining !== 1 ? 's' : ''}</strong> left to log this period</span>
          <button className="te-reminder-x" onClick={() => setReminderDismissed(true)}>&times;</button>
        </div>
      )}
      {/* ─── Combined Today + Progress ─── */}
      <div className="te-today">
        <div className="te-today-info">
          {isCurrent ? (
            <>
              <div className="te-today-eyebrow">TODAY</div>
              <div className="te-today-day">{todayInfo.dayName}</div>
              <div className="te-today-date">{todayInfo.monthDay}</div>
              <div className="te-today-divider" />
              {todayInPeriod ? (
                todayEntry ? (
                  <div className="te-today-status te-status-logged">
                    <svg className="te-today-check" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="te-today-hrs">{formatHours(todayEntry.net_hours)}</span>
                    <span className="te-today-times">{formatTime12(todayEntry.start_time)} – {formatTime12(todayEntry.end_time)}</span>
                  </div>
                ) : todayScheduled ? (
                  <div className="te-today-status te-status-pending">
                    <span className="te-today-dot" />
                    <span>Not yet logged</span>
                  </div>
                ) : (
                  <div className="te-today-status te-status-off">{getHolidayName(todayStr) || 'Day off'}</div>
                )
              ) : (
                <div className="te-today-status te-status-off">Outside current period</div>
              )}
            </>
          ) : (
            <>
              <div className="te-today-eyebrow">{period.status === 'closed' ? 'CLOSED' : 'PAST'} PERIOD</div>
              <div className="te-today-day">{formatPeriodRange(period.start_date, period.end_date)}</div>
            </>
          )}
        </div>
        <div className="te-today-stats">
          <div className="te-ring-wrap">
            <svg className="te-ring" viewBox="0 0 60 60">
              <circle className="te-ring-bg" cx="30" cy="30" r={ringR} />
              <circle
                className="te-ring-fill"
                cx="30" cy="30" r={ringR}
                strokeDasharray={ringC}
                strokeDashoffset={ringOffset}
              />
            </svg>
            <div className="te-ring-pct">{Math.round(progress * 100)}%</div>
          </div>
          <div className="te-stats-col">
            <div className="te-stats-hours">{formatHours(totalHours)}</div>
            <div className="te-stats-sub">{loggedCount} of {scheduledCount} days</div>
          </div>
          <div className="te-stats-rest">
            <div className="te-stats-rest-num">{remaining}</div>
            <div className="te-stats-rest-label">left</div>
          </div>
        </div>
      </div>

      {/* ─── Hours table (admin-style) ─── */}
      <div className="card" style={{ overflow: 'auto', marginBottom: 16 }}>
        <table className="timesheet-table">
          <thead>
            <tr>
              <th className="sticky-col">Day</th>
              {periodDays.map(d => {
                const hName = getHolidayName(d)
                return (
                  <th
                    key={d}
                    className={`${selectedDate === d ? 'te-th-sel' : ''}${hName ? ' cell-holiday' : ''}`}
                    onClick={() => selectDay(d)}
                    style={{ cursor: 'pointer' }}
                    title={hName || undefined}
                  >
                    {formatDayShort(d)}
                    {hName && <span className="cell-holiday-dot" />}
                  </th>
                )
              })}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky-col">
                <div className="table-emp-name">{employee.full_name}</div>
              </td>
              {periodDays.map(d => {
                const entry = entryMap[d]
                return (
                  <td
                    key={d}
                    className={`cell-clickable${entry ? ' has-hours' : ''}${selectedDate === d ? ' te-td-sel' : ''}`}
                    onClick={() => selectDay(d)}
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
                      <span className="cell-empty">&mdash;</span>
                    )}
                  </td>
                )
              })}
              <td className="cell-total">{formatHours(totalHours)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ─── Entry form for selected day ─── */}
      {selectedDate && (
        <div className="card">
          <div className="te-entry-head">
            <span className="te-entry-date">{formatDayShort(selectedDate)}</span>
            {currentEntry && <span className="te-entry-badge">Logged</span>}
          </div>

          <div className="te-time-row">
            <div className="te-time-block">
              <label className="te-time-label">IN</label>
              <input type="time" className="te-time-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="te-time-arrow">&rarr;</div>
            <div className="te-time-block">
              <label className="te-time-label">OUT</label>
              <input type="time" className="te-time-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {preview.net > 0 && (
            <div className="te-hours-bar">
              <strong>{formatHours(preview.net)}</strong>
              {preview.breakMin > 0 && (
                <span className="te-hours-detail">
                  {formatHours(preview.gross)} &minus; {preview.breakMin}m lunch
                </span>
              )}
            </div>
          )}

          {error && <p className="te-error">{error}</p>}

          <div className="te-actions">
            {currentEntry && (
              <button className="te-btn te-btn-del" onClick={handleDelete} disabled={submitting}>Delete</button>
            )}
            <button className="te-btn te-btn-save" onClick={handleSave} disabled={submitting || preview.net <= 0}>
              {submitting ? 'Saving...' : currentEntry ? 'Update' : 'Log Hours'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
