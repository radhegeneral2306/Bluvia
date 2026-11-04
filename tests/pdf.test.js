import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';

vi.mock('../src/lib/backup.js', () => ({ downloadBlob: () => {} }));
const { buildBillPdf, jarColumns } = await import('../src/lib/pdf.js');

const settings = {
  businessName: 'Bluvia Pure Drinking Water', managerName: 'Akshat Bisen', address: 'G-213, Sai Nagar,\nJora, Raipur,\nChhattisgarh (492012)',
  phone: '7987880983', currency: '₹', invoiceFor: 'Drinking water supply.', footerNote: 'THANK YOU FOR YOUR BUSINESS!', showDuesOnPdf: true,
};
const jarTypes = [{ id: 'n', name: 'Normal Jar', shortCode: 'N' }, { id: 'c', name: 'Cold Jar', shortCode: 'C' }];
const party = { name: 'Innov8 Workspaces', phone: '', address: '3rd floor, ISBT bus stand,\nRavanbhatha, Bhatagaon, Raipur\nChhattisgarh (492101)' };
const bill = {
  billNo: '00104', dateKey: '2026-10-10', partyName: 'Innov8 Workspaces', forText: 'Drinking water supply.',
  lines: [{ itemName: 'Normal water', jarTypeId: 'n', qty: 10, rate: 4000, amount: 40000, jarGiven: true }],
  subTotal: 40000, discount: 0, extraCharge: 0, total: 40000, note: '', returnedInBill: {},
};
const logo = 'data:image/jpeg;base64,' + readFileSync('public/logo.jpg').toString('base64');

describe('invoice PDF in the owner format', () => {
  it('uses N/C codes in ND CD NR CR order and falls back to A,B,...', () => {
    expect(jarColumns(jarTypes, bill).map((c) => c.code)).toEqual(['N', 'C']);
    expect(jarColumns([{ id: 'x', name: '20L' }, { id: 'y', name: '10L' }], { ...bill, lines: [] }).map((c) => c.code)).toEqual(['A', 'B']);
  });
  it('builds a Letter page and embeds the original logo bytes', async () => {
    const doc = await buildBillPdf({ bill, party, settings, jarName: (id) => id, jarTypes, logo });
    const size = doc.internal.pageSize;
    expect(Math.round(size.getWidth())).toBe(612);
    expect(Math.round(size.getHeight())).toBe(792);
    const buf = Buffer.from(doc.output('arraybuffer'));
    const jpg = readFileSync('public/logo.jpg');
    expect(buf.includes(jpg)).toBe(true); // JPEG stream is embedded untouched
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
  });
});
