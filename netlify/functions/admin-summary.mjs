import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()

  // List all employees (for admin overview)
  if (body.action === 'list-employees') {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('full_name')

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ employees: data || [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { pay_period_id } = body
  if (!pay_period_id) {
    return new Response(JSON.stringify({ error: 'pay_period_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch all time entries for this period grouped by employee
  const { data: entries, error: entriesErr } = await supabase
    .from('time_entries')
    .select('*, employees(full_name, rate, pay_type)')
    .eq('pay_period_id', pay_period_id)
    .order('work_date', { ascending: true })

  if (entriesErr) {
    return new Response(JSON.stringify({ error: entriesErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Group by employee
  const byEmployee = {}
  for (const entry of entries || []) {
    const eid = entry.employee_id
    if (!byEmployee[eid]) {
      byEmployee[eid] = {
        employee_id: eid,
        full_name: entry.employees?.full_name || 'Unknown',
        rate: Number(entry.employees?.rate || 0),
        pay_type: entry.employees?.pay_type || 'W2',
        total_hours: 0,
        gross_amount: 0,
        entries: [],
      }
    }
    byEmployee[eid].entries.push(entry)
    byEmployee[eid].total_hours += Number(entry.net_hours || 0)
  }

  // Calculate gross amounts
  for (const emp of Object.values(byEmployee)) {
    emp.total_hours = Math.round(emp.total_hours * 100) / 100
    emp.gross_amount = Math.round(emp.total_hours * emp.rate * 100) / 100
  }

  return new Response(JSON.stringify({
    employees: Object.values(byEmployee),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
