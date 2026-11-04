// PDF builders (jsPDF is loaded lazily so the first screen stays light).
import { fmtDate } from './dates.js';
import { pdfMoney, jarsText } from './share.js';

async function newDoc(layout, heightMm) {
  const { jsPDF } = await import('jspdf');
  if (layout === 'thermal') return new jsPDF({ unit: 'mm', format: [80, Math.max(120, heightMm)] });
  return new jsPDF({ unit: 'mm', format: 'a5' });
}

export async function buildBillPdf({ bill, party, settings, jarName, layout = 'a5' }) {
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
