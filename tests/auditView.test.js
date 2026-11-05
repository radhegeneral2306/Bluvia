import { describe, it, expect } from 'vitest';
import {
  actionLabel, typeLabel, fieldLabel, fmtAt, fmtValue, changePairs, entryTitle, entryAmount,
  sortByAtDesc, peopleOf, filterRows, groupByDay, sortPending,
} from '../src/lib/auditView.js';

const money = (p) => `Rs ${p / 100}`;
const at = (y, mo, d, h, mi) => ({ toMillis: () => new Date(y, mo - 1, d, h, mi).getTime() });

describe('auditView', () => {
  it('labels', () => {
    expect(actionLabel('edit')).toBe('Edit');
    expect(actionLabel('delete')).toBe('Delete');
    expect(actionLabel('restore')).toBe('Restore');
    expect(actionLabel('x')).toBe('x');
    expect(typeLabel('jarReturn')).toBe('Jar wapas');
    expect(fieldLabel('billNo')).toBe('Bill no');
    expect(fieldLabel('zzz')).toBe('zzz');
  });
  it('formats time', () => {
    expect(fmtAt(at(2026, 3, 5, 9, 7))).toBe('05/03/2026 09:07');
    expect(fmtAt({ seconds: 0 })).toMatch(/^\d\d\/\d\d\/\d{4} \d\d:\d\d$/);
    expect(fmtAt(null)).toBe('');
  });
  it('formats values', () => {
    expect(fmtValue('total', 15000, { money })).toBe('Rs 150');
    expect(fmtValue('dateKey', '2026-03-05')).toBe('05/03/2026');
    expect(fmtValue('verified', true)).toBe('Haan');
    expect(fmtValue('deleted', false)).toBe('Nahi');
    expect(fmtValue('note', undefined)).toBe('-');
    expect(fmtValue('jarTypeId', 'j1', { jarName: () => '20L' })).toBe('20L');
    expect(fmtValue('qty', 0)).toBe('0');
  });
  it('builds change pairs', () => {
    const row = { before: { total: 10000, note: 'a', partyId: 'p1', partyName: 'A' }, after: { total: 12000, partyId: 'p2', partyName: 'B' } };
    const p = changePairs(row, { money });
    expect(p.map((x) => x.key)).toEqual(['total', 'note', 'partyName']);
    expect(p[0]).toMatchObject({ label: 'Total', from: 'Rs 100', to: 'Rs 120' });
    expect(p[1]).toMatchObject({ from: 'a', to: '-' });
    expect(changePairs({ before: { partyId: 'p1' }, after: { partyId: 'p2' } }).length).toBe(1);
    expect(changePairs({})).toEqual([]);
    expect(changePairs({ before: { qty: 1 }, after: { qty: 1 } })).toEqual([]);
  });
  it('title and amount', () => {
    expect(entryTitle({ ctx: { type: 'bill', billNo: '12', partyName: 'Sharma' } })).toBe('Bill 12 / Sharma');
    expect(entryTitle({ type: 'receipt', ctx: { partyName: 'Sharma' } })).toBe('Receipt / Sharma');
    expect(entryTitle({})).toBe('');
    expect(entryAmount({ ctx: { total: 500, amount: 1 } })).toBe(500);
    expect(entryAmount({ ctx: { amount: 700 } })).toBe(700);
    expect(entryAmount({ ctx: {} })).toBeNull();
  });
  it('sorts, filters, groups', () => {
    const rows = [
      { id: 'a', at: at(2026, 1, 1, 10, 0), by: { name: 'Ravi' }, action: 'edit' },
      { id: 'b', at: at(2026, 1, 2, 10, 0), by: { name: 'Sita' }, action: 'delete' },
      { id: 'c', at: at(2026, 1, 2, 9, 0), by: { name: 'Ravi' }, action: 'delete' },
      { id: 'd', at: null, by: null, action: 'restore' },
    ];
    expect(sortByAtDesc(rows).map((r) => r.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(peopleOf(rows)).toEqual([{ name: 'Ravi', count: 2 }, { name: 'Sita', count: 1 }, { name: 'Unknown', count: 1 }]);
    expect(filterRows(rows, { person: 'Ravi' }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterRows(rows, { action: 'delete' }).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterRows(rows, { person: 'Ravi', action: 'delete' }).map((r) => r.id)).toEqual(['c']);
    expect(filterRows(rows, { action: 'all' }).length).toBe(4);
    const g = groupByDay(sortByAtDesc(rows));
    expect(g.map((x) => [x.day, x.rows.length])).toEqual([['Abhi', 1], ['02/01/2026', 2], ['01/01/2026', 1]]);
  });
  it('sorts pending receipts', () => {
    const l = [{ id: 1, dateKey: '2026-01-01' }, { id: 2, dateKey: '2026-01-03' }, { id: 3, dateKey: '2026-01-03', createdAt: at(2026, 1, 3, 1, 0) }];
    expect(sortPending(l).map((x) => x.id)).toEqual([2, 3, 1]);
    expect(sortPending(l, 2).length).toBe(2);
  });
});
