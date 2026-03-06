import { useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime12(timeStr) {
  if (!timeStr) return '--'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ src, name, size = 80 }) {
  const [imgError, setImgError] = useState(false)
  const initials = getInitials(name)
  const fontSize = size * 0.36

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setImgError(true)}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          border: '2px solid #e5e5e5',
        }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 600, color: '#666', border: '2px solid #e5e5e5',
    }}>
      {initials}
    </div>
  )
}

export default function Profile() {
  const { employee, signOut, setEmployee } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const fileRef = useRef(null)

  const schedule = employee.schedule || { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' }
  const scheduledDays = new Set(schedule.days || [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage(null)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const form = new FormData()
      form.append('file', file)
      form.append('employee_id', employee.id)
      const res = await fetch('/.netlify/functions/manage-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      if (setEmployee) setEmployee(prev => ({ ...prev, avatar_url: data.avatar_url }))
      setMessage({ type: 'success', text: 'Photo updated' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemove() {
    setUploading(true)
    setMessage(null)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const form = new FormData()
      form.append('action', 'remove')
      form.append('employee_id', employee.id)
      const res = await fetch('/.netlify/functions/manage-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Remove failed')
      if (setEmployee) setEmployee(prev => ({ ...prev, avatar_url: null }))
      setMessage({ type: 'success', text: 'Photo removed' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Profile</h2>

      {/* Avatar section */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
        <Avatar src={employee.avatar_url} name={employee.full_name} size={80} />
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{employee.full_name}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <label
              style={{
                fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 4,
                background: '#f5a623', color: '#222', cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1, display: 'inline-block',
              }}
            >
              {uploading ? 'Uploading...' : 'Upload Photo'}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
            {employee.avatar_url && (
              <button
                onClick={handleRemove}
                disabled={uploading}
                style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 4,
                  background: 'transparent', border: '1px solid #ddd', color: '#888',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
          {message && (
            <p style={{ fontSize: 11, marginTop: 6, color: message.type === 'error' ? '#e53e3e' : '#2A6B3C' }}>
              {message.text}
            </p>
          )}
        </div>
      </div>

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
