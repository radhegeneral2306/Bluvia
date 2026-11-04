import { describe, it, expect } from 'vitest';
import { isValidVpa, upiAmount, fillRemark, buildUpiLink, upiConfigured, qrAmountFor, qrDataUrl } from '../src/lib/upi.js';

describe('UPI helpers', () => {
  it('validates UPI ids', () => {
    for (const ok of ['shop@okaxis', 'bluvia.water@ybl', '9876543210@paytm', 'a-b_c.d@icici', ' shop@okaxis ']) expect(isValidVpa(ok)).toBe(true);
    for (const bad of ['', 'shop', '@okaxis', 'shop@', 'shop@1', 'sh op@ybl', 'shop@@ybl', null, undefined, 42]) expect(isValidVpa(bad)).toBe(false);
  });
  it('formats the amount from integer paise, empty when nothing is due', () => {
    expect(upiAmount(40000)).toBe('400.00'); expect(upiAmount(12550)).toBe('125.50'); expect(upiAmount(5)).toBe('0.05'); expect(upiAmount(100000000)).toBe('1000000.00');
    expect(upiAmount(0)).toBe(''); expect(upiAmount(-5)).toBe(''); expect(upiAmount(undefined)).toBe(''); expect(upiAmount('abc')).toBe('');
  });
  it('fills the remark template and trims it to 50 characters', () => {
    expect(fillRemark('Bill {billNo}', { billNo: '00104' })).toBe('Bill 00104');
    expect(fillRemark('Water {party} {billNo}', { billNo: '7', partyName: 'Ram Traders' })).toBe('Water Ram Traders 7');
    expect(fillRemark('', { billNo: '9' })).toBe('Bill 9'); expect(fillRemark(undefined, { billNo: '9' })).toBe('Bill 9');
    expect(fillRemark('x'.repeat(80), {})).toHaveLength(50); expect(fillRemark('A\nB\t C', {})).toBe('A B C');
  });
  it('builds a valid upi:// link with encoded parts, and no link for a bad id', () => {
    const l = buildUpiLink({ vpa: 'shop@okaxis', name: 'Bluvia Pure Drinking Water', amountPaise: 40050, note: 'Bill 00104' });
    expect(l).toBe('upi://pay?pa=shop%40okaxis&pn=Bluvia%20Pure%20Drinking%20Water&am=400.50&cu=INR&tn=Bill%2000104');
    const u = new URL(l); expect(u.searchParams.get('pa')).toBe('shop@okaxis'); expect(u.searchParams.get('am')).toBe('400.50'); expect(u.searchParams.get('tn')).toBe('Bill 00104');
    expect(buildUpiLink({ vpa: 'bad', amountPaise: 100 })).toBe('');
  });
  it('leaves the amount out when it is zero, and never leaks special characters', () => {
    const l = buildUpiLink({ vpa: 'shop@ybl', name: 'A & B <x>', amountPaise: 0, note: 'x&am=1' });
    expect(l).not.toContain('&am=1&'); expect(new URL(l).searchParams.get('am')).toBeNull(); expect(new URL(l).searchParams.get('pn')).toBe('A & B <x>'); expect(new URL(l).searchParams.get('tn')).toBe('x&am=1');
    expect(l.match(/\?/g)).toHaveLength(1);
  });
  it('chooses the QR amount: this bill by default, total due on request, bill as fallback', () => {
    expect(qrAmountFor({}, { billTotal: 20000, due: 90000 })).toBe(20000);
    expect(qrAmountFor({ upiQrAmount: 'bill' }, { billTotal: 20000, due: 90000 })).toBe(20000);
    expect(qrAmountFor({ upiQrAmount: 'due' }, { billTotal: 20000, due: 90000 })).toBe(90000);
    expect(qrAmountFor({ upiQrAmount: 'due' }, { billTotal: 20000, due: -500 })).toBe(20000);
    expect(qrAmountFor(null, { billTotal: -5 })).toBe(0);
    expect(upiConfigured({ upiId: 'shop@ybl' })).toBe(true); expect(upiConfigured({ upiId: '' })).toBe(false); expect(upiConfigured(null)).toBe(false);
  });
  it('makes a PNG data URL QR code', async () => {
    const url = await qrDataUrl('upi://pay?pa=shop%40ybl&am=10.00&cu=INR', { size: 200 });
    expect(url.startsWith('data:image/png;base64,')).toBe(true); expect(url.length).toBeGreaterThan(500);
  });
});
