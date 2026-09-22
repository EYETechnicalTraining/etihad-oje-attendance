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
 * Returns formatted display date, e.g., "22 September 2026"
 */
export function formatDisplayDate(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
 * Rules:
 * - On or BEFORE 07:30:00 AM -> PRESENT
 * - AFTER 07:30:00 AM up to 08:00:00 AM -> LATE TO WORK
 * - AFTER 08:00:00 AM (if trainee logs in after 8am) -> LATE TO WORK (Transitions from No Show)
 */
export function calculateAttendanceStatus(dateObj?: Date): 'Present' | 'Late to Work' {
  const now = dateObj || new Date();
  
  // Format hours and minutes in 24h format for UAE time
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
