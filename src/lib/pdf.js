// PDF builders (jsPDF is loaded lazily so the first screen stays light).
import { fmtDate } from './dates.js';
import { pdfMoney, jarsText } from './share.js';

// ---------------------------------------------------------------------------------------------
// Text kit. jsPDF's standard fonts only know Latin-1 and jsPDF does no complex-script shaping, so
// Devanagari (Hindi) and other scripts would print as garbage. Any string with a character outside
// Latin-1 is therefore drawn to a canvas by the BROWSER (which shapes it correctly) and placed as an
// image. Latin text stays real, selectable PDF text.
// Limitation: the canvas uses the phone's own fonts ('Noto Sans Devanagari' / 'Noto Sans' / system
// sans-serif). Phones sold in India ship a Devanagari font; if a device has none the browser shows
// its fallback glyphs. In Node (tests) there is no canvas and the old behaviour is used, never throwing.
// ---------------------------------------------------------------------------------------------
const NON_LATIN = /[^\u0000-ÿ‘-‟₹]/;
const SCALE = 4; // canvas pixels per pt
const FONT_STACK = '"Noto Sans Devanagari","Noto Sans","Noto Sans Bengali","Noto Sans Gujarati","Noto Sans Tamil",sans-serif';

function canvasAvailable() {
  try { return typeof document !== 'undefined' && typeof document.createElement === 'function'; } catch { return false; }
}

function textKit(doc) {
  const k = doc.internal.scaleFactor; // pt per document unit
  const canvasOK = canvasAvailable();
  let cur = { font: 'helvetica', style: 'normal', size: 10, color: [0, 0, 0] };
  let measureCtx = null;
  const cache = new Map();

  const fontStr = (style, sizePt) => `${/bold/.test(style) ? 'bold ' : ''}${/italic/.test(style) ? 'italic ' : ''}${sizePt}px ${FONT_STACK}`;
  const getMeasureCtx = () => {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    return measureCtx;
  };
  const isImg = (t) => canvasOK && NON_LATIN.test(String(t));

  const set = (font, style, size, color = [0, 0, 0]) => {
    cur = { font, style, size, color };
    doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color);
  };

  /** width of text in document units at the current font */
  const measure = (t) => {
    t = String(t ?? '');
    if (isImg(t)) {
      try {
        const ctx = getMeasureCtx();
        ctx.font = fontStr(cur.style, cur.size * SCALE);
        return ctx.measureText(t).width / SCALE / k;
      } catch { /* fall through to jsPDF */ }
    }
    return doc.getTextWidth(t);
  };

  /** word wrap into lines no wider than maxW (document units) */
  const wrap = (t, maxW) => {
    t = String(t ?? '');
    if (!isImg(t)) return doc.splitTextToSize(t, maxW);
    const out = [];
    let line = '';
    const push = (w) => {
      const next = line ? `${line} ${w}` : w;
      if (measure(next) <= maxW || !line) line = next; else { out.push(line); line = w; }
    };
    for (const word of t.split(/\s+/).filter(Boolean)) {
      if (measure(word) > maxW) { // very long word: split by characters
        let part = '';
        for (const ch of word) { if (measure(part + ch) > maxW && part) { push(part); part = ch; } else part += ch; }
        push(part);
      } else push(word);
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  };

  /** draw one line of text (baseline at y). align: left | center | right */
  const text = (t, x, y, opts = {}) => {
    t = String(t ?? '');
    const align = opts.align || 'left';
    if (isImg(t)) {
      try {
        const wPt = measure(t) * k;
        const size = cur.size;
        const key = `${cur.style}|${size}|${cur.color.join(',')}|${t}`;
        let hit = cache.get(key);
        if (!hit) {
          const cv = document.createElement('canvas');
          cv.width = Math.ceil((wPt + 4) * SCALE);
          cv.height = Math.ceil(size * 1.6 * SCALE);
          const ctx = cv.getContext('2d');
          ctx.font = fontStr(cur.style, size * SCALE);
          ctx.fillStyle = `rgb(${cur.color.join(',')})`;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(t, 2 * SCALE, size * 1.15 * SCALE);
          hit = cv.toDataURL('image/png');
          cache.set(key, hit);
        }
        const wU = wPt / k;
        const xLeft = align === 'center' ? x - wU / 2 : align === 'right' ? x - wU : x;
        doc.addImage(hit, 'PNG', xLeft - 2 / k, y - (size * 1.15) / k, (wPt + 4) / k, (size * 1.6) / k);
        return;
      } catch { /* fall back to plain text below */ }
    }
    doc.text(t, x, y, { align });
  };

  /** largest font size (<= size, >= min) at which text fits maxW */
  const fit = (t, maxW, size, min = 6) => {
    let s = size;
    for (; s > min; s -= 0.5) { set(cur.font, cur.style, s, cur.color); if (measure(t) <= maxW) return s; }
    return Math.max(min, s);
  };

  return { set, measure, wrap, text, fit, get cur() { return cur; }, k };
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

// ---------- jar columns ----------
function usedJarIds(bill) {
  return new Set([
    ...bill.lines.filter((l) => l.jarTypeId && l.jarGiven).map((l) => l.jarTypeId),
    ...Object.keys(bill.returnedInBill || {}),
  ]);
}
function jarCandidates(jarTypes, bill) {
  const used = usedJarIds(bill);
  const list = (jarTypes || []).filter((j) => j.active !== false || used.has(j.id));
  const known = new Set(list.map((j) => j.id));
  const unknownUsed = [...used].filter((id) => !known.has(id)).map((id) => ({ id, name: id }));
  return { all: [...list, ...unknownUsed], used };
}

/**
 * Jar-type columns of the invoice table: <code>D for each jar type, then <code>R for each (e.g. ND CD NR CR).
 * At most 4 types fit; jar types USED on this bill get the columns first, the rest are listed by jarExtras().
 */
export function jarColumns(jarTypes, bill) {
  const { all, used } = jarCandidates(jarTypes, bill);
  const order = [...all.filter((j) => used.has(j.id)), ...all.filter((j) => !used.has(j.id))].slice(0, 4);
  const chosen = new Set(order.map((j) => j.id));
  return all.filter((j) => chosen.has(j.id)).map((j, i) => ({ id: j.id, code: (j.shortCode || '').trim() || String.fromCharCode(65 + i) }));
}

/** Jar types used on the bill that did not get a column (more than 4 types): delivered/returned counts. */
export function jarExtras(jarTypes, bill) {
  const cols = new Set(jarColumns(jarTypes, bill).map((c) => c.id));
  const { all, used } = jarCandidates(jarTypes, bill);
  return all.filter((j) => used.has(j.id) && !cols.has(j.id)).map((j) => ({
    id: j.id,
    delivered: bill.lines.filter((l) => l.jarTypeId === j.id && l.jarGiven).reduce((a, l) => a + l.qty, 0),
    returned: (bill.returnedInBill || {})[j.id] || 0,
  }));
}

// ---------- shared dues wording ----------
function duesLine(bill, m) {
  const prev = bill.prevOutstanding || 0;
  const now = bill.newOutstanding ?? prev + bill.total;
  const a = prev < 0 ? `Advance: ${m(-prev)}` : `Previous due: ${m(prev)}`;
  const b = now < 0 ? `Advance left: ${m(-now)}` : `Total due now: ${m(now)}`;
  return `${a}     ${b}`;
}

// ---------------------------------------------------------------------------------------------
// Narrow (thermal) receipt. Built twice: first on a very tall page to measure the real content height,
// then on a page of exactly that height, so nothing is ever cut off.
// ---------------------------------------------------------------------------------------------
async function buildThermalPdf({ bill, party, settings, jarName }) {
  const { jsPDF } = await import('jspdf');
  const m = (p) => pdfMoney(p, settings.currency);
  const W = 80, pad = 4, inner = W - 2 * pad;

  const draw = (doc) => {
    const kit = textKit(doc);
    let y = pad + 2;
    const lh = (size) => size * 0.42; // line pitch in mm
    const center = (t, size, bold) => {
      kit.set('helvetica', bold ? 'bold' : 'normal', size);
      for (const ln of kit.wrap(t, inner)) { kit.text(ln, W / 2, y, { align: 'center' }); y += lh(size) + 1.2; }
    };
    const row = (l, r, bold, size = 8) => {
      kit.set('helvetica', bold ? 'bold' : 'normal', size);
      const rw = kit.measure(r) + 2;
      const ls = kit.wrap(l, Math.max(10, inner - rw));
      ls.forEach((ln, i) => { kit.text(ln, pad, y); if (i === 0) kit.text(r, W - pad, y, { align: 'right' }); y += lh(size) + 1.2; });
    };
    const rule = () => { doc.setLineWidth(0.2); doc.line(pad, y, W - pad, y); y += 3; };
    const block = (t, size, style = 'normal', align = 'left') => {
      kit.set('helvetica', style, size);
      for (const ln of kit.wrap(t, inner)) { kit.text(ln, align === 'center' ? W / 2 : pad, y, { align }); y += lh(size) + 1.4; }
    };

    center(settings.businessName, 12, true);
    for (const a of String(settings.address || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) block(a, 7, 'normal', 'center');
    if (settings.phone) center(`Ph: ${settings.phone}`, 7);
    y += 1; rule();
    row(`Bill No: ${bill.billNo}`, `Date: ${fmtDate(bill.dateKey)}`, true);
    block(`Party: ${party?.name || bill.partyName || ''}`, 8, 'bold');
    if (party?.phone) block(party.phone, 8);
    rule();

    // lines table
    const fs = 8;
    const cQty = 40, cRate = 55, cAmt = W - pad;
    kit.set('helvetica', 'bold', fs);
    kit.text('Item', pad, y); kit.text('Qty', cQty, y, { align: 'right' }); kit.text('Rate', cRate, y, { align: 'right' }); kit.text('Amount', cAmt, y, { align: 'right' });
    y += 4;
    kit.set('helvetica', 'normal', fs);
    for (const l of bill.lines) {
      const nm = kit.wrap(l.itemName, 22);
      kit.set('helvetica', 'normal', fs);
      nm.forEach((ln, i) => {
        kit.text(ln, pad, y + i * lh(fs));
        if (i === 0) {
          kit.text(String(l.qty), cQty, y, { align: 'right' });
          kit.text(m(l.rate).replace(/^(Rs\.|\S+) /, ''), cRate, y, { align: 'right' });
          kit.text(m(l.amount).replace(/^(Rs\.|\S+) /, ''), cAmt, y, { align: 'right' });
        }
      });
      y += Math.max(1, nm.length) * lh(fs) + 1.6;
    }
    rule();
    if (bill.discount || bill.extraCharge) row('Sub total', m(bill.subTotal ?? bill.lines.reduce((s, l) => s + l.amount, 0)));
    if (bill.discount) row('Discount', `- ${m(bill.discount)}`);
    if (bill.extraCharge) row('Extra charge', m(bill.extraCharge));
    row('TOTAL', m(bill.total), true, 10);
    y += 1;
    if (bill.depositCollectedInBill) row('Deposit received (not in total)', m(bill.depositCollectedInBill));
    const prev = bill.prevOutstanding || 0;
    const now = bill.newOutstanding ?? prev + bill.total;
    row(prev < 0 ? 'Advance' : 'Previous due', m(Math.abs(prev)));
    row('This bill', m(bill.total));
    row(now < 0 ? 'ADVANCE LEFT' : 'TOTAL DUE', m(Math.abs(now)), true);
    if (bill.jarBalanceAfter) { y += 1; block(`Jars with you: ${jarsText(bill.jarBalanceAfter, jarName)}`, 7.5); }
    if (bill.note) block(`Note: ${bill.note}`, 7.5);
    if (settings.footerNote) { y += 3; rule(); block(settings.footerNote, 7.5, 'italic', 'center'); }
    return y;
  };

  const probe = new jsPDF({ unit: 'mm', format: [W, 5000] });
  const endY = draw(probe);
  const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(100, Math.ceil(endY + pad + 2)) ] });
  draw(doc);
  return doc;
}

// ---------------------------------------------------------------------------------------------
// Invoice (US Letter) that copies the owner's own invoice format. Coordinates (pt, from the top-left)
// were measured from the owner's PDF; with short content they are unchanged, with long content the
// blocks below are pushed down instead of overlapping.
// ---------------------------------------------------------------------------------------------
async function buildInvoicePdf({ bill, party, settings, jarName, jarTypes, logo }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const kit = textKit(doc);
  const L = 54, R = 558, RIGHT = 552.3, LEFT_TXT = 59.8, PITCH = 14.75, PAGE_H = 792;
  const base = (yMin, size = 11) => yMin + size * 0.98; // pdf baseline from the top of the text box
  const setText = kit.set;
  const lines = (txt) => String(txt || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const m = (p) => pdfMoney(p, settings.currency);
  const partyName = party?.name || bill.partyName || '';

  // logo (original pixels, not recoloured)
  if (logo) doc.addImage(logo, 'JPEG', 59.2, 72, 116.4, 116.4 / LOGO_RATIO);

  // sender block (wrapped to leave room for the invoice number on the right)
  setText('helvetica', 'normal', 10);
  const senderRaw = [];
  if (settings.managerName) senderRaw.push(`Manager: ${settings.managerName}`);
  senderRaw.push(...lines(settings.address));
  if (settings.phone) senderRaw.push(`Phone: ${settings.phone}`);
  const sender = senderRaw.flatMap((t) => kit.wrap(t, 380));
  let y = 128.1;
  for (const t of sender) { kit.text(t, LEFT_TXT, base(y)); y += PITCH; }
  // TO / FOR move down only when the sender block is taller than the original 5 lines
  const dy = Math.max(0, y + 28.85 - 230.7);

  // INVOICE heading + number + date (right aligned)
  setText('helvetica', 'bold', 22, TEAL);
  kit.text('INVOICE', RIGHT, base(72, 22) + 2, { align: 'right' });
  const rightPair = (label, value, yMin) => {
    setText('helvetica', 'bold', 10, [0, 0, 0]);
    kit.text(value, 552.4, base(yMin), { align: 'right' });
    const w = kit.measure(value);
    setText('helvetica', 'bold', 10, NAVY);
    kit.text(`${label} `, 552.4 - w, base(yMin), { align: 'right' });
  };
  rightPair('INVOICE:', String(bill.billNo), 135.2);
  const [yy, mm, dd] = bill.dateKey.split('-');
  rightPair('DATE:', `${dd}/${mm}/${yy}`, 153.1);

  // TO / FOR (TO block max 255pt wide, FOR block max 220pt, so they never overlap)
  setText('helvetica', 'bold', 10, NAVY);
  kit.text('TO:', 61.9, base(230.7 + dy));
  kit.text('FOR:', 552.5, base(230.7 + dy), { align: 'right' });
  let ty = 248.5 + dy;
  setText('helvetica', 'bold', 10);
  for (const t of kit.wrap(partyName, 255)) { kit.text(t, LEFT_TXT, base(ty)); ty += PITCH; }
  setText('helvetica', 'normal', 10);
  for (const t of lines(party?.address)) for (const w of kit.wrap(t, 255)) { kit.text(w, LEFT_TXT, base(ty)); ty += PITCH; }
  let fy = 248.5 + dy;
  for (const t of kit.wrap(bill.forText ?? settings.invoiceFor ?? '', 220)) { kit.text(t, RIGHT, base(fy), { align: 'right' }); fy += PITCH; }

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

  // NAME cell: shrink the font (down to 7pt) and then wrap onto more lines (row grows) so the whole name is visible
  const nameW = xs[2] - xs[1] - 8;
  setText('helvetica', 'normal', 10);
  const nameSize = kit.fit(partyName, nameW, 10, 7);
  setText('helvetica', 'normal', nameSize);
  const nameLines = kit.wrap(partyName, nameW);
  const namePitch = nameSize * 1.15;
  const HR = nameLines.length > 1 ? Math.max(H2, nameLines.length * namePitch + 8) : H2; // height of the data row

  const extraRows = [];
  if (bill.discount) extraRows.push(['DISCOUNT', `-${plainAmount(bill.discount)}`]);
  if (bill.extraCharge) extraRows.push(['EXTRA CHARGE', plainAmount(bill.extraCharge)]);
  const rowsBelow = [...extraRows, ['TOTAL', plainAmount(bill.total)]];
  const bottom = top + H1 + HR + rowsBelow.length * H2;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.6);
  doc.rect(L, top, R - L, bottom - top);
  doc.line(L, top + H1, R, top + H1);
  const lastSplit = top + H1 + HR;
  doc.line(L, lastSplit, R, lastSplit);
  for (const x of xs.slice(1, -1)) doc.line(x, top, x, lastSplit);
  doc.line(xs[xs.length - 2], lastSplit, xs[xs.length - 2], bottom); // amount column continues through total rows
  for (let i = 1; i < rowsBelow.length; i++) doc.line(L, lastSplit + H2 * i, R, lastSplit + H2 * i);

  const headers = ['DATE', 'NAME', ...cols.map((c) => `${c.code}D`), ...cols.map((c) => `${c.code}R`), 'AMOUNT'];
  setText('times', 'bold', 10.5, NAVY);
  headers.forEach((h, i) => kit.text(h, (xs[i] + xs[i + 1]) / 2, top + 14.8, { align: 'center' }));

  const delivered = (id) => bill.lines.filter((l) => l.jarTypeId === id && l.jarGiven).reduce((a, l) => a + l.qty, 0);
  const cells = [ddmmyy(bill.dateKey), null,
    ...cols.map((c) => String(delivered(c.id))), ...cols.map((c) => String((bill.returnedInBill || {})[c.id] || 0)), plainAmount(bill.total)];
  const rowBase = top + H1 + 13.2 + (HR - H2) / 2;
  cells.forEach((t, i) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    if (i === 1) { // NAME
      setText('helvetica', 'normal', nameSize);
      const startY = nameLines.length === 1 ? rowBase : top + H1 + HR / 2 - ((nameLines.length - 1) * namePitch) / 2 + nameSize * 0.35;
      nameLines.forEach((ln, j) => kit.text(ln, cx, startY + j * namePitch, { align: 'center' }));
      return;
    }
    setText('helvetica', 'normal', 10);
    const sz = kit.fit(t, xs[i + 1] - xs[i] - 6, 10, 6); // long amounts shrink instead of being cut
    setText('helvetica', 'normal', sz);
    kit.text(t, cx, rowBase, { align: 'center' });
  });
  rowsBelow.forEach(([label, amt], i) => {
    const yy2 = lastSplit + H2 * i + 13.2;
    setText('helvetica', label === 'TOTAL' ? 'bold' : 'normal', 10);
    kit.text(label, (L + xs[xs.length - 2]) / 2, yy2, { align: 'center' });
    setText('helvetica', 'bold', 10);
    const sz = kit.fit(amt, R - xs[xs.length - 2] - 6, 10, 6);
    setText('helvetica', 'bold', sz);
    kit.text(amt, (xs[xs.length - 2] + R) / 2, yy2, { align: 'center' });
  });

  // lines under the table: other jar types, dues, note, footer
  let fyy = bottom + 16;
  const ensure = () => { if (fyy > PAGE_H - 60) { doc.addPage(); fyy = 60; } };
  const put = (t, size = 10, style = 'normal', color = [0, 0, 0], gap = 13) => {
    setText('helvetica', style, size, color);
    for (const ln of kit.wrap(t, R - L)) { ensure(); kit.text(ln, L, fyy); fyy += gap; }
  };
  const extras = jarExtras(jarTypes, bill);
  if (extras.length) put(`Other jars: ${extras.map((e) => `${jarName(e.id)} delivered ${e.delivered}, returned ${e.returned}`).join('; ')}`);
  if (settings.showDuesOnPdf !== false && (bill.prevOutstanding || bill.jarBalanceAfter || bill.depositCollectedInBill)) {
    if (bill.depositCollectedInBill) put(`Deposit received (not part of total): ${m(bill.depositCollectedInBill)}`);
    if (bill.prevOutstanding) put(duesLine(bill, m));
    const jt = jarsText(bill.jarBalanceAfter, jarName);
    if (jt !== 'None') put(`Jars with you: ${jt}`);
  }
  if (bill.note) put(`Note: ${bill.note}`);

  // footer
  if (settings.footerNote) {
    fyy = Math.max(base(441.3), base(fyy + 24 - 13));
    put(settings.footerNote, 10, 'bold', NAVY);
  }
  return doc;
}

export async function buildBillPdf({ bill, party, settings, jarName, jarTypes, layout = 'invoice', logo = null }) {
  if (layout === 'thermal') return buildThermalPdf({ bill, party, settings, jarName });
  return buildInvoicePdf({ bill, party, settings, jarName, jarTypes, logo: logo || (await loadLogo().catch(() => null)) });
}

export async function buildStatementPdf({ party, rows, settings, jarName, logo = null }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const kit = textKit(doc);
  const logoData = logo || (await loadLogo().catch(() => null));
  const m = (p) => pdfMoney(p, settings.currency);
  const W = 148, pad = 10, H = 210;
  const LOGO_W = 30;
  let y = 14;
  const head = () => {
    y = 14;
    if (logoData) doc.addImage(logoData, 'JPEG', pad, 8, LOGO_W, LOGO_W / LOGO_RATIO);
    kit.set('helvetica', 'bold', 15);
    const nameLines = kit.wrap(settings.businessName, W - 2 * pad - LOGO_W - 6);
    nameLines.forEach((ln, i) => kit.text(ln, W - pad, y + i * 6, { align: 'right' }));
    y = Math.max(8 + (logoData ? LOGO_W / LOGO_RATIO : 0) + 7, y + nameLines.length * 6 + 2);
    kit.set('helvetica', 'normal', 10);
    for (const ln of kit.wrap(`Statement: ${party.name}`, W - 2 * pad)) { kit.text(ln, pad, y); y += 5; }
    kit.text(`Due: ${m(party.outstanding || 0)}   Deposit: ${m(party.depositBalance || 0)}`, pad, y); y += 5;
    for (const ln of kit.wrap(`Jars: ${jarsText(party.jarBalance, jarName)}`, W - 2 * pad)) { kit.text(ln, pad, y); y += 5; }
    y += 2;
    kit.set('helvetica', 'bold', 9);
    kit.text('Date', pad, y); kit.text('Details', pad + 20, y); kit.text('Amount', 112, y, { align: 'right' }); kit.text('Balance', W - pad, y, { align: 'right' });
    y += 2; doc.line(pad, y, W - pad, y); y += 4; kit.set('helvetica', 'normal', 8.5);
  };
  head();
  for (const r of rows) {
    if (y > H - 15) { doc.addPage(); head(); }
    const text = `${r.d.title}${r.d.detail ? ` - ${r.d.detail}` : ''}`;
    kit.set('helvetica', 'normal', 8.5);
    const lines = kit.wrap(text, 62);
    kit.text(r.d.dateText, pad, y);
    lines.forEach((ln, i) => kit.text(ln, pad + 20, y + i * 3.6));
    if (r.d.outstanding) kit.text(`${r.d.outstanding > 0 ? '+' : '-'}${m(Math.abs(r.d.outstanding)).replace(/^-/, '')}`, 112, y, { align: 'right' });
    kit.text(m(r.balance), W - pad, y, { align: 'right' });
    y += lines.length * 4 + 1.5;
  }
  if (settings.footerNote) {
    y += 4; kit.set('helvetica', 'italic', 8);
    for (const ln of kit.wrap(settings.footerNote, W - 2 * pad)) { if (y > H - 8) { doc.addPage(); y = 14; } kit.text(ln, W / 2, y, { align: 'center' }); y += 4; }
  }
  return doc;
}
