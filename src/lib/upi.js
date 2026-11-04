// UPI payment link and QR helpers (pure functions, unit tested).
// A UPI link opens the customer's payment app with payee, amount and remark filled in. Whether the customer may CHANGE the amount
// depends on their payment app; the bill therefore prints a note. The app cannot see when a payment arrives: a receipt is entered by hand.

export const REMARK_DEFAULT = 'Bill {billNo}';
export const QR_AMOUNT_MODES = ['bill', 'due'];   // 'bill' = this bill's amount, 'due' = the party's total due after this bill

/** name@bank, for example shop@okaxis. Loose on purpose: banks add many handles. */
export function isValidVpa(v) {
  return typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v.trim());
}

/** paise (integer) -> '123.45' for the link. Empty string when there is nothing to pay. */
export function upiAmount(paise) {
  const n = Math.round(Number(paise) || 0);
  if (n <= 0) return '';
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
}

const clean = (s, max) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** {billNo} and {party} are replaced; result is trimmed to 50 characters (what UPI apps accept). */
export function fillRemark(template, { billNo = '', partyName = '' } = {}) {
  const t = String(template ?? '').trim() || REMARK_DEFAULT;
  return clean(t.replace(/\{billNo\}/g, billNo).replace(/\{party\}/g, partyName), 50);
}

/** upi://pay?... ; amount is left out when it is 0 so the customer types it. Returns '' if the UPI id is invalid. */
export function buildUpiLink({ vpa, name = '', amountPaise = 0, note = '' }) {
  if (!isValidVpa(vpa)) return '';
  const q = [`pa=${encodeURIComponent(vpa.trim())}`];
  const pn = clean(name, 60); if (pn) q.push(`pn=${encodeURIComponent(pn)}`);
  const am = upiAmount(amountPaise); if (am) q.push(`am=${am}`);
  q.push('cu=INR');
  const tn = clean(note, 50); if (tn) q.push(`tn=${encodeURIComponent(tn)}`);
  return `upi://pay?${q.join('&')}`;
}

export const upiConfigured = (settings) => isValidVpa(settings?.upiId);

/** Amount (paise) the QR should ask for. due = outstanding AFTER the bill; falls back to the bill when no positive due. */
export function qrAmountFor(settings, { billTotal = 0, due = 0 } = {}) {
  if (settings?.upiQrAmount === 'due' && due > 0) return due;
  return Math.max(0, Math.round(billTotal || 0));
}

/** PNG data URL of a QR code (loaded lazily so the first screen stays light). */
export async function qrDataUrl(text, { size = 320, margin = 1 } = {}) {
  const QR = await import('qrcode');
  return (QR.default || QR).toDataURL(text, { width: size, margin, errorCorrectionLevel: 'M' });
}
