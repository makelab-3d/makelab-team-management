import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: err } = await signIn(email, password)
    setSubmitting(false)

    if (err) {
      setError(err.message)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">MAKELAB</div>
        <h1 className="login-title">Team Management</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email" className="login-label">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@makelab.com"
            required
            autoFocus
            className="input"
          />

          <label htmlFor="password" className="login-label" style={{ marginTop: 12 }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            className="input"
          />

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={submitting} className="btn btn-primary btn-full" style={{ marginTop: 16 }}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
