import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || 'christina@makelab.com'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Missing env vars' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Verify admin
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (user?.email !== ADMIN_EMAIL) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json()
  const { action } = body

  // Get all permissions + defaults for the access matrix
  if (action === 'get_all') {
    const [perms, defaults, employees] = await Promise.all([
      supabase.from('app_permissions').select('*'),
      supabase.from('role_app_defaults').select('*'),
      supabase.from('employees').select('id, full_name, email, role, is_active').order('full_name'),
    ])
    return json({
      permissions: perms.data || [],
      defaults: defaults.data || [],
      employees: employees.data || [],
    })
  }

  // Set per-user permission
  if (action === 'set_permission') {
    const { employee_id, app_slug, has_access } = body
    if (!employee_id || !app_slug) return json({ error: 'employee_id and app_slug required' }, 400)

    const { error } = await supabase
      .from('app_permissions')
      .upsert({ employee_id, app_slug, has_access }, { onConflict: 'employee_id,app_slug' })

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // Remove per-user override (fall back to role default)
  if (action === 'remove_permission') {
    const { employee_id, app_slug } = body
    if (!employee_id || !app_slug) return json({ error: 'employee_id and app_slug required' }, 400)

    const { error } = await supabase
      .from('app_permissions')
      .delete()
      .eq('employee_id', employee_id)
      .eq('app_slug', app_slug)

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // Update role default
  if (action === 'set_role_default') {
    const { role, app_slug, has_access } = body
    if (!role || !app_slug) return json({ error: 'role and app_slug required' }, 400)

    const { error } = await supabase
      .from('role_app_defaults')
      .upsert({ role, app_slug, has_access }, { onConflict: 'role,app_slug' })

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
}
