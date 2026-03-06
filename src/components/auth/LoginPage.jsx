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
    if (err) setError(err.message)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="https://d3k81ch9hvuctc.cloudfront.net/company/SSAACi/images/629fa4cf-df38-4cb4-b46d-0aff3d6c9eed.png" alt="Makelab" style={styles.logo} />
        <h1 style={styles.title}>Team Management</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@makelab.com"
            required
            autoFocus
            style={styles.input}
          />
          <label style={{ ...styles.label, marginTop: 12 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#f5f5f5',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  card: { width: '100%', maxWidth: 360, textAlign: 'center' },
  logo: { width: 120, height: 'auto', marginBottom: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' },
  title: { fontSize: 22, fontWeight: 400, marginBottom: 32, color: '#222' },
  form: { textAlign: 'left' },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#666', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #ddd', background: '#fff', color: '#222',
    borderRadius: 4, marginBottom: 16, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  error: { fontSize: 13, color: '#e53e3e', marginBottom: 12 },
  button: {
    width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 500, color: '#222',
    background: '#ffcc00', border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 8, fontFamily: 'inherit',
  },
}
