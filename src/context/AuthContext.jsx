import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SESSION_TIMEOUT = 5 * 60 * 60 * 1000  // 5 hours
const SESSION_KEY = 'makelab_session_start'

const APP_SLUG = 'team-management'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [hasAppAccess, setHasAppAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        if (!localStorage.getItem(SESSION_KEY)) localStorage.setItem(SESSION_KEY, Date.now().toString())
        fetchEmployee(session.user.id, session.user.email)
      }
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchEmployee(session.user.id, session.user.email)
      else {
        setEmployee(null)
        setHasAppAccess(false)
        setLoading(false)
      }
    })

    // Check session timeout every minute
    function checkSessionExpiry() {
      const start = localStorage.getItem(SESSION_KEY)
      if (start && Date.now() - parseInt(start) > SESSION_TIMEOUT) {
        signOut()
      }
    }
    checkSessionExpiry()
    const expiryInterval = setInterval(checkSessionExpiry, 60000)

    return () => { subscription.unsubscribe(); clearInterval(expiryInterval) }
  }, [])

  async function fetchEmployee(authId, email) {
    let { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('auth_id', authId)
      .single()

    if ((error || !data) && email) {
      const res = await supabase
        .from('employees')
        .select('*')
        .eq('email', email)
        .single()

      if (res.data) {
        if (!res.data.auth_id) {
          await supabase
            .from('employees')
            .update({ auth_id: authId })
            .eq('id', res.data.id)
          res.data.auth_id = authId
        }
        data = res.data
        error = null
      }
    }

    if (error || !data) {
      setEmployee(null)
      setHasAppAccess(false)
      setLoading(false)
      return
    }

    setEmployee(data)
    await checkAppAccess(data)
    setLoading(false)
  }

  async function checkAppAccess(emp) {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
    if (emp.role === 'admin' || emp.email === adminEmail) {
      setHasAppAccess(true)
      return
    }

    const { data: override } = await supabase
      .from('app_permissions')
      .select('has_access')
      .eq('employee_id', emp.id)
      .eq('app_slug', APP_SLUG)
      .maybeSingle()

    if (override) {
      setHasAppAccess(override.has_access)
      return
    }

    const { data: roleDefault } = await supabase
      .from('role_app_defaults')
      .select('has_access')
      .eq('role', emp.role || 'employee')
      .eq('app_slug', APP_SLUG)
      .maybeSingle()

    setHasAppAccess(roleDefault?.has_access ?? true)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) localStorage.setItem(SESSION_KEY, Date.now().toString())
    return { error }
  }

  async function signOut() {
    localStorage.removeItem(SESSION_KEY)
    await supabase.auth.signOut()
    setUser(null)
    setEmployee(null)
    setHasAppAccess(false)
  }

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
  const isAdmin = employee?.role === 'admin' || employee?.email === adminEmail
  const isManager = employee?.role === 'manager'

  return (
    <AuthContext.Provider value={{ user, employee, loading, signIn, signOut, isAdmin, isManager, hasAppAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
