import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchEmployee(session.user.id, session.user.email)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchEmployee(session.user.id, session.user.email)
      else {
        setEmployee(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchEmployee(authId, email) {
    // Try by auth_id first
    let { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('auth_id', authId)
      .single()

    // Fallback: match by email and link the auth_id
    if ((error || !data) && email) {
      const res = await supabase
        .from('employees')
        .select('*')
        .eq('email', email)
        .single()

      if (res.data) {
        // Auto-link auth_id if not set
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
    } else {
      setEmployee(data)
    }
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setEmployee(null)
  }

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
  const isAdmin = employee?.role === 'admin' || employee?.email === adminEmail
  const isManager = employee?.role === 'manager'

  return (
    <AuthContext.Provider value={{ user, employee, loading, signIn, signOut, isAdmin, isManager }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
