/**
 * Timezone and Date utilities enforcing UAE Time (Asia/Dubai - UTC+4)
 */

export const UAE_TIMEZONE = 'Asia/Dubai';

/**
 * Gets current Date object in UAE timezone
 */
export function getUAEDate(referenceDate?: Date): Date {
  const base = referenceDate || new Date();
  const uaeString = base.toLocaleString('en-US', { timeZone: UAE_TIMEZONE });
  return new Date(uaeString);
}

/**
 * Returns YYYY-MM-DD format string in UAE timezone
 */
export function getUAEDateString(date?: Date): string {
  const target = date || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: UAE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(target); // Format: YYYY-MM-DD
}

/**
 * Returns formatted display date, e.g., "Tuesday, 22 September 2026"
 */
export function formatDisplayDate(dateString: string, includeDayOfWeek: boolean = true): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  
  if (includeDayOfWeek) {
    return dateObj.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into "01 Jan 2026" format
 */
export function formatMediumDate(dateString: string): string {
  if (!dateString) return '-';
  try {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dayStr = String(day).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${dayStr} ${months[month]} ${year}`;
    }
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      const dayStr = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${dayStr} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch {
    // fallback
  }
  return dateString;
}

/**
 * Checks if a given date string is a weekend (Saturday or Sunday)
 */
export function isWeekend(dateString: string): boolean {
  if (!dateString) return false;
  const [year, month, day] = dateString.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Generates array of YYYY-MM-DD strings for a given start and end date range
 */
export function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

  const start = new Date(sYear, sMonth - 1, sDay);
  const end = new Date(eYear, eMonth - 1, eDay);

  const current = new Date(start);
  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Returns formatted time string in UAE timezone, e.g. "07:22:15 AM" or "07:22 AM"
 */
export function getUAETimeString(date?: Date, includeSeconds = false): string {
  const target = date || new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: UAE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: true,
  });
  return formatter.format(target);
}

/**
 * Calculates attendance status automatically based on login timestamp (UAE time)
 */
export function calculateAttendanceStatus(dateObj?: Date): 'Present' | 'Late to Work' {
  const now = dateObj || new Date();
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: UAE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
    if (part.type === 'second') second = parseInt(part.value, 10);
  }

  const timeInSeconds = hour * 3600 + minute * 60 + second;
  const cutoff730 = 7 * 3600 + 30 * 60; // 07:30:00 in seconds (27000)

  if (timeInSeconds <= cutoff730) {
    return 'Present';
  } else {
    return 'Late to Work';
  }
}

/**
 * Helper to check if current UAE time is past 08:00 AM for a given date
 */
export function isPastCutoffTime(dateString: string): boolean {
  const todayString = getUAEDateString();
  if (dateString < todayString) return true; // Past dates are done
  if (dateString > todayString) return false; // Future dates not cut off yet

  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: UAE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  const timeInSeconds = hour * 3600 + minute * 60;
  const cutoff800 = 8 * 3600; // 08:00:00 AM
  return timeInSeconds >= cutoff800;
}

/**
 * Returns previous date string in YYYY-MM-DD
 */
export function getPreviousDateString(currentDateString: string): string {
  const [year, month, day] = currentDateString.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  dateObj.setDate(dateObj.getDate() - 1);
  return getUAEDateString(dateObj);
}

/**
 * Returns next date string in YYYY-MM-DD
 */
export function getNextDateString(currentDateString: string): string {
  const [year, month, day] = currentDateString.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  dateObj.setDate(dateObj.getDate() + 1);
  return getUAEDateString(dateObj);
}
