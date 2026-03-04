import { useAuth } from '../../context/AuthContext'
import LoginPage from './LoginPage'

export default function ProtectedRoute({ children }) {
  const { user, employee, loading, hasAppAccess, signOut } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (!employee) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">MAKELAB</div>
          <h2>Account Not Found</h2>
          <p className="text-muted">
            Your email is not linked to an employee profile. Contact your admin to get set up.
          </p>
        </div>
      </div>
    )
  }

  if (!hasAppAccess) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">MAKELAB</div>
          <h2>Access Denied</h2>
          <p className="text-muted">
            You don't have permission to access this app. Contact your admin to request access.
          </p>
          <button onClick={signOut} className="btn btn-link" style={{ marginTop: 16 }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return children
}
