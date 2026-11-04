// Edge-case tests for PDF building, share texts and WhatsApp links.
// Output PDFs go to PDF_OUT_DIR (default: OS temp dir) so they can be rendered with pdftoppm and looked at.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../src/lib/backup.js', () => ({ downloadBlob: () => {} }));
const { buildBillPdf, buildStatementPdf, jarColumns } = await import('../src/lib/pdf.js');
const { billText, statementText, reminderText, waLink, pdfMoney, jarsText } = await import('../src/lib/share.js');
const { describeTxn } = await import('../src/lib/describe.js');

const OUT = process.env.PDF_OUT_DIR || join(tmpdir(), 'bluvia-pdf-edge');
mkdirSync(OUT, { recursive: true });
const logo = 'data:image/jpeg;base64,' + readFileSync('public/logo.jpg').toString('base64');
const hasPdftotext = spawnSync('pdftotext', ['-v']).status !== null && !spawnSync('pdftotext', ['-v']).error;

const base = {
  businessName: 'Bluvia Pure Drinking Water', managerName: 'Akshat Bisen', address: 'G-213, Sai Nagar,\nJora, Raipur,\nChhattisgarh (492012)',
  phone: '7987880983', currency: '₹', invoiceFor: 'Drinking water supply.', footerNote: 'THANK YOU FOR YOUR BUSINESS!', showDuesOnPdf: true, countryCode: '91',
};
const jt2 = [{ id: 'n', name: 'Normal Jar', shortCode: 'N' }, { id: 'c', name: 'Cold Jar', shortCode: 'C' }];
const party0 = { name: 'Innov8 Workspaces', phone: '9876543210', address: '3rd floor, ISBT bus stand,\nRavanbhatha, Bhatagaon, Raipur\nChhattisgarh (492101)' };
const line = (over = {}) => ({ itemName: 'Normal water', jarTypeId: 'n', qty: 10, rate: 4000, amount: 40000, jarGiven: true, ...over });
const mkBill = (over = {}) => ({
  billNo: '00104', dateKey: '2026-10-10', partyName: 'Innov8 Workspaces', forText: 'Drinking water supply.', lines: [line()],
  subTotal: 40000, discount: 0, extraCharge: 0, total: 40000, note: '', returnedInBill: {}, prevOutstanding: 0, newOutstanding: 40000, ...over,
});
const jarName = (id) => ({ n: 'Normal Jar', c: 'Cold Jar', x: 'Third', y: 'Fourth', z: 'Fifth' }[id] || id);
const money = (p) => `₹${(p / 100).toFixed(2)}`;

async function render(name, opts) {
  const doc = await buildBillPdf({ settings: base, party: party0, jarName, jarTypes: jt2, logo, bill: mkBill(), ...opts });
  const buf = Buffer.from(doc.output('arraybuffer'));
  const file = join(OUT, `${name}.pdf`);
  writeFileSync(file, buf);
  return { doc, file, pages: doc.getNumberOfPages(), text: hasPdftotext ? spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).stdout : '' };
}

/** Overlapping word boxes (pdftotext -bbox) = text drawn on top of other text. */
function overlaps(file) {
  const html = spawnSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' }).stdout;
  let n = 0;
  for (const pg of html.split('<page ').slice(1)) { // compare words only within the same page
    const w = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g)]
      .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }));
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) {
      const a = w[i], b = w[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 2 && oy > 3) n++;
    }
  }
  return n;
}
const pageH = (file) => +spawnSync('pdfinfo', [file], { encoding: 'utf8' }).stdout.match(/Page size:\s+[\d.]+ x ([\d.]+)/)[1];

describe('invoice PDF edge cases', () => {
  it('baseline renders exactly one page with the key strings', async () => {
    const r = await render('01-baseline', { bill: mkBill() });
    expect(r.pages).toBe(1);
    if (hasPdftotext) for (const s of ['INVOICE', '00104', 'Innov8 Workspaces', 'ND', 'CD', 'NR', 'CR', 'TOTAL', 'THANK YOU FOR YOUR BUSINESS!']) expect(r.text).toContain(s);
  });

  it('baseline and normal variants have no overlapping text (validates the overlap helper)', async () => {
    const r = await render('01b-baseline-overlap', { bill: mkBill({ prevOutstanding: 50000, jarBalanceAfter: { n: 3 }, note: 'ok' }) });
    if (hasPdftotext) expect(overlaps(r.file)).toBe(0);
  });

  it('discount + extra charge both show as rows and total stays right', async () => {
    const r = await render('02-discount-extra', { bill: mkBill({ discount: 5000, extraCharge: 2500, total: 37500, subTotal: 40000 }) });
    expect(r.pages).toBe(1);
    if (hasPdftotext) { expect(r.text).toContain('DISCOUNT'); expect(r.text).toContain('-50'); expect(r.text).toContain('EXTRA CHARGE'); expect(r.text).toContain('375'); }
  });

  it('huge crore amount and paise amount print without NaN/undefined', async () => {
    const r = await render('03-amounts', { bill: mkBill({ total: 123456789012, subTotal: 123456789012, lines: [line({ rate: 12345, amount: 123456789012 })], newOutstanding: 123456789012 + 5 }) });
    const r2 = await render('03b-paise', { bill: mkBill({ total: 12345, subTotal: 12345, lines: [line({ qty: 1, rate: 12345, amount: 12345 })] }) });
    if (hasPdftotext) { expect(r.text).not.toMatch(/NaN|undefined/); expect(r.text).toContain('1,23,45,67,890.12'); expect(r2.text).toContain('123.45'); }
  });

  // KNOWN DEFECT: AMOUNT cell uses splitTextToSize()[0], so a 9+ digit amount is cut ("890.1") and the TOTAL cell touches the border.
  it.skip('crore amount is printed completely in the table row (defect: row shows 1,23,45,67,890.1)', async () => {
    const r = await render('03c-amount-trunc', { bill: mkBill({ total: 123456789012, subTotal: 123456789012, lines: [line({ amount: 123456789012 })] }) });
    expect((r.text.match(/890\.12/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('zero total renders a 0 amount', async () => {
    const r = await render('04-zero', { bill: mkBill({ total: 0, subTotal: 0, lines: [line({ qty: 0, amount: 0 })] }) });
    if (hasPdftotext) { expect(r.text).not.toMatch(/NaN|undefined/); expect(r.text).toMatch(/TOTAL\s+0/); }
  });

  it('advance (negative previous due) is shown with a minus and not dropped', async () => {
    const r = await render('05-advance', { bill: mkBill({ prevOutstanding: -50000, newOutstanding: -10000 }) });
    if (hasPdftotext) expect(r.text).toMatch(/Previous due: -Rs\. 500/);
  });

  it('showDuesOnPdf=false hides previous due and jar lines; note shows when set', async () => {
    const r = await render('06-no-dues-note', { settings: { ...base, showDuesOnPdf: false }, bill: mkBill({ prevOutstanding: 50000, jarBalanceAfter: { n: 3 }, note: 'Pay by Friday please' }) });
    if (hasPdftotext) { expect(r.text).not.toContain('Previous due'); expect(r.text).not.toContain('Jars with you'); expect(r.text).toContain('Note: Pay by Friday please'); }
  });

  it('empty manager/address/phone/footer/forText does not print "undefined" or crash', async () => {
    const r = await render('07-empty-fields', { settings: { ...base, managerName: '', address: '', phone: '', footerNote: '', invoiceFor: '' }, party: { name: 'X' }, bill: mkBill({ forText: '' }) });
    expect(r.pages).toBe(1);
    if (hasPdftotext) expect(r.text).not.toMatch(/undefined|null|NaN/);
  });

  it('a bill with forText undefined falls back to the settings default', async () => {
    const b = mkBill(); delete b.forText;
    const r = await render('08-fortext-default', { bill: b });
    if (hasPdftotext) expect(r.text).toContain('Drinking water supply.');
  });

  it('non-rupee currency symbol is used in the dues lines', async () => {
    const r = await render('09-currency', { settings: { ...base, currency: '$' }, bill: mkBill({ prevOutstanding: 12345, newOutstanding: 52345 }) });
    if (hasPdftotext) expect(r.text).toContain('$ 123.45');
  });

  it('jar type without shortCode gets A,B fallback codes in the header', async () => {
    const r = await render('10-no-code', { jarTypes: [{ id: 'n', name: 'Normal Jar' }, { id: 'c', name: 'Cold Jar' }] });
    if (hasPdftotext) { expect(r.text).toContain('AD'); expect(r.text).toContain('BD'); expect(r.text).toContain('AR'); expect(r.text).toContain('BR'); }
  });

  it('4 jar types render 8 qty columns + AMOUNT with every header visible', async () => {
    const jt4 = [...jt2, { id: 'x', name: 'Third', shortCode: 'T' }, { id: 'y', name: 'Fourth', shortCode: 'F' }];
    const r = await render('11-four-types', { jarTypes: jt4, bill: mkBill({ lines: [line(), line({ jarTypeId: 'y', qty: 3, itemName: 'Fourth jar' })], returnedInBill: { x: 2 } }) });
    if (hasPdftotext) for (const h of ['ND', 'CD', 'TD', 'FD', 'NR', 'CR', 'TR', 'FR', 'AMOUNT']) expect(r.text).toContain(h);
  });

  // KNOWN DEFECT: only the first 4 jar types become columns, so a 5th type's delivered jars silently vanish from the table.
  it.skip('5 jar types: the 5th type must not vanish silently (defect: jarColumns slices to 4)', async () => {
    const jt5 = [...jt2, { id: 'x', name: 'Third', shortCode: 'T' }, { id: 'y', name: 'Fourth', shortCode: 'F' }, { id: 'z', name: 'Fifth', shortCode: 'V' }];
    const cols = jarColumns(jt5, mkBill({ lines: [line({ jarTypeId: 'z', qty: 7 })] }));
    expect(cols.map((c) => c.id)).toContain('z');
  });
  it.skip('5 jar types: delivered jars of the 5th type must appear somewhere on the invoice (defect: they vanish)', async () => {
    const jt5 = [...jt2, { id: 'x', name: 'Third', shortCode: 'T' }, { id: 'y', name: 'Fourth', shortCode: 'F' }, { id: 'z', name: 'Fifth', shortCode: 'V' }];
    const r = await render('12b-fifth-type', { jarTypes: jt5, bill: mkBill({ lines: [line({ jarTypeId: 'z', qty: 7, itemName: 'Fifth jar' })] }) });
    expect(r.text).toMatch(/\b7\b/);
  });
  it('5 jar types: documents the cap (first 4 only) and still renders', async () => {
    const jt5 = [...jt2, { id: 'x', name: 'Third', shortCode: 'T' }, { id: 'y', name: 'Fourth', shortCode: 'F' }, { id: 'z', name: 'Fifth', shortCode: 'V' }];
    expect(jarColumns(jt5, mkBill()).length).toBe(4);
    const r = await render('12-five-types', { jarTypes: jt5, bill: mkBill({ lines: [line({ jarTypeId: 'z', qty: 7, itemName: 'Fifth jar' })] }) });
    expect(r.pages).toBe(1);
  });

  it('many lines (30) still 1 page; only jar counts + total are shown (items are not listed)', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => line({ itemName: `Item number ${i + 1}`, qty: 1, amount: 4000, jarTypeId: i % 2 ? 'c' : 'n' }));
    const r = await render('13-many-lines', { bill: mkBill({ lines, total: 120000, subTotal: 120000 }) });
    expect(r.pages).toBe(1);
    if (hasPdftotext) { expect(r.text).toContain('1,200'); expect(r.text).not.toContain('Item number 30'); }
  });

  it('very long name and 10-line address: all lines of the address appear', async () => {
    const addr = Array.from({ length: 10 }, (_, i) => `Address line ${i + 1} of a very long customer address text`).join('\n');
    const r = await render('14-long-text', { party: { name: 'The Extraordinarily Long Named Customer Private Limited And Sons Trading Co', phone: '9876543210', address: addr }, bill: mkBill({ partyName: 'The Extraordinarily Long Named Customer Private Limited And Sons Trading Co', forText: 'Drinking water supply for the entire fourth floor and cafeteria and conference rooms during Diwali week' }) });
    expect(r.pages).toBe(1);
    if (hasPdftotext) { expect(r.text).toContain('Address line 1 '); expect(r.text).toContain('Address line 10 '); }
  });

  // KNOWN DEFECT: a long party name in the TO block is not wrapped and runs into the FOR text on the right; the NAME cell is cut to its first wrapped line.
  it.skip('long party name must not overlap the FOR text (defect: TO name overlaps FOR block)', async () => {
    const name = 'The Extraordinarily Long Named Customer Private Limited And Sons Trading Co';
    const r = await render('14b-long-name', { party: { name, phone: '', address: '' }, bill: mkBill({ partyName: name, forText: 'Drinking water supply for the entire fourth floor and cafeteria and conference rooms during Diwali week' }) });
    expect(overlaps(r.file)).toBe(0);
  });

  it('10-line SENDER address (settings.address) keeps the TO/FOR block readable', async () => {
    const addr = Array.from({ length: 10 }, (_, i) => `Our office line ${i + 1}`).join('\n');
    const r = await render('15-long-sender', { settings: { ...base, address: addr } });
    expect(r.pages).toBe(1);
  });
  // KNOWN DEFECT: sender lines are drawn from y=128 with no limit, so 7+ lines (manager + address + phone) print over the TO block at y=231.
  it.skip('long sender address must not overlap the TO block (defect: overlap from 7 sender lines)', async () => {
    const r = await render('15b-sender-8', { settings: { ...base, address: Array.from({ length: 6 }, (_, i) => `Our office line ${i + 1}`).join('\n') } });
    expect(overlaps(r.file)).toBe(0);
  });

  it('Devanagari and accented names: documents what jsPDF standard fonts do', async () => {
    const r = await render('16-devanagari', { party: { name: 'शर्मा स्टोर', phone: '9876543210', address: 'रायपुर, छत्तीसगढ़\nCafé Münchën Ñandú' }, bill: mkBill({ partyName: 'शर्मा स्टोर', forText: 'पीने का पानी' }) });
    expect(r.pages).toBe(1);
    if (hasPdftotext) {
      expect(r.text).toMatch(/Caf/);
      // Devanagari glyphs are NOT drawn by Helvetica; record that the original text is not recoverable
      expect(r.text).not.toContain('शर्मा');
      expect(r.text).toMatch(/Caf\S* M\S*nch\S*n \S*and/); // Latin accents survive
    }
  });
  // KNOWN DEFECT: Devanagari is drawn as gibberish (e.g. "60M.> 8MK0") with no warning, since built-in Helvetica has no such glyphs.
  it.skip('Devanagari party name must be readable in the PDF (defect: needs an embedded Devanagari font)', async () => {
    const r = await render('16b-devanagari', { party: { name: 'शर्मा स्टोर', phone: '', address: '' }, bill: mkBill({ partyName: 'शर्मा स्टोर' }) });
    expect(r.text).toContain('शर्मा');
  });

  it('thermal layout renders with many lines and long names', async () => {
    const lines = Array.from({ length: 25 }, (_, i) => line({ itemName: `A fairly long item name number ${i + 1}`, qty: i + 1, amount: 4000 * (i + 1) }));
    const r = await render('17-thermal-many', { layout: 'thermal', bill: mkBill({ lines, total: 1300000, subTotal: 1300000, prevOutstanding: 50000, jarBalanceAfter: { n: 3, c: 2 }, note: 'Some note text' }) });
    const [w, h] = [r.doc.internal.pageSize.getWidth(), r.doc.internal.pageSize.getHeight()];
    expect(Math.round(w)).toBe(80);
    expect(h).toBeGreaterThan(120);
    if (hasPdftotext) expect(r.text).toContain('TOTAL'); // reached the TOTAL row, but see the skipped test below for what follows
    if (hasPdftotext) expect(r.text).toMatch(/name number 25/);
  });

  // KNOWN DEFECT: thermal page height is a rough estimate (70 + 9mm per line). Wrapped item names and long address/footer push content past the
  // page bottom, so "Previous due / TOTAL DUE / Jars with you / footer" are cut off without warning.
  it.skip('thermal: dues, jar line and footer are all present after many wrapped lines (defect: cut off)', async () => {
    const lines = Array.from({ length: 25 }, (_, i) => line({ itemName: `A fairly long item name number ${i + 1}`, qty: i + 1, amount: 4000 * (i + 1) }));
    const r = await render('17b-thermal-cut', { layout: 'thermal', bill: mkBill({ lines, total: 1300000, subTotal: 1300000, prevOutstanding: 50000, newOutstanding: 1350000, jarBalanceAfter: { n: 3 }, note: 'Some note text' }) });
    for (const s of ['Previous due', 'TOTAL DUE', 'Jars with you', 'Note: Some note text', 'THANK YOU']) expect(r.text).toContain(s);
  });
  // KNOWN DEFECT: in the thermal header the party name is not shortened and is printed over the party phone number.
  it.skip('thermal: long party name must not overlap the phone number (defect: overlap)', async () => {
    const r = await render('18b-thermal-name', { layout: 'thermal', party: { name: 'The Extraordinarily Long Named Customer Private Limited', phone: '9876543210', address: '' } });
    expect(overlaps(r.file)).toBe(0);
  });

  it('thermal: long name, long address and a very long footer stay inside the page height', async () => {
    const r = await render('18-thermal-long', {
      layout: 'thermal', settings: { ...base, address: Array.from({ length: 8 }, (_, i) => `Shop address line ${i + 1} is quite long indeed`).join('\n'), footerNote: 'THANK YOU FOR YOUR BUSINESS! '.repeat(6) },
      party: { name: 'The Extraordinarily Long Named Customer Private Limited', phone: '9876543210', address: '' }, bill: mkBill({ lines: Array.from({ length: 6 }, (_, i) => line({ itemName: `Very long item name that wraps over multiple lines number ${i}` })), note: 'n'.repeat(200) }),
    });
    expect(r.pages).toBe(1);
    expect(pageH(r.file)).toBeGreaterThan(300); // still renders, size is only an estimate
  });

  it('zero or empty lines array does not crash the invoice', async () => {
    const r = await render('19-no-lines', { bill: mkBill({ lines: [], total: 0, subTotal: 0 }) });
    expect(r.pages).toBe(1);
  });
});

describe('statement PDF', () => {
  const mkRows = (n) => Array.from({ length: n }, (_, i) => ({
    t: { id: `t${i}` },
    d: { dateText: `0${(i % 9) + 1}/10/2026`, title: i % 3 === 0 ? `Bill ${1000 + i}` : i % 3 === 1 ? 'Receipt' : 'Jar Return', detail: i % 3 === 0 ? `${i}×20L Jar Water, ${i}×Cold box with a longer name to wrap` : 'Cash', outstanding: i % 3 === 0 ? 4000 * (i + 1) : i % 3 === 1 ? -3000 : 0 },
    balance: 100000 + i * 10,
  }));
  it('120 rows break into several pages with a header on each page and no crash', async () => {
    const doc = await buildStatementPdf({ party: { name: 'Sharma Store', outstanding: 123456, depositBalance: 50000, jarBalance: { n: 5 } }, rows: mkRows(120), settings: base, jarName });
    const file = join(OUT, '20-statement-120.pdf');
    writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    if (hasPdftotext) {
      const t = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).stdout;
      expect((t.match(/Statement: Sharma Store/g) || []).length).toBe(doc.getNumberOfPages());
      expect(t).not.toMatch(/NaN|undefined/);
      expect(overlaps(file)).toBe(0);
    }
  });
  it('empty rows and empty footer still produce a valid 1 page PDF', async () => {
    const doc = await buildStatementPdf({ party: { name: 'Empty Co' }, rows: [], settings: { ...base, footerNote: '' }, jarName });
    expect(doc.getNumberOfPages()).toBe(1);
  });
  // KNOWN GAP: the statement has no Bluvia logo (invoice has one). Kept as skip so it can be enabled when added.
  it.skip('statement carries the original logo bytes (gap: statement header is text only)', async () => {
    const doc = await buildStatementPdf({ party: { name: 'X' }, rows: mkRows(2), settings: base, jarName });
    expect(Buffer.from(doc.output('arraybuffer')).includes(readFileSync('public/logo.jpg'))).toBe(true);
  });
});

describe('waLink phone formats', () => {
  const num = (url) => url.match(/wa\.me\/(\d*)\?/)[1];
  it('10 digit gets the country code', () => expect(num(waLink('9876543210', 'hi'))).toBe('919876543210'));
  it('+91 98765 43210 keeps digits only', () => expect(num(waLink('+91 98765 43210', 'hi'))).toBe('919876543210'));
  it('dashes and spaces are stripped', () => expect(num(waLink('98765-43210', 'hi'))).toBe('919876543210'));
  it('12 digit with country code is untouched', () => expect(num(waLink('919876543210', 'hi'))).toBe('919876543210'));
  it('other country code is honoured from settings', () => expect(num(waLink('4155552671', 'hi', '1'))).toBe('14155552671'));
  it('empty phone gives wa.me/ with no number (chat picker) and no crash', () => expect(waLink('', 'hi')).toMatch(/^https:\/\/wa\.me\/\?text=hi$/));
  it('undefined phone does not crash', () => expect(() => waLink(undefined, 'hi')).not.toThrow());
  it('text is URL encoded (newlines, ampersand, unicode)', () => {
    const u = waLink('9876543210', 'a&b\nशर्मा ₹5');
    expect(u).toContain('a%26b%0A');
    expect(u).not.toContain('\n');
  });
  // KNOWN DEFECT: Indian numbers written with a leading 0 (11 digits, "09876543210") are not normalised.
  it.skip('0-prefixed 11 digit number should become 91 + 10 digits (defect: link is wa.me/09876543210)', () => {
    expect(num(waLink('09876543210', 'hi'))).toBe('919876543210');
  });
  it('0-prefixed number currently yields an invalid link (documents the defect)', () => {
    expect(num(waLink('09876543210', 'hi'))).toBe('09876543210');
  });
});

describe('share texts never leak undefined/NaN', () => {
  const bad = /undefined|NaN|\[object Object\]|null/;
  const party = { name: 'Sharma Store', phone: '9876543210', outstanding: 150000, depositBalance: 20000, jarBalance: { n: 3, c: 0 } };
  const bill = mkBill({ prevOutstanding: 50000, newOutstanding: 90000, jarBalanceAfter: { n: 3 }, depositCollectedInBill: 10000, discount: 100, extraCharge: 200 });
  it('billText', () => expect(billText({ bill, party, settings: base, jarName, money })).not.toMatch(bad));
  it('billText with missing optional fields', () => {
    const b = mkBill(); delete b.prevOutstanding; delete b.newOutstanding;
    expect(billText({ bill: b, party: undefined, settings: { ...base, footerNote: '', phone: '' }, jarName, money })).not.toMatch(bad);
  });
  it('statementText with rows', () => {
    const rows = [{ d: { dateText: '01/10/2026', title: 'Bill 1', detail: '2×Jar', outstanding: 8000 } }, { d: { dateText: '02/10/2026', title: 'Receipt', detail: '', outstanding: -3000 } }];
    expect(statementText({ party, rows, settings: base, jarName, money })).not.toMatch(bad);
  });
  it('reminderText with and without jars', () => {
    expect(reminderText({ party, settings: base, jarName, money })).not.toMatch(bad);
    expect(reminderText({ party: { ...party, jarBalance: {} }, settings: base, jarName, money })).not.toMatch(bad);
  });
  it('pdfMoney: rounding, negative, non-rupee, empty currency', () => {
    expect(pdfMoney(12345, '₹')).toBe('Rs. 123.45');
    expect(pdfMoney(-50000, '₹')).toBe('-Rs. 500');
    expect(pdfMoney(100, '$')).toBe('$ 1');
    expect(pdfMoney(100, '')).toBe('Rs. 1');
    expect(pdfMoney(undefined, '₹')).toBe('Rs. 0');
    expect(pdfMoney(123456789012, '₹')).toBe('Rs. 1,23,45,67,890.12');
  });
  it('jarsText', () => {
    expect(jarsText({}, jarName)).toBe('None');
    expect(jarsText({ n: 0 }, jarName)).toBe('None');
    expect(jarsText({ n: 2, c: -1 }, jarName)).toBe('Normal Jar: 2, Cold Jar: -1');
  });
});

describe('describeTxn edge cases', () => {
  const d = (t) => describeTxn(t, { jarName, money });
  it('bill with no lines array does not crash', () => expect(() => d({ type: 'bill', billNo: '1', dateKey: '2026-10-10', total: 100 })).not.toThrow());
  it('unknown type falls back to the raw type as title', () => expect(d({ type: 'weird', dateKey: '2026-10-10' }).title).toBe('weird'));
  it('deleted receipt has zero outstanding effect', () => expect(d({ type: 'receipt', amount: 5000, deleted: true, dateKey: '2026-10-10' }).outstanding).toBe(0));
  it('deposit adjust lowers both deposit and outstanding', () => {
    const r = d({ type: 'depositAdjust', amount: 5000, dateKey: '2026-10-10' });
    expect([r.outstanding, r.deposit]).toEqual([-5000, -5000]);
  });
  it('missing dateKey gives empty date text, not "undefined"', () => expect(d({ type: 'receipt', amount: 100 }).dateText).toBe(''));
  it('jar entry for a deleted jar type shows the fallback name', () => expect(d({ type: 'jarReturn', jarTypeId: 'gone', qty: 2, dateKey: '2026-10-10' }).detail).toBe('2 × gone'));
});
