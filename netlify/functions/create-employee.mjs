import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || 'christina@makelab.com'
const APP_URL = process.env.URL || 'https://time.makelab.com'
const FROM_EMAIL = process.env.REMINDER_FROM_EMAIL || 'noreply@makelab.com'
const FROM_NAME = 'Makelab Time Tracker'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function generatePassword() {
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const special = '!@#$%&*'
  const all = lower + upper + digits + special
  // Guarantee at least one of each required type
  let pw = ''
  pw += lower[Math.floor(Math.random() * lower.length)]
  pw += upper[Math.floor(Math.random() * upper.length)]
  pw += digits[Math.floor(Math.random() * digits.length)]
  pw += special[Math.floor(Math.random() * special.length)]
  for (let i = 0; i < 4; i++) {
    pw += all[Math.floor(Math.random() * all.length)]
  }
  // Shuffle
  pw = pw.split('').sort(() => Math.random() - 0.5).join('')
  return `Mlab-${pw}`
}

async function sendCredentials(emp, password) {
  const sent = { email: false, slack: false }

  // Send via Mandrill email
  if (process.env.MANDRILL_API_KEY && emp.email) {
    try {
      const res = await fetch('https://mandrillapp.com/api/1.0/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: process.env.MANDRILL_API_KEY,
          message: {
            from_email: FROM_EMAIL,
            from_name: FROM_NAME,
            to: [{ email: emp.email, name: emp.full_name, type: 'to' }],
            subject: 'Your Makelab Time Tracker Login',
            html: buildCredentialEmail(emp.full_name, emp.email, password),
            text: `Hi ${emp.full_name},\n\nHere are your login credentials for the Makelab Time Tracker:\n\nEmail: ${emp.email}\nPassword: ${password}\nLogin: ${APP_URL}\n\nPlease log in and change your password if you'd like.\n\nThanks,\nMakelab`,
          },
        }),
      })
      const result = await res.json()
      sent.email = result?.[0]?.status === 'sent' || result?.[0]?.status === 'queued'
    } catch (err) {
      console.error(`Credential email failed for ${emp.full_name}:`, err)
    }
  }

  // Send via Slack DM
  if (process.env.SLACK_BOT_TOKEN && emp.slack_user_id) {
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: emp.slack_user_id,
          text: `:key: Hi ${emp.full_name}! Here are your Makelab Time Tracker login credentials:\n\n*Email:* ${emp.email}\n*Password:* \`${password}\`\n*Login:* <${APP_URL}|Open Time Tracker>\n\nPlease log in and change your password if you'd like.`,
        }),
      })
      sent.slack = true
    } catch (err) {
      console.error(`Credential Slack DM failed for ${emp.full_name}:`, err)
    }
  }

  return sent
}

function buildCredentialEmail(name, email, password) {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
  <div style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #1a1a1a;">Makelab</div>
  <p style="font-size: 15px; color: #333; line-height: 1.5; margin: 0 0 16px;">
    Hi ${name},
  </p>
  <p style="font-size: 15px; color: #333; line-height: 1.5; margin: 0 0 16px;">
    Here are your login credentials for the Makelab Time Tracker:
  </p>
  <div style="background: #f5f5f5; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
    <p style="font-size: 14px; color: #333; margin: 0 0 8px;"><strong>Email:</strong> ${email}</p>
    <p style="font-size: 14px; color: #333; margin: 0;"><strong>Password:</strong> <code style="background: #e5e5e5; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
  </div>
  <a href="${APP_URL}" style="display: inline-block; background: #f5a623; color: #1a1a1a; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
    Log In Now
  </a>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    — Makelab Time Tracker
  </p>
</div>`
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Check env vars before doing anything
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({
      error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    // Verify admin
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    const token = authHeader.slice(7)
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user?.email !== ADMIN_EMAIL) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json()
    const { action } = body

    // Reset password for existing employee
    if (action === 'reset_password') {
      const { employee_id } = body
      if (!employee_id) {
        return jsonResponse({ error: 'employee_id required' }, 400)
      }

      const { data: emp } = await supabase
        .from('employees')
        .select('auth_id, full_name, email, slack_user_id')
        .eq('id', employee_id)
        .single()

      if (!emp) {
        return jsonResponse({ error: 'Employee not found' }, 404)
      }

      let authId = emp.auth_id

      // If no auth_id linked, look up or create the auth user by email
      if (!authId && emp.email) {
        // Try to find existing auth user by email
        const { data: { users } } = await supabase.auth.admin.listUsers()
        const authUser = users?.find(u => u.email === emp.email)

        if (authUser) {
          authId = authUser.id
          // Link the auth_id to the employee record
          await supabase.from('employees').update({ auth_id: authId }).eq('id', employee_id)
        } else {
          // No auth user exists — create one
          const password = generatePassword()
          const { data: newAuth, error: createErr } = await supabase.auth.admin.createUser({
            email: emp.email,
            password,
            email_confirm: true,
          })
          if (createErr) {
            return jsonResponse({ error: createErr.message }, 500)
          }
          authId = newAuth.user.id
          await supabase.from('employees').update({ auth_id: authId }).eq('id', employee_id)
          const sent = await sendCredentials(emp, password)
          return jsonResponse({ ok: true, password, name: emp.full_name, created: true, sent })
        }
      }

      if (!authId) {
        return jsonResponse({ error: 'Employee has no email or auth account' }, 400)
      }

      const newPassword = generatePassword()
      const { error } = await supabase.auth.admin.updateUserById(authId, {
        password: newPassword,
      })

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }

      const sent = await sendCredentials(emp, newPassword)
      return jsonResponse({ ok: true, password: newPassword, name: emp.full_name, sent })
    }

    // Create new employee
    const { email, full_name, title, rate, pay_type, department, employee_type, fixed_amount, schedule, phone_number, tracks_hours } = body

    if (!email || !full_name) {
      return jsonResponse({ error: 'email and full_name are required' }, 400)
    }

    const password = generatePassword()

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      return jsonResponse({ error: authError.message }, 500)
    }

    // Insert employee record
    const empData = {
      auth_id: authData.user.id,
      full_name,
      email,
      phone_number: phone_number || null,
      title: title || null,
      pay_type: pay_type || 'W2',
      rate: rate ? Number(rate) : 0,
      department: department || 'General',
      employee_type: employee_type || 'hourly',
      fixed_amount: fixed_amount ? Number(fixed_amount) : null,
      schedule: schedule || { days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00' },
      tracks_hours: tracks_hours !== false,
      is_active: true,
    }

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .insert(empData)
      .select()
      .single()

    if (empError) {
      // Clean up auth user if employee insert fails
      await supabase.auth.admin.deleteUser(authData.user.id)
      return jsonResponse({ error: empError.message }, 500)
    }

    const sent = await sendCredentials({ full_name, email, slack_user_id: employee.slack_user_id }, password)
    return jsonResponse({ ok: true, employee, password, sent })
  } catch (err) {
    return jsonResponse({ error: err.message || 'Internal server error' }, 500)
  }
}
