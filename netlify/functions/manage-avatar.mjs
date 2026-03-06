import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: caller } = await supabase
    .from('employees')
    .select('id, role, email')
    .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
    .single()

  if (!caller) {
    return new Response(JSON.stringify({ error: 'Employee not found' }), { status: 404 })
  }

  const formData = await req.formData()
  const action = formData.get('action')
  const targetId = formData.get('employee_id')

  const isAdmin = caller.role === 'admin' || caller.email === process.env.VITE_ADMIN_EMAIL
  const employeeId = targetId || caller.id

  if (employeeId !== caller.id && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 })
  }

  if (action === 'remove') {
    const { data: emp } = await supabase.from('employees').select('avatar_url').eq('id', employeeId).single()
    if (emp?.avatar_url) {
      const parts = emp.avatar_url.split('/avatars/')[1]
      if (parts) await supabase.storage.from('avatars').remove([parts.split('?')[0]])
    }
    const { error: updateErr } = await supabase
      .from('employees')
      .update({ avatar_url: null })
      .eq('id', employeeId)
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 })
    return new Response(JSON.stringify({ success: true, avatar_url: null }))
  }

  const file = formData.get('file')
  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 })
  }

  const ext = file.name.split('.').pop().toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return new Response(JSON.stringify({ error: 'Only jpg, png, webp allowed' }), { status: 400 })
  }

  if (file.size > 2 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File must be under 2MB' }), { status: 400 })
  }

  const fileName = `${employeeId}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(fileName, bytes, { contentType: file.type, upsert: true })

  if (uploadErr) {
    return new Response(JSON.stringify({ error: uploadErr.message }), { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
  const avatarUrl = urlData.publicUrl + '?t=' + Date.now()

  const { error: updateErr } = await supabase
    .from('employees')
    .update({ avatar_url: avatarUrl })
    .eq('id', employeeId)

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true, avatar_url: avatarUrl }))
}
