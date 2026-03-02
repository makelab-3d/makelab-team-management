import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePayPeriod } from '../hooks/usePayPeriod'
import { useTimeEntries } from '../hooks/useTimeEntries'
import { getPeriodDays, formatPeriodRange, formatDateShort, formatDayShort, isToday, isWeekend, today } from '../lib/dates'
import { computeHours, formatHours, formatTime12 } from '../lib/hours'

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
  // Next Friday after the period ends
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
  const { currentPeriod, loading: periodLoading } = usePayPeriod()
  const {
    entries, loading: entriesLoading, totalHours,
    addEntry, updateEntry, deleteEntry
  } = useTimeEntries(employee?.id, currentPeriod?.id)

  const [selectedDate, setSelectedDate] = useState(null)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [reminderDismissed, setReminderDismissed] = useState(false)

  const schedule = employee?.schedule || { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' }
  const scheduledDays = new Set(schedule.days || [])

  function isScheduled(dateStr) {
    const day = new Date(dateStr + 'T00:00:00').getDay()
    return scheduledDays.has(day)
  }

  useEffect(() => {
    if (!currentPeriod || entriesLoading || selectedDate) return
    const periodDays = getPeriodDays(currentPeriod.start_date, currentPeriod.end_date)
    const entryDates = new Set(entries.map(e => e.work_date))
    const todayStr = today()

    if (periodDays.includes(todayStr)) {
      selectDay(todayStr, entryDates)
      return
    }
    const nextUnlogged = periodDays.find(d => isScheduled(d) && !entryDates.has(d))
    if (nextUnlogged) {
      selectDay(nextUnlogged, entryDates)
      return
    }
    selectDay(periodDays[0], entryDates)
  }, [currentPeriod, entriesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (periodLoading || entriesLoading) {
    return <div className="text-center mt-16"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
  }

  if (!currentPeriod) {
    return (
      <div className="card text-center">
        <p>No active pay period found.</p>
        <p className="text-muted mt-8">Contact your admin to set up pay periods.</p>
      </div>
    )
  }

  const periodDays = getPeriodDays(currentPeriod.start_date, currentPeriod.end_date)
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
  const showReminder = isFriday && remaining > 0 && !reminderDismissed

  return (
    <div className="te">
      {showReminder && (
        <div className="te-reminder">
          <span>You have <strong>{remaining} day{remaining !== 1 ? 's' : ''}</strong> left to log this period</span>
          <button className="te-reminder-x" onClick={() => setReminderDismissed(true)}>&times;</button>
        </div>
      )}
      {/* ─── Combined Today + Progress ─── */}
      <div className="te-today">
        <div className="te-today-info">
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
              <div className="te-today-status te-status-off">Day off</div>
            )
          ) : (
            <div className="te-today-status te-status-off">Outside current period</div>
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

      {/* ─── Calendar + Entry (side-by-side on desktop) ─── */}
      <div className="te-content">
        <div className="te-cal">
          <div className="te-cal-head">
            <span className="te-cal-head-range">{formatPeriodRange(currentPeriod.start_date, currentPeriod.end_date)}</span>
            <span className="te-cal-head-sep">&middot;</span>
            <span className="te-cal-head-pay">Paid out {formatPayDate(getPayDate(currentPeriod.end_date))}</span>
            <span className={`te-period-status ${currentPeriod.status}`}>{currentPeriod.status}</span>
          </div>
          <div className="te-cal-body">
          <div className="te-cal-dow">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="te-cal-dow-cell">{d}</div>
            ))}
          </div>
          <div className="te-cal-grid">
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`e-${i}`} className="te-cal-cell te-cal-empty" />
            ))}
            {periodDays.map(dateStr => {
              const entry = entryMap[dateStr]
              const scheduled = isScheduled(dateStr)
              const isTodayCell = isToday(dateStr)
              const weekend = isWeekend(dateStr)
              const selected = selectedDate === dateStr
              const dayNum = new Date(dateStr + 'T00:00:00').getDate()

              let cls = 'te-cal-cell'
              if (weekend) cls += ' te-cal-wknd'
              if (isTodayCell) cls += ' te-cal-today'
              if (entry) cls += ' te-cal-logged'
              else if (scheduled) cls += ' te-cal-sched'
              if (selected) cls += ' te-cal-sel'

              return (
                <div key={dateStr} className={cls} onClick={() => selectDay(dateStr)}>
                  <span className="te-cal-num">{dayNum}</span>
                  {entry && <span className="te-cal-hrs">{formatHours(entry.net_hours)}</span>}
                  {!entry && scheduled && <span className="te-cal-dot" />}
                </div>
              )
            })}
          </div>
          </div>
        </div>

        {selectedDate && (
          <div className="te-entry" key={selectedDate}>
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
    </div>
  )
}
