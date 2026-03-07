/**
 * Makelab Company Holidays — ported from holiday-hub
 * Returns ISO date strings for all company holidays in a given year.
 */

function pad(n) { return String(n).padStart(2, '0') }
function toISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }

function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month - 1, 1).getDay()
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(year, month, 0).getDate()
  const lastDow = new Date(year, month - 1, lastDay).getDay()
  return lastDay - ((lastDow - weekday + 7) % 7)
}

function observed(year, month, day) {
  const d = new Date(year, month - 1, day)
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() - 1) // Sat → Fri
  if (dow === 0) d.setDate(d.getDate() + 1) // Sun → Mon
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getHolidaysForYear(year) {
  const h = []

  h.push({ name: "New Year's Day", date: toISO(year, 1, 1) })
  h.push({ name: "MLK Jr. Day", date: toISO(year, 1, nthWeekdayOfMonth(year, 1, 1, 3)) })
  h.push({ name: "Presidents' Day", date: toISO(year, 2, nthWeekdayOfMonth(year, 2, 1, 3)) })
  h.push({ name: "Int'l Women's Day", date: observed(year, 3, 8) })
  h.push({ name: "Memorial Day", date: toISO(year, 5, lastWeekdayOfMonth(year, 5, 1)) })
  h.push({ name: "Juneteenth", date: toISO(year, 6, 19) })
  h.push({ name: "Independence Day", date: toISO(year, 7, 4) })
  h.push({ name: "Labor Day", date: toISO(year, 9, nthWeekdayOfMonth(year, 9, 1, 1)) })
  h.push({ name: "Indigenous Peoples' Day", date: toISO(year, 10, nthWeekdayOfMonth(year, 10, 1, 2)) })
  h.push({ name: "Veterans Day", date: toISO(year, 11, 11) })

  const tday = nthWeekdayOfMonth(year, 11, 4, 4)
  h.push({ name: "Thanksgiving", date: toISO(year, 11, tday) })
  h.push({ name: "Thanksgiving Friday", date: toISO(year, 11, tday + 1) })

  h.push({ name: "Christmas Eve", date: toISO(year, 12, 24) })
  h.push({ name: "Christmas Day", date: toISO(year, 12, 25) })
  h.push({ name: "Day After Christmas", date: toISO(year, 12, 26) })

  for (let d = 27; d <= 31; d++) {
    h.push({ name: "Winter Break", date: toISO(year, 12, d) })
  }

  return h
}

/** Build a Set of holiday date strings covering the given date range */
export function getHolidaySet(startDate, endDate) {
  const startYear = new Date(startDate + 'T00:00:00').getFullYear()
  const endYear = new Date(endDate + 'T00:00:00').getFullYear()
  const dates = new Set()
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getHolidaysForYear(y)) {
      dates.add(h.date)
    }
  }
  return dates
}

/** Get the holiday name for a specific date, or null */
export function getHolidayName(dateStr) {
  const year = new Date(dateStr + 'T00:00:00').getFullYear()
  const holiday = getHolidaysForYear(year).find(h => h.date === dateStr)
  return holiday ? holiday.name : null
}
