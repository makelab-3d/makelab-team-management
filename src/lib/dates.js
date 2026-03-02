/** Get all dates in a pay period as an array of YYYY-MM-DD strings */
export function getPeriodDays(startDate, endDate) {
  const days = []
  const current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    days.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

/** Format a Date object as YYYY-MM-DD */
export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Format YYYY-MM-DD as "Mon 3/2" */
export function formatDayShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`
}

/** Format YYYY-MM-DD as "Mar 2" */
export function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}`
}

/** Format YYYY-MM-DD as "Mar 2 - Mar 15, 2026" (period range with year) */
export function formatPeriodRange(startDate, endDate) {
  const endYear = new Date(endDate + 'T00:00:00').getFullYear()
  return `${formatDateShort(startDate)} - ${formatDateShort(endDate)}, ${endYear}`
}

/** Get year from YYYY-MM-DD */
export function getYear(dateStr) {
  return new Date(dateStr + 'T00:00:00').getFullYear()
}

/** Check if a date string is today */
export function isToday(dateStr) {
  return dateStr === formatDate(new Date())
}

/** Check if a date is a weekend */
export function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

/** Get today as YYYY-MM-DD */
export function today() {
  return formatDate(new Date())
}
