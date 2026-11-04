// Money is always stored as INTEGER paise. Never use float rupees in stored data.

/** Largest amount the app accepts anywhere: 100 crore rupees, in paise. Keeps every sum far below 2^53. */
export const MAX_PAISE = 10000000000;

/** "123.45" | 123.45 -> 12345 (integer paise). Invalid -> 0. Uses string maths, no float drift. Clamped to +-MAX_PAISE. */
export function toPaise(value) {
  if (value === '' || value == null) return 0;
  const s = String(value).trim().replace(/,/g, '');
  if (!/^-?\d*\.?\d*$/.test(s) || s === '' || s === '-' || s === '.') return 0;
  const neg = s.startsWith('-');
  const [i = '', f = ''] = s.replace('-', '').split('.');
  let p = Number(i || 0) * 100 + Number((f + '00').slice(0, 2));
  if (f.length > 2 && f[2] >= '5') p += 1; // round half up on the 3rd decimal
  if (!(p <= MAX_PAISE)) p = MAX_PAISE; // absurd input (also covers precision loss on very long digit strings)
  return neg ? -p : p;
}

/** 12345 -> "123.45" (for input boxes) */
export function fromPaise(p) {
  const n = Math.round(Number(p) || 0);
  const abs = Math.abs(n);
  return `${n < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 12345 -> "₹123.45" ; whole amounts shown without decimals */
export function fmtMoney(p, currency = '₹') {
  const n = Math.round(Number(p) || 0);
  const abs = Math.abs(n);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const r = new Intl.NumberFormat('en-IN').format(rupees);
  const body = paise ? `${r}.${String(paise).padStart(2, '0')}` : r;
  return `${n < 0 ? '-' : ''}${currency}${body}`;
}

/** qty x rate(paise) -> integer paise, rounded */
export function lineAmount(qty, ratePaise) {
  const q = Number(qty) || 0;
  const r = Number(ratePaise) || 0;
  return Math.round(Number((q * r).toFixed(6)));
}

export function billTotals(lines, discount = 0, extraCharge = 0) {
  const subTotal = (lines || []).reduce((s, l) => s + (l.amount || 0), 0);
  return { subTotal, total: subTotal - (discount || 0) + (extraCharge || 0) };
}
