import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'christina@makelab.com'

// Scheduled function: runs daily at midnight ET (0 5 * * * UTC)
// DMs Christina when a period has ended and who hasn't entered hours
// Does NOT auto-close — Christina closes manually
export default async function handler() {
  if (!process.env.SLACK_BOT_TOKEN) {
    return new Response(JSON.stringify({ skipped: 'SLACK_BOT_TOKEN not configured' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Look up Christina's slack_user_id
  const { data: admin } = await supabase
    .from('employees')
    .select('slack_user_id')
    .eq('email', ADMIN_EMAIL)
    .single()

  if (!admin?.slack_user_id) {
    console.error('Admin slack_user_id not found for', ADMIN_EMAIL)
    return new Response(JSON.stringify({ skipped: 'admin slack_user_id not found' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const today = new Date().toISOString().split('T')[0]

  // Find open periods that have ended
  const { data: periods, error } = await supabase
    .from('pay_periods')
    .select('*')
    .eq('status', 'open')
    .lt('end_date', today)

  if (error) {
    console.error('Error fetching periods:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!periods?.length) {
    return new Response(JSON.stringify({ ok: true, notified: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let notified = 0

  for (const period of periods) {
    // Get active employees who track hours
    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('is_active', true)
      .eq('tracks_hours', true)

    // Get employees who have submitted entries for this period
    const { data: entries } = await supabase
      .from('time_entries')
      .select('employee_id')
      .eq('pay_period_id', period.id)

    const submittedIds = new Set((entries || []).map(e => e.employee_id))
    const missing = (employees || []).filter(emp => !submittedIds.has(emp.id))

    // Days since period ended
    const endDate = new Date(period.end_date + 'T00:00:00')
    const now = new Date(today + 'T00:00:00')
    const daysPast = Math.floor((now - endDate) / (1000 * 60 * 60 * 24))

    // Close deadline is 7 days after period ends
    const daysToDeadline = 7 - daysPast

    let message = `:calendar: *Pay period ${period.start_date} to ${period.end_date} ended ${daysPast} day(s) ago*\n`
    message += `${submittedIds.size} of ${(employees || []).length} employees submitted hours.\n`

    if (missing.length > 0) {
      message += `\n:warning: *Missing hours:*\n`
      for (const emp of missing) {
        message += `\u2022 ${emp.full_name}\n`
      }
    }

    if (daysToDeadline > 0) {
      message += `\n:clock3: *${daysToDeadline} day(s) until close deadline*`
    } else {
      message += `\n:rotating_light: *Close deadline has passed!*`
    }

    message += `\n<${process.env.URL || 'https://time.makelab.com'}/#/admin|Review & close>`

    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ channel: admin.slack_user_id, text: message }),
      })
      notified++
    } catch (err) {
      console.error('Slack DM failed:', err)
    }
  }

  return new Response(JSON.stringify({ ok: true, notified }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
