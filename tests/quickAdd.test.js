import { describe, it, expect } from 'vitest';
import { buildPartyData, validateQuick, nextFormAfterSave, progress, partiesAddedToday, summaryLine, emptyQuickForm } from '../src/lib/quickAdd.js';
import { openingState } from '../src/lib/ledger.js';

const jt = [{ id: 'n', name: 'N', active: true }, { id: 'c', name: 'C', active: true }, { id: 'x', name: 'Old', active: false }];
const ts = (iso) => ({ toMillis: () => new Date(iso).getTime() });

describe('buildPartyData', () => {
  it('converts rupees to paise and drops blanks', () => {
    const f = { ...emptyQuickForm('Sai Nagar'), name: ' Ram Traders ', phone: '98765 43210', dues: '1,200.50', deposit: '2000', jars: { n: '3', c: '', x: '5' }, rates: { n: '25', c: '' }, deposits: { n: '' } };
    const d = buildPartyData(f, jt);
    expect(d).toMatchObject({ name: 'Ram Traders', area: 'Sai Nagar', phone: '98765 43210', active: true, openingBalance: 120050, openingDeposit: 200000, openingJars: { n: 3 }, jarRates: { n: { rate: 2500, deposit: 0 } }, itemRates: {} });
    expect(Number.isInteger(d.openingBalance)).toBe(true);
    expect(openingState(d).jarBalance).toEqual({ n: 3 });
  });
  it('blank rate stores nothing', () => {
    expect(buildPartyData({ ...emptyQuickForm(), name: 'A', rates: { n: '' } }, jt).jarRates).toEqual({});
  });
  it('throws on missing name or bad phone', () => {
    expect(() => buildPartyData(emptyQuickForm(), jt)).toThrow();
    expect(() => buildPartyData({ ...emptyQuickForm(), name: 'A', phone: 'abc' }, jt)).toThrow();
  });
});

describe('validateQuick', () => {
  it('requires name', () => expect(validateQuick(emptyQuickForm(), []).errors.length).toBe(1));
  it('warns, not blocks, on duplicate', () => {
    const r = validateQuick({ ...emptyQuickForm(), name: '  ram  TRADERS ' }, [{ name: 'Ram Traders' }]);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
  });
});

describe('form + progress', () => {
  it('keeps area only', () => {
    expect(nextFormAfterSave({ ...emptyQuickForm('Market'), name: 'X', dues: '5' })).toEqual(emptyQuickForm('Market'));
  });
  it('counts today', () => {
    const now = new Date('2026-11-05T10:00:00').getTime();
    const ps = [{ id: 1, createdAt: ts('2026-11-05T09:00:00') }, { id: 2, createdAt: ts('2026-11-04T09:00:00') }, { id: 3, createdAt: null }, { id: 4 }, { id: 5, createdAt: ts('2026-11-05T09:30:00') }];
    expect(progress(ps, '2026-11-05', now)).toEqual({ addedToday: 3, total: 5 });
    expect(partiesAddedToday(ps, '2026-11-05', now).map((p) => p.id)).toEqual([3, 5, 1]);
  });
  it('summary line', () => {
    const s = summaryLine({ ...emptyQuickForm(), name: 'Ram', dues: '1200', deposit: '2000', jars: { n: '3', c: '2' } }, jt);
    expect(s).toBe('Ram, Baaki Rs 1,200, Deposit Rs 2,000, Jars N 3 C 2');
  });
});
