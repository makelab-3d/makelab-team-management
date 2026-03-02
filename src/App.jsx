import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppShell from './components/layout/AppShell'
import Home from './pages/Home'
import History from './pages/History'
import Profile from './pages/Profile'
import AdminApproval from './pages/AdminApproval'
import Employees from './pages/Employees'
import Schedule from './pages/Schedule'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="history" element={<History />} />
            <Route path="profile" element={<Profile />} />
            <Route path="admin" element={<AdminApproval />} />
            <Route path="employees" element={<Employees />} />
            <Route path="schedule" element={<Schedule />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
