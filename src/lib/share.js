import { downloadBlob } from './backup.js';
import { fmtDate } from './dates.js';
import { fromPaise } from './money.js';
import { isValidVpa } from './upi.js';

/** The UPI id to print in texts, or '' when none is set (or it is not a valid id). */
export const upiTextId = (settings) => (isValidVpa(settings?.upiId) ? String(settings.upiId).trim() : '');

export const pdfCurrency = (c) => (!c || c === '₹' ? 'Rs.' : c); // standard PDF fonts cannot print the rupee sign
export function pdfMoney(p, cur) {
  const n = Math.round(p || 0), abs = Math.abs(n);
  const r = new Intl.NumberFormat('en-IN').format(Math.floor(abs / 100));
  const paise = abs % 100;
  return `${n < 0 ? '-' : ''}${pdfCurrency(cur)} ${r}${paise ? '.' + String(paise).padStart(2, '0') : ''}`;
}

export function waLink(phone, text, countryCode = '91') {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // 09876543210 -> 9876543210
  if (d.length === 10 && countryCode) d = countryCode + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function jarsText(balance, jarName) {
  const parts = Object.entries(balance || {}).filter(([, n]) => n).map(([id, n]) => `${jarName(id)}: ${n}`);
  return parts.length ? parts.join(', ') : 'None';
}

export function billText({ bill, party, settings, jarName, money }) {
  const L = [];
  L.push(`*${settings.businessName}*`);
  if (settings.phone) L.push(`Ph: ${settings.phone}`);
  L.push(`Bill ${bill.billNo}  |  ${fmtDate(bill.dateKey)}`);
  L.push(`To: ${party?.name || bill.partyName}`);
  L.push('');
  for (const l of bill.lines) L.push(`${l.itemName}  ${l.qty} x ${money(l.rate)} = ${money(l.amount)}`);
  if (bill.discount) L.push(`Discount: -${money(bill.discount)}`);
  if (bill.extraCharge) L.push(`Extra: ${money(bill.extraCharge)}`);
  L.push(`*Total: ${money(bill.total)}*`);
  if (bill.depositCollectedInBill) L.push(`Deposit received: ${money(bill.depositCollectedInBill)}`);
  if (settings.showDuesOnPdf !== false) { // same switch as the PDF: Settings > show previous / total due lines
    const prev = bill.prevOutstanding || 0;
    const now = bill.newOutstanding ?? prev + bill.total;
    L.push('');
    if (prev < 0) L.push(`Advance: ${money(-prev)}`);
    else if (prev > 0) L.push(`Previous due: ${money(prev)}`);
    L.push(now < 0 ? `*Advance left: ${money(-now)}*` : `*Total due now: ${money(now)}*`);
    if (bill.jarBalanceAfter) L.push(`Jars with you: ${jarsText(bill.jarBalanceAfter, jarName)}`);
  }
  const upi = upiTextId(settings);
  if (upi) { L.push(''); L.push(`UPI: ${upi}`); }
  if (settings.footerNote) { L.push(''); L.push(settings.footerNote); }
  return L.join('\n');
}

export function statementText({ party, rows, settings, jarName, money }) {
  const L = [`*${settings.businessName}*`, `Statement: ${party.name}`, ''];
  L.push(`*Baaki: ${money(party.outstanding || 0)}*`);
  L.push(`Jars with you: ${jarsText(party.jarBalance, jarName)}`);
  if (party.depositBalance) L.push(`Deposit held: ${money(party.depositBalance)}`);
  L.push('', 'Recent entries:');
  for (const r of rows.slice(0, 15)) {
    const amt = r.d.outstanding ? ` ${r.d.outstanding > 0 ? '+' : '-'}${money(Math.abs(r.d.outstanding))}` : '';
    L.push(`${r.d.dateText} ${r.d.title}${r.d.detail ? ` (${r.d.detail})` : ''}${amt}`);
  }
  if (settings.footerNote) L.push('', settings.footerNote);
  return L.join('\n');
}

export function reminderText({ party, settings, jarName, money }) {
  const jars = jarsText(party.jarBalance, jarName);
  return `Namaste ${party.name},\n${settings.businessName} ki taraf se yaad dilana hai: aapka ${money(party.outstanding || 0)} baaki hai.${jars !== 'None' ? `\nAapke paas jars: ${jars}.` : ''}\nKripya jaldi payment kar dein.${upiTextId(settings) ? `\nUPI: ${upiTextId(settings)}` : ''}\nDhanyavaad!`;
}

/** Share via Web Share API (phones) else download. */
export async function sharePdf(doc, filename, title) {
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

export { fromPaise };
