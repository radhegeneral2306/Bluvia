// PDF builders (jsPDF is loaded lazily so the first screen stays light).
import { fmtDate } from './dates.js';
import { pdfMoney, jarsText } from './share.js';

async function newDoc(layout, heightMm) {
  const { jsPDF } = await import('jspdf');
  if (layout === 'thermal') return new jsPDF({ unit: 'mm', format: [80, Math.max(120, heightMm)] });
  return new jsPDF({ unit: 'mm', format: 'a5' });
}

async function buildThermalPdf({ bill, party, settings, jarName }) {
  const layout = 'thermal';
  const cur = settings.currency;
  const m = (p) => pdfMoney(p, cur);
  const thermal = layout === 'thermal';
  const W = thermal ? 80 : 148;
  const pad = thermal ? 4 : 10;
  const est = 70 + bill.lines.length * 9 + (bill.note ? 8 : 0) + (settings.footerNote ? 10 : 0);
  const doc = await newDoc(layout, est);
  let y = pad + 2;
  const center = (t, size, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.text(t, W / 2, y, { align: 'center', maxWidth: W - 2 * pad }); y += size * 0.45 + 1.5; };
  const row = (l, r, bold, size = thermal ? 8 : 10) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.text(l, pad, y); doc.text(r, W - pad, y, { align: 'right' }); y += size * 0.45 + 1.5; };
  const rule = () => { doc.setLineWidth(0.2); doc.line(pad, y, W - pad, y); y += 3; };

  center(settings.businessName, thermal ? 12 : 16, true);
  if (settings.address) { doc.setFont('helvetica', 'normal'); doc.setFontSize(thermal ? 7 : 9); const lines = doc.splitTextToSize(settings.address, W - 2 * pad); doc.text(lines, W / 2, y, { align: 'center' }); y += lines.length * 4; }
  if (settings.phone) center(`Ph: ${settings.phone}`, thermal ? 7 : 9);
  y += 1; rule();
  row(`Bill No: ${bill.billNo}`, `Date: ${fmtDate(bill.dateKey)}`, true);
  row(`Party: ${party?.name || bill.partyName}`, party?.phone || '');
  rule();

  // lines table
  const fs = thermal ? 8 : 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(fs);
  const cQty = thermal ? 40 : 82, cRate = thermal ? 55 : 104, cAmt = W - pad;
  doc.text('Item', pad, y); doc.text('Qty', cQty, y, { align: 'right' }); doc.text('Rate', cRate, y, { align: 'right' }); doc.text('Amount', cAmt, y, { align: 'right' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  for (const l of bill.lines) {
    const nm = doc.splitTextToSize(l.itemName, thermal ? 22 : 62);
    doc.text(nm, pad, y);
    doc.text(String(l.qty), cQty, y, { align: 'right' });
    doc.text(m(l.rate).replace(/^(Rs\.|\S+) /, ''), cRate, y, { align: 'right' });
    doc.text(m(l.amount).replace(/^(Rs\.|\S+) /, ''), cAmt, y, { align: 'right' });
    y += Math.max(1, nm.length) * (fs * 0.45 + 1) + 1;
  }
  rule();
  if (bill.discount || bill.extraCharge) row('Sub total', m(bill.subTotal ?? bill.lines.reduce((s, l) => s + l.amount, 0)));
  if (bill.discount) row('Discount', `- ${m(bill.discount)}`);
  if (bill.extraCharge) row('Extra charge', m(bill.extraCharge));
  row('TOTAL', m(bill.total), true, thermal ? 10 : 12);
  y += 1;
  if (bill.depositCollectedInBill) row('Deposit received (not in total)', m(bill.depositCollectedInBill));
  row('Previous due', m(bill.prevOutstanding || 0));
  row('This bill', m(bill.total));
  row('TOTAL DUE', m(bill.newOutstanding ?? (bill.prevOutstanding || 0) + bill.total), true);
  if (bill.jarBalanceAfter) {
    y += 1; doc.setFont('helvetica', 'normal'); doc.setFontSize(thermal ? 7.5 : 9);
    const t = doc.splitTextToSize(`Jars with you: ${jarsText(bill.jarBalanceAfter, jarName)}`, W - 2 * pad); doc.text(t, pad, y); y += t.length * 4;
  }
  if (bill.note) { doc.setFontSize(thermal ? 7.5 : 9); const t = doc.splitTextToSize(`Note: ${bill.note}`, W - 2 * pad); doc.text(t, pad, y); y += t.length * 4; }
  if (settings.footerNote) { y += 3; rule(); doc.setFont('helvetica', 'italic'); doc.setFontSize(thermal ? 7.5 : 9); const t = doc.splitTextToSize(settings.footerNote, W - 2 * pad); doc.text(t, W / 2, y, { align: 'center' }); }
  return doc;
}


// ---------- logo (original JPEG, embedded as-is) ----------
let logoCache = null;
export async function loadLogo() {
  if (logoCache) return logoCache;
  const res = await fetch('/logo.jpg');
  const blob = await res.blob();
  logoCache = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return logoCache;
}
const LOGO_RATIO = 364 / 169; // original logo.jpg pixel size

const TEAL = [2, 118, 127];   // INVOICE heading
const NAVY = [0, 61, 89];     // labels, table header, footer
const ddmmyy = (key) => { const [y, m, d] = key.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const plainAmount = (p) => {
  const n = Math.round(p || 0), abs = Math.abs(n), paise = abs % 100;
  const r = new Intl.NumberFormat('en-IN', { useGrouping: abs >= 100000 }).format(Math.floor(abs / 100));
  return `${n < 0 ? '-' : ''}${r}${paise ? '.' + String(paise).padStart(2, '0') : ''}`;
};

/** Jar-type columns of the invoice table: <code>D for each jar type, then <code>R for each (e.g. ND CD NR CR). */
export function jarColumns(jarTypes, bill) {
  const used = new Set([
    ...bill.lines.filter((l) => l.jarTypeId && l.jarGiven).map((l) => l.jarTypeId),
    ...Object.keys(bill.returnedInBill || {}),
  ]);
  const active = (jarTypes || []).filter((j) => j.active !== false || used.has(j.id));
  return active.slice(0, 4).map((j, i) => ({ id: j.id, code: (j.shortCode || '').trim() || String.fromCharCode(65 + i) }));
}

/** A4-less "Letter" invoice that copies the owner's own invoice format. */
async function buildInvoicePdf({ bill, party, settings, jarName, jarTypes, logo }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const L = 54, R = 558, RIGHT = 552.3, LEFT_TXT = 59.8, PITCH = 14.75;
  const base = (yMin, size = 11) => yMin + size * 0.98; // pdf baseline from the top of the text box
  const setText = (font, style, size, color = [0, 0, 0]) => { doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color); };
  const lines = (txt) => String(txt || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // logo (original pixels, not recoloured)
  if (logo) doc.addImage(logo, 'JPEG', 59.2, 72, 116.4, 116.4 / LOGO_RATIO);

  // sender block
  setText('helvetica', 'normal', 10);
  const sender = [];
  if (settings.managerName) sender.push(`Manager: ${settings.managerName}`);
  sender.push(...lines(settings.address));
  if (settings.phone) sender.push(`Phone: ${settings.phone}`);
  let y = 128.1;
  for (const t of sender) { doc.text(t, LEFT_TXT, base(y)); y += PITCH; }

  // INVOICE heading + number + date (right aligned)
  setText('helvetica', 'bold', 22, TEAL);
  doc.text('INVOICE', RIGHT, base(72, 22) + 2, { align: 'right' });
  const rightPair = (label, value, yMin) => {
    setText('helvetica', 'bold', 10, [0, 0, 0]);
    doc.text(value, 552.4, base(yMin), { align: 'right' });
    const w = doc.getTextWidth(value);
    setText('helvetica', 'bold', 10, NAVY);
    doc.text(`${label} `, 552.4 - w, base(yMin), { align: 'right' });
  };
  rightPair('INVOICE:', String(bill.billNo), 135.2);
  const [yy, mm, dd] = bill.dateKey.split('-');
  rightPair('DATE:', `${dd}/${mm}/${yy}`, 153.1);

  // TO / FOR
  setText('helvetica', 'bold', 10, NAVY);
  doc.text('TO:', 61.9, base(230.7));
  doc.text('FOR:', 552.5, base(230.7), { align: 'right' });
  setText('helvetica', 'bold', 10);
  doc.text(party?.name || bill.partyName || '', LEFT_TXT, base(248.5));
  setText('helvetica', 'normal', 10);
  let ty = 248.5 + PITCH;
  for (const t of lines(party?.address)) { doc.text(doc.splitTextToSize(t, 300), LEFT_TXT, base(ty)); ty += PITCH * Math.max(1, doc.splitTextToSize(t, 300).length); }
  let fy = 248.5;
  for (const t of doc.splitTextToSize(bill.forText ?? settings.invoiceFor ?? '', 220)) { doc.text(t, RIGHT, base(fy), { align: 'right' }); fy += PITCH; }

  // table
  const cols = jarColumns(jarTypes, bill);
  const qtyW = cols.length <= 2 ? 38 : 31;
  let xs;
  if (cols.length === 2) xs = [L, 122.8, 316.4, 352.4, 389.7, 430.9, 472.7, R]; // exactly the owner's column grid
  else {
    xs = [L, 122.8];
    const nameEnd = R - 85.3 - qtyW * cols.length * 2;
    xs.push(nameEnd);
    for (let i = 0; i < cols.length * 2; i++) xs.push(nameEnd + qtyW * (i + 1));
    xs.push(R);
  }
  const top = Math.max(344.1, ty + 20, fy + 20);
  const H1 = 21.9, H2 = 18.6;
  const extraRows = [];
  if (bill.discount) extraRows.push(['DISCOUNT', `-${plainAmount(bill.discount)}`]);
  if (bill.extraCharge) extraRows.push(['EXTRA CHARGE', plainAmount(bill.extraCharge)]);
  const rowsBelow = [...extraRows, ['TOTAL', plainAmount(bill.total)]];
  const bottom = top + H1 + H2 + rowsBelow.length * H2;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.6);
  doc.rect(L, top, R - L, bottom - top);
  doc.line(L, top + H1, R, top + H1);
  doc.line(L, top + H1 + H2, R, top + H1 + H2);
  const lastSplit = top + H1 + H2;
  for (const x of xs.slice(1, -1)) doc.line(x, top, x, lastSplit);
  doc.line(xs[xs.length - 2], lastSplit, xs[xs.length - 2], bottom); // amount column continues through total rows
  for (let i = 1; i < rowsBelow.length; i++) doc.line(L, lastSplit + H2 * i, R, lastSplit + H2 * i);

  const headers = ['DATE', 'NAME', ...cols.map((c) => `${c.code}D`), ...cols.map((c) => `${c.code}R`), 'AMOUNT'];
  setText('times', 'bold', 10.5, NAVY);
  headers.forEach((h, i) => doc.text(h, (xs[i] + xs[i + 1]) / 2, top + 14.8, { align: 'center' }));

  const delivered = (id) => bill.lines.filter((l) => l.jarTypeId === id && l.jarGiven).reduce((a, l) => a + l.qty, 0);
  const cells = [ddmmyy(bill.dateKey), party?.name || bill.partyName || '',
    ...cols.map((c) => String(delivered(c.id))), ...cols.map((c) => String((bill.returnedInBill || {})[c.id] || 0)), plainAmount(bill.total)];
  setText('helvetica', 'normal', 10);
  cells.forEach((t, i) => {
    const w = xs[i + 1] - xs[i] - 6;
    const txt = doc.splitTextToSize(t, w)[0] || '';
    doc.text(txt, (xs[i] + xs[i + 1]) / 2, top + H1 + 13.2, { align: 'center' });
  });
  rowsBelow.forEach(([label, amt], i) => {
    const yy2 = lastSplit + H2 * i + 13.2;
    setText('helvetica', label === 'TOTAL' ? 'bold' : 'normal', 10);
    doc.text(label, (L + xs[xs.length - 2]) / 2, yy2, { align: 'center' });
    setText('helvetica', 'bold', 10);
    doc.text(amt, (xs[xs.length - 2] + R) / 2, yy2, { align: 'center' });
  });

  // optional dues / jar balance lines (can be switched off in Settings)
  let fyy = bottom + 16;
  if (settings.showDuesOnPdf !== false && (bill.prevOutstanding || bill.jarBalanceAfter || bill.depositCollectedInBill)) {
    setText('helvetica', 'normal', 10);
    const m = (p) => pdfMoney(p, settings.currency);
    const out = [];
    if (bill.depositCollectedInBill) out.push(`Deposit received (not part of total): ${m(bill.depositCollectedInBill)}`);
    if (bill.prevOutstanding) out.push(`Previous due: ${m(bill.prevOutstanding)}     Total due now: ${m(bill.newOutstanding ?? bill.prevOutstanding + bill.total)}`);
    const jt = jarsText(bill.jarBalanceAfter, jarName);
    if (jt !== 'None') out.push(`Jars with you: ${jt}`);
    for (const t of out) { doc.text(t, L, fyy); fyy += 13; }
  }
  if (bill.note) { setText('helvetica', 'normal', 10); doc.text(doc.splitTextToSize(`Note: ${bill.note}`, R - L), L, fyy); fyy += 13; }

  // footer
  setText('helvetica', 'bold', 10, NAVY);
  doc.text(settings.footerNote || '', L, Math.max(base(441.3), base(fyy + 24 - 13)));
  return doc;
}

export async function buildBillPdf({ bill, party, settings, jarName, jarTypes, layout = 'invoice', logo = null }) {
  if (layout === 'thermal') return buildThermalPdf({ bill, party, settings, jarName });
  return buildInvoicePdf({ bill, party, settings, jarName, jarTypes, logo: logo || (await loadLogo().catch(() => null)) });
}

export async function buildStatementPdf({ party, rows, settings, jarName }) {
  const m = (p) => pdfMoney(p, settings.currency);
  const doc = await newDoc('a5');
  const W = 148, pad = 10, H = 210;
  let y = 14;
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(settings.businessName, W / 2, y, { align: 'center' }); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Statement: ${party.name}`, pad, y); y += 5;
    doc.text(`Due: ${m(party.outstanding || 0)}   Deposit: ${m(party.depositBalance || 0)}`, pad, y); y += 5;
    doc.text(`Jars: ${jarsText(party.jarBalance, jarName)}`, pad, y, { maxWidth: W - 2 * pad }); y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Date', pad, y); doc.text('Details', pad + 20, y); doc.text('Amount', 112, y, { align: 'right' }); doc.text('Balance', W - pad, y, { align: 'right' });
    y += 2; doc.line(pad, y, W - pad, y); y += 4; doc.setFont('helvetica', 'normal');
  };
  head();
  for (const r of rows) {
    if (y > H - 15) { doc.addPage(); y = 14; head(); }
    const text = `${r.d.title}${r.d.detail ? ` - ${r.d.detail}` : ''}`;
    const lines = doc.splitTextToSize(text, 62);
    doc.setFontSize(8.5);
    doc.text(r.d.dateText, pad, y);
    doc.text(lines, pad + 20, y);
    if (r.d.outstanding) doc.text(`${r.d.outstanding > 0 ? '+' : '-'}${m(Math.abs(r.d.outstanding)).replace(/^-/, '')}`, 112, y, { align: 'right' });
    doc.text(m(r.balance), W - pad, y, { align: 'right' });
    y += lines.length * 4 + 1.5;
  }
  if (settings.footerNote) { y += 4; doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.text(settings.footerNote, W / 2, Math.min(y, H - 8), { align: 'center' }); }
  return doc;
}
