// Pure helpers for the owner's Changes screen (audit log). Covered by tests/auditView.test.js.
import { fmtDate } from './dates.js';

export const ACTION_LABELS = { edit: 'Edit', delete: 'Delete', restore: 'Restore' };
export const ACTION_TONES = { edit: 'blue', delete: 'red', restore: 'green' };
export const TYPE_LABELS = {
  bill: 'Bill', receipt: 'Receipt', jarReturn: 'Jar wapas', jarGiven: 'Jar diya', depositTaken: 'Deposit liya',
};
export const FIELD_LABELS = {
  type: 'Type', billNo: 'Bill no', partyId: 'Party', partyName: 'Party', dateKey: 'Date', total: 'Total', amount: 'Amount',
  qty: 'Qty', mode: 'Mode', reference: 'Reference', jarTypeId: 'Jar', discount: 'Discount', extraCharge: 'Extra charge',
  note: 'Note', deleted: 'Deleted', verified: 'Verified', subTotal: 'Sub total', linesSummary: 'Items',
};
const MONEY_FIELDS = new Set(['total', 'amount', 'discount', 'extraCharge', 'subTotal']);

export const actionLabel = (a) => ACTION_LABELS[a] || String(a || '');
export const typeLabel = (t) => TYPE_LABELS[t] || String(t || '');
export const fieldLabel = (k) => FIELD_LABELS[k] || k;

const millis = (ts) => {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
};
const p2 = (n) => String(n).padStart(2, '0');

/** Timestamp -> dd/mm/yyyy hh:mm (local). Empty string when unknown (e.g. server time not back yet). */
export function fmtAt(ts) {
  const m = millis(ts);
  if (m === null) return '';
  const d = new Date(m);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** One value as readable text. opts: { money(paise) -> text, jarName(id) -> text }. */
export function fmtValue(key, v, opts = {}) {
  if (v === undefined || v === null || v === '') return '-';
  if (MONEY_FIELDS.has(key) && typeof v === 'number') return opts.money ? opts.money(v) : String(v / 100);
  if (key === 'dateKey') return fmtDate(v);
  if (key === 'type') return typeLabel(v);
  if (key === 'deleted' || key === 'verified') return v ? 'Haan' : 'Nahi';
  if (key === 'jarTypeId' && opts.jarName) return opts.jarName(v) || String(v);
  return String(v);
}

/** Changed fields of one audit row as [{ key, label, from, to }]. partyId is hidden when partyName is shown. */
export function changePairs(row, opts = {}) {
  const before = row?.before || {};
  const after = row?.after || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => k !== 'partyId' || !('partyName' in before || 'partyName' in after));
  return keys.map((key) => ({
    key, label: fieldLabel(key), from: fmtValue(key, before[key], opts), to: fmtValue(key, after[key], opts),
  })).filter((p) => p.from !== p.to);
}

/** Short title of the entry an audit row is about: "Bill 123 / Sharma Store". */
export function entryTitle(row) {
  const c = row?.ctx || {};
  const type = c.type || row?.type;
  const head = type === 'bill' && c.billNo ? `${typeLabel(type)} ${c.billNo}` : typeLabel(type);
  return [head, c.partyName].filter(Boolean).join(' / ');
}

/** Amount of the entry in paise (bill total, else amount), or null. */
export function entryAmount(row) {
  const c = row?.ctx || {};
  if (typeof c.total === 'number') return c.total;
  if (typeof c.amount === 'number') return c.amount;
  return null;
}

/** Newest first; rows without a time (just written) go on top. */
export function sortByAtDesc(rows) {
  const k = (r) => millis(r.at) ?? Infinity;
  return [...rows].sort((a, b) => k(b) - k(a));
}

/** Distinct people in loaded rows, by name, with counts: [{ name, count }] most active first. */
export function peopleOf(rows) {
  const m = new Map();
  for (const r of rows) { const n = r?.by?.name || 'Unknown'; m.set(n, (m.get(n) || 0) + 1); }
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Filter rows by person name and action; empty / 'all' means no filter. */
export function filterRows(rows, { person = '', action = '' } = {}) {
  return rows.filter((r) => (!person || (r?.by?.name || 'Unknown') === person) && (!action || action === 'all' || r.action === action));
}

/** Group rows by calendar day (local) in the given order: [{ day: 'dd/mm/yyyy', rows }]. */
export function groupByDay(rows) {
  const out = [];
  for (const r of rows) {
    const day = fmtAt(r.at).slice(0, 10) || 'Abhi';
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(r); else out.push({ day, rows: [r] });
  }
  return out;
}

/** Unverified receipts: newest entry date first, then newest created; capped. */
export function sortPending(list, max = 100) {
  return [...list].sort((a, b) => {
    const d = String(b.dateKey || '').localeCompare(String(a.dateKey || ''));
    return d || (millis(b.createdAt) ?? Infinity) - (millis(a.createdAt) ?? Infinity);
  }).slice(0, max);
}
