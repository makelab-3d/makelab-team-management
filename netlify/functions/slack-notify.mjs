import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'christina@makelab.com'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { type, payload } = await req.json()

  if (type === 'approval_request') {
    // DM Christina that a period is ready for approval
    if (!process.env.SLACK_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: 'SLACK_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: admin } = await supabase
      .from('employees')
      .select('slack_user_id')
      .eq('email', ADMIN_EMAIL)
      .single()

    if (admin?.slack_user_id) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          channel: admin.slack_user_id,
          text: `:clock3: *Pay period ${payload.start_date} to ${payload.end_date} is ready for approval*\n${payload.employee_count} employee(s) submitted timesheets.\n<${process.env.URL || 'https://time.makelab.com'}/#/admin|Review now>`,
        }),
      })
    }
  }

  if (type === 'employee_reminder') {
    // DM employees who haven't submitted hours
    if (!process.env.SLACK_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: 'SLACK_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    for (const emp of payload.employees || []) {
      if (!emp.slack_user_id) continue

      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: emp.slack_user_id,
          text: `:wave: Hey ${emp.full_name}! The pay period ending ${payload.end_date} closes soon. Please log your remaining hours: <${process.env.URL || 'https://time.makelab.com'}|Open Time Tracker>`,
        }),
      })
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
