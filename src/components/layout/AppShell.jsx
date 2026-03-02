import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">MAKELAB</span>
        <span className="app-title">Team Management</span>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
