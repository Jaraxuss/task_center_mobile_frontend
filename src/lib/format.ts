import { APP_TIME_ZONE } from '../utils';

const BOARD_CONTENT_MAX_MIN = 20;
const BOARD_CONTENT_MAX_DEFAULT = 50;
const BOARD_CONTENT_MAX_LIMIT = 200;

export { BOARD_CONTENT_MAX_MIN, BOARD_CONTENT_MAX_DEFAULT, BOARD_CONTENT_MAX_LIMIT };

export function clampBoardContentMaxLength(value: number) {
  if (!Number.isFinite(value)) return BOARD_CONTENT_MAX_DEFAULT;
  return Math.min(BOARD_CONTENT_MAX_LIMIT, Math.max(BOARD_CONTENT_MAX_MIN, Math.round(value)));
}

export function truncateText(value: string, maxLength?: number) {
  if (!maxLength || value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength)).trimEnd()}…`;
}

export function formatDateTimeInput(value?: string | null) {
  if (!value) return '';
  const normalized = value.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return normalized;
  const withSecondsMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(?:\.\d+)?$/);
  if (withSecondsMatch) return withSecondsMatch[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function toIsoOrNull(value: string) {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return null;
  return new Date(`${normalized}:00+08:00`).toISOString();
}

export function localNowString() {
  return toIsoOrNull(formatDateTimeInput(new Date().toISOString())) || new Date().toISOString();
}
