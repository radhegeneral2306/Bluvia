import { describe, it, expect } from 'vitest';
import { jarCode, jarsShort, sortParties, partyTotals } from '../src/lib/partyRow.js';

const jt = [{ id: 'a', name: 'Normal', shortCode: 'N' }, { id: 'b', name: 'Cold', shortCode: '' }, { id: 'c', name: '' }];

describe('partyRow', () => {
  it('jarCode falls back to name then letter', () => {
    expect(jarCode(jt[0], 0)).toBe('N');
    expect(jarCode(jt[1], 1)).toBe('CO');
    expect(jarCode(jt[2], 2)).toBe('C');
  });
  it('jarsShort uses full names, lists only non-zero jars', () => {
    expect(jarsShort({ a: 3, b: 0, c: 2 }, jt)).toBe('Normal 3, C 2');
    expect(jarsShort({}, jt)).toBe('');
    expect(jarsShort(undefined, jt)).toBe('');
    expect(jarsShort({ zz: 1 }, jt)).toBe('? 1');
  });
  const ps = [{ id: 1, name: 'B', outstanding: 100, area: 'X' }, { id: 2, name: 'A', outstanding: 500 }, { id: 3, name: 'C', outstanding: -50, area: 'A' }];
  it('sorts', () => {
    expect(sortParties(ps, 'name').map((p) => p.id)).toEqual([2, 1, 3]);
    expect(sortParties(ps, 'due').map((p) => p.id)).toEqual([2, 1, 3]);
    expect(sortParties(ps, 'area').map((p) => p.id)).toEqual([3, 1, 2]);
  });
  it('totals ignore advances', () => {
    expect(partyTotals(ps)).toEqual({ count: 3, due: 600 });
  });
});
