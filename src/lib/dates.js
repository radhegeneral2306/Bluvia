export const pad = (n) => String(n).padStart(2, '0');
export function dateKeyOf(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayKey = () => dateKeyOf(new Date());
/** YYYY-MM-DD -> Date at 12:00 local (avoids timezone day-shift) */
export function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
export function fmtDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}
export function startOfKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0); }
export function endOfKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); }
export function daysAgoKey(n) { const d = new Date(); d.setDate(d.getDate() - n); return dateKeyOf(d); }
