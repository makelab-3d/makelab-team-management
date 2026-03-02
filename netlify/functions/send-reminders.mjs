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

// On-demand admin endpoint: POST to send reminders now
export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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

  const todayStr = new Date().toISOString().split('T')[0]

  // Find all open periods that have started
  const { data: periods } = await supabase
    .from('pay_periods')
    .select('*')
    .eq('status', 'open')
    .lte('start_date', todayStr)

  if (!periods?.length) {
    return jsonResponse({ ok: true, message: 'No open periods found', reminders: 0 })
  }

  // Get all active employees who track hours
  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, email, slack_user_id')
    .eq('is_active', true)
    .eq('tracks_hours', true)

  const hourlyEmployees = employees || []

  let totalReminders = 0
  const results = []

  for (const period of periods) {
    const { data: entries } = await supabase
      .from('time_entries')
      .select('employee_id')
      .eq('pay_period_id', period.id)

    const submittedIds = new Set((entries || []).map(e => e.employee_id))
    const needsReminder = hourlyEmployees.filter(emp => !submittedIds.has(emp.id))

    for (const emp of needsReminder) {
      let slackSent = false
      let emailSent = false

      // Slack DM
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
              text: `:wave: Hey ${emp.full_name}! Friendly reminder — you haven't logged any hours for the pay period ${period.start_date} to ${period.end_date}. Please submit your time: <${APP_URL}|Open Time Tracker>`,
            }),
          })
          slackSent = true
        } catch (err) {
          console.error(`Slack DM failed for ${emp.full_name}:`, err)
        }
      }

      // Mandrill email
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
                subject: 'Reminder: Log your hours this week',
                html: buildEmailHtml(emp.full_name, period),
                text: `Hi ${emp.full_name},\n\nFriendly reminder — you haven't logged any hours for the pay period ${period.start_date} to ${period.end_date}.\n\nPlease submit your time here: ${APP_URL}\n\nThanks,\nMakelab`,
              },
            }),
          })
          const result = await res.json()
          emailSent = result?.[0]?.status === 'sent' || result?.[0]?.status === 'queued'
        } catch (err) {
          console.error(`Mandrill email failed for ${emp.full_name}:`, err)
        }
      }

      totalReminders++
      results.push({
        name: emp.full_name,
        period: `${period.start_date} to ${period.end_date}`,
        slack: slackSent,
        email: emailSent,
      })
    }
  }

  // DM admin a summary
  if (process.env.SLACK_BOT_TOKEN && results.length > 0) {
    const { data: admin } = await supabase
      .from('employees')
      .select('slack_user_id')
      .eq('email', ADMIN_EMAIL)
      .single()

    if (admin?.slack_user_id) {
      let message = `:mega: *Manual Reminder Sent*\n${results.length} reminder(s):\n`
      for (const r of results) {
        const channels = [r.slack ? 'Slack' : null, r.email ? 'email' : null].filter(Boolean).join(' + ')
        message += `• ${r.name} — ${r.period}${channels ? ` (${channels})` : ''}\n`
      }
      try {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({ channel: admin.slack_user_id, text: message }),
        })
      } catch (err) {
        console.error('Admin DM failed:', err)
      }
    }
  }

  return jsonResponse({ ok: true, reminders: totalReminders, results })
}

function buildEmailHtml(name, period) {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
  <div style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #1a1a1a;">Makelab</div>
  <p style="font-size: 15px; color: #333; line-height: 1.5; margin: 0 0 16px;">
    Hi ${name},
  </p>
  <p style="font-size: 15px; color: #333; line-height: 1.5; margin: 0 0 16px;">
    Friendly reminder — you haven't logged any hours for the pay period
    <strong>${period.start_date}</strong> to <strong>${period.end_date}</strong>.
  </p>
  <p style="font-size: 15px; color: #333; line-height: 1.5; margin: 0 0 24px;">
    Please submit your time so we can process payroll on schedule.
  </p>
  <a href="${APP_URL}" style="display: inline-block; background: #f5a623; color: #1a1a1a; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
    Log Your Hours
  </a>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    — Makelab Time Tracker
  </p>
</div>`
}
