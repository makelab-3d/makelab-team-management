import { useAuth } from '../context/AuthContext'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime12(timeStr) {
  if (!timeStr) return '--'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function Profile() {
  const { employee, signOut } = useAuth()
  const schedule = employee.schedule || { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' }
  const scheduledDays = new Set(schedule.days || [])

  return (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Profile</h2>
      <div className="card">
        <div className="profile-row">
          <span className="profile-label">Name</span>
          <span className="profile-value">{employee.full_name}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Email</span>
          <span className="profile-value">{employee.email}</span>
        </div>
        {employee.phone_number && (
          <div className="profile-row">
            <span className="profile-label">Phone</span>
            <span className="profile-value">{employee.phone_number}</span>
          </div>
        )}
      </div>

      <div className="card mt-12">
        <div className="card-title">My Schedule</div>
        <div className="schedule-display">
          <div className="schedule-days-row">
            {DAY_LABELS.map((label, i) => (
              <div key={label} className={`schedule-day-chip ${scheduledDays.has(i) ? 'active' : ''}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="schedule-time-display">
            {formatTime12(schedule.start_time)} &ndash; {formatTime12(schedule.end_time)}
          </div>
        </div>
      </div>

      <div className="mt-16">
        <button className="btn btn-secondary btn-full" onClick={signOut}>
          Sign Out
        </button>
      </div>
    </>
  )
}
