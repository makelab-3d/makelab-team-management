import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TimeEntry from './TimeEntry'

export default function Home() {
  const { employee, isAdmin, isManager } = useAuth()
  const isHourly = (employee?.employee_type || 'hourly') === 'hourly'

  if (isAdmin) return <Navigate to="/admin" replace />
  if (isManager) return <Navigate to="/employees" replace />
  if (!isHourly) return <Navigate to="/profile" replace />
  return <TimeEntry />
}
