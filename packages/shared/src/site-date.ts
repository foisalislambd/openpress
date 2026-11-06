const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface SiteDateOptions {
  dateFormat?: string;
  timeFormat?: string;
  timeZone?: string;
  weekStartsOn?: string | number;
}

/** Formats a timestamp with the General settings the public site actually reads. */
export function formatSiteDate(value?: string | null, options: SiteDateOptions = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const zone = options.timeZone && isTimeZone(options.timeZone) ? options.timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = read('year');
  const month = Number(read('month'));
  const day = Number(read('day'));
  const hour = Number(read('hour'));
  const minute = read('minute').padStart(2, '0');
  const monthName = MONTHS[month - 1] ?? '';
  const dateText = formatDatePart(options.dateFormat || 'F j, Y', { year, month, day, monthName });
  const timeText = formatTimePart(options.timeFormat || 'g:i a', hour, minute);
  return `${dateText} at ${timeText}`;
}

export function weekStartsOnName(value?: string | number) {
  const day = Number(value ?? 1);
  if (day === 0) return 'Sunday';
  if (day === 6) return 'Saturday';
  return 'Monday';
}

function formatDatePart(
  format: string,
  parts: { year: string; month: number; day: number; monthName: string },
) {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  if (format === 'Y-m-d') return `${parts.year}-${month}-${day}`;
  if (format === 'm/d/Y') return `${month}/${day}/${parts.year}`;
  if (format === 'd/m/Y') return `${day}/${month}/${parts.year}`;
  return `${parts.monthName} ${parts.day}, ${parts.year}`;
}

function formatTimePart(format: string, hour: number, minute: string) {
  if (format === 'H:i') return `${String(hour).padStart(2, '0')}:${minute}`;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function isTimeZone(zone: string) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
