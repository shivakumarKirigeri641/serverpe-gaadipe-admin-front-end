/**
 * format.js — how numbers, money, dates and plates are written.
 *
 * In one place because the panel is read at a glance: ₹19 written three ways
 * across three screens is three things to reconcile in the reader's head.
 * Money is held in paise everywhere, as it is in the database, and only ever
 * becomes rupees here.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const rupees = (paise, { decimals = false } = {}) => {
  const v = Number(paise || 0) / 100;
  return `₹${v.toLocaleString('en-IN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
};

export const count = (n) => Number(n || 0).toLocaleString('en-IN');

export const date = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—'
    : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const dateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${date(v)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * "3 minutes ago" — how a live screen reports time.
 * Seconds are rounded away above a minute: a row that re-renders every three
 * seconds should not flicker between "58 seconds" and "59 seconds".
 */
export const ago = (v) => {
  if (!v) return '—';
  const ms = Date.now() - new Date(v).getTime();
  if (Number.isNaN(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return date(v);
};

/** Days until a date, negative when it has passed. */
export const daysTo = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
};

/** " ka 02 ex-1480" -> "KA02EX1480": always written without spaces. */
export const plate = (reg) => {
  const s = String(reg || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s;
};

/** 9886122415 -> "98861 22415", which is how an Indian number is read aloud. */
export const mobile = (m) => {
  const s = String(m || '').replace(/\D/g, '').slice(-10);
  return s.length === 10 ? `${s.slice(0, 5)} ${s.slice(5)}` : (m || '—');
};

export const percent = (part, whole) =>
  (!whole ? '0%' : `${Math.round((Number(part) / Number(whole)) * 100)}%`);

/** Up, down or flat against yesterday — with the words the reader wants. */
export const change = (now, before) => {
  const a = Number(now || 0); const b = Number(before || 0);
  if (!b && !a) return { dir: 'flat', text: 'same as yesterday' };
  if (!b) return { dir: 'up', text: 'first today' };
  const pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return { dir: 'flat', text: 'same as yesterday' };
  return { dir: pct > 0 ? 'up' : 'down', text: `${pct > 0 ? '+' : ''}${pct}% vs yesterday` };
};
