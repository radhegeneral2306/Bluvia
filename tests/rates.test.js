import { describe, it, expect } from 'vitest';
import { rateFor, depositPerJar } from '../src/lib/rates.js';
import { describeTxn } from '../src/lib/describe.js';

const jarMap = { j20: { defaultRate: 4000, defaultDeposit: 20000 }, j10: { defaultRate: 2500, defaultDeposit: 10000 } };
const jarItem = { id: 'i20', jarTypeId: 'j20', defaultRate: 4200 };
const plainItem = { id: 'ix', jarTypeId: null, defaultRate: 1500 };

describe('rateFor', () => {
  it('jar item: party jarRates wins', () => {
    const party = { jarRates: { j20: { rate: 3500 } }, itemRates: { i20: 3800 } };
    expect(rateFor(party, jarItem, jarMap)).toBe(3500);
  });
  it('jar item: falls to party itemRates, then item default, then jarType default', () => {
    expect(rateFor({ itemRates: { i20: 3800 } }, jarItem, jarMap)).toBe(3800);
    expect(rateFor({}, jarItem, jarMap)).toBe(4200);
    expect(rateFor({}, { ...jarItem, defaultRate: 0 }, jarMap)).toBe(4000);
  });
  it('zero party rate is treated as unset', () => {
    expect(rateFor({ jarRates: { j20: { rate: 0 } } }, jarItem, jarMap)).toBe(4200);
  });
  it('non-jar item: party itemRates then item default', () => {
    expect(rateFor({ itemRates: { ix: 1200 } }, plainItem, jarMap)).toBe(1200);
    expect(rateFor({}, plainItem, jarMap)).toBe(1500);
    expect(rateFor({ jarRates: { j20: { rate: 1 } } }, plainItem, jarMap)).toBe(1500);
  });
  it('missing party / item / jarMap are safe', () => {
    expect(rateFor(null, plainItem, jarMap)).toBe(1500);
    expect(rateFor(undefined, jarItem, undefined)).toBe(4200);
    expect(rateFor({}, null, jarMap)).toBe(0);
    expect(rateFor({}, { id: 'z', jarTypeId: 'j20', defaultRate: 0 }, undefined)).toBe(0);
  });
});

describe('depositPerJar', () => {
  it('party deposit first, then jar type default', () => {
    expect(depositPerJar({ jarRates: { j20: { deposit: 15000 } } }, 'j20', jarMap)).toBe(15000);
    expect(depositPerJar({}, 'j20', jarMap)).toBe(20000);
    expect(depositPerJar({ jarRates: { j20: { deposit: 0 } } }, 'j20', jarMap)).toBe(20000);
  });
  it('no jar type / missing party / unknown jar', () => {
    expect(depositPerJar({}, null, jarMap)).toBe(0);
    expect(depositPerJar(null, 'j10', jarMap)).toBe(10000);
    expect(depositPerJar({}, 'nope', jarMap)).toBe(0);
  });
});

describe('describeTxn', () => {
  const ctx = { jarName: (id) => `Jar-${id}`, money: (p) => `R${p / 100}` };

  it('bill', () => {
    const d = describeTxn({
      type: 'bill', billNo: 'B-7', dateKey: '2026-01-10', note: 'hi', total: 20000,
      lines: [{ itemName: 'Water', qty: 5, jarTypeId: 'j20', jarGiven: true }, { itemName: 'Cap', qty: 2, jarTypeId: null }],
    }, ctx);
    expect(d.title).toBe('Bill B-7');
    expect(d.detail).toBe('5×Water, 2×Cap');
    expect(d.dateText).toBe('10/01/2026');
    expect(d.note).toBe('hi');
    expect(d.outstanding).toBe(20000);
    expect(d.jars).toEqual({ j20: 5 });
  });
  it('receipt', () => {
    const d = describeTxn({ type: 'receipt', amount: 5000, mode: 'UPI', reference: 'ref1', dateKey: '2026-01-11' }, ctx);
    expect(d.title).toBe('Receipt');
    expect(d.detail).toBe('UPI • ref1');
    expect(d.outstanding).toBe(-5000);
  });
  it('jarReturn', () => {
    const d = describeTxn({ type: 'jarReturn', jarTypeId: 'j20', qty: 3, dateKey: '2026-01-12' }, ctx);
    expect(d.title).toBe('Jar Return');
    expect(d.detail).toBe('3 × Jar-j20');
    expect(d.jars).toEqual({ j20: -3 });
    expect(d.outstanding).toBe(0);
  });
  it('deposit types', () => {
    const taken = describeTxn({ type: 'depositTaken', amount: 10000, jarTypeId: 'j20', dateKey: '2026-01-13' }, ctx);
    expect(taken.detail).toBe('R100 • Jar-j20');
    expect(taken.deposit).toBe(10000);
    const adj = describeTxn({ type: 'depositAdjust', amount: 2000, dateKey: '2026-01-13' }, ctx);
    expect(adj.detail).toBe('R20');
    expect(adj.deposit).toBe(-2000);
    expect(adj.outstanding).toBe(-2000);
    const ref = describeTxn({ type: 'depositRefund', amount: 500, dateKey: '2026-01-13' }, ctx);
    expect(ref.deposit).toBe(-500);
    expect(ref.outstanding).toBe(0);
  });
  it('deleted txn has zero effect', () => {
    const d = describeTxn({ type: 'receipt', amount: 5000, deleted: true, dateKey: '2026-01-11' }, ctx);
    expect(d.outstanding).toBe(0);
    expect(d.deposit).toBe(0);
    expect(d.jars).toEqual({});
  });
});
