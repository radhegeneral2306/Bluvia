import { describe, it, expect } from 'vitest';
import { areaList, addArea, removeArea, filterByArea, partyMatches, strayAreas, areaCounts, NO_AREA, ALL_AREAS, areaOf, normalizeAreaName } from '../src/lib/areas.js';
import { findLastBill, repeatBillLines, repeatLabel } from '../src/lib/repeatBill.js';

const parties = [
  { id: '1', name: 'Ram Traders', phone: '99', area: 'Sai Nagar' },
  { id: '2', name: 'Shyam', phone: '98', area: ' sai  nagar ' },
  { id: '3', name: 'Mohan', area: 'Market' },
  { id: '4', name: 'Sita' },
];

describe('areas', () => {
  it('cleans, de-duplicates and sorts the admin list; bad input gives []', () => {
    expect(areaList({ areas: ['Market', ' sai  nagar', 'Sai Nagar', '', null, 'Market'] })).toEqual(['Market', 'sai nagar']);
    expect(areaList({})).toEqual([]); expect(areaList(null)).toEqual([]); expect(areaList({ areas: 'x' })).toEqual([]);
    expect(normalizeAreaName('x'.repeat(100))).toHaveLength(60);
  });
  it('adds an area (case-insensitive duplicate check) and rejects blank names', () => {
    expect(addArea(['Market'], ' Sai Nagar ').list).toEqual(['Market', 'Sai Nagar']);
    expect(addArea(['Market'], 'market').error).toMatch(/pehle se/);
    expect(addArea(['Market'], '   ').error).toMatch(/naam/);
  });
  it('removes an area only when no party uses it', () => {
    expect(removeArea(['Market', 'Sai Nagar'], 'Market', parties).error).toMatch(/1 party/);
    expect(removeArea(['Market', 'Sai Nagar'], 'Market', parties.filter((p) => p.id !== '3')).list).toEqual(['Sai Nagar']);
    expect(removeArea(['Sai Nagar'], 'Sai Nagar', parties).error).toMatch(/2 party/); // spaces and case differences count as the same area
  });
  it('filters parties: all, none, and by area (case and spacing tolerant)', () => {
    expect(filterByArea(parties, ALL_AREAS)).toHaveLength(4);
    expect(filterByArea(parties, NO_AREA).map((p) => p.id)).toEqual(['4']);
    expect(filterByArea(parties, 'Sai Nagar').map((p) => p.id)).toEqual(['1', '2']);
    expect(areaOf({ area: undefined })).toBe('');
  });
  it('search matches name, phone and area', () => {
    expect(partyMatches(parties[0], 'ram')).toBe(true); expect(partyMatches(parties[0], '99')).toBe(true);
    expect(partyMatches(parties[0], 'sai')).toBe(true); expect(partyMatches(parties[2], 'sai')).toBe(false); expect(partyMatches(parties[2], '')).toBe(true);
  });
  it('shows areas that are on parties but missing from the list, and counts per area', () => {
    expect(strayAreas(['Market'], parties)).toEqual(['Sai Nagar']);
    const c = areaCounts(parties);
    expect(c.none).toBe(1); expect(c.byArea.get('Market')).toBe(1); expect(c.byArea.get('Sai Nagar')).toBe(2); // 'Sai Nagar' and ' sai  nagar ' are one area
  });
});

describe('repeat bill', () => {
  const items = { i20: { id: 'i20', name: '20L Water', defaultRate: 4000, jarTypeId: 'j20' }, i10: { id: 'i10', name: '10L Water', defaultRate: 2500, jarTypeId: 'j10', active: false }, box: { id: 'box', name: 'Box', defaultRate: 10000 } };
  const jarMap = { j20: { defaultRate: 4000 }, j10: { defaultRate: 2500 } };
  const bill = {
    id: 'b1', type: 'bill', billNo: '00104', dateKey: '2026-11-03', discount: 500, extraCharge: 100, note: 'x', forText: 'Y', depositCollectedInBill: 1000, returnedInBill: { j20: 2 },
    lines: [
      { itemId: 'i20', itemName: '20L Water', qty: 5, rate: 3500, jarGiven: true },
      { itemId: 'i10', itemName: '10L Water', qty: 2, rate: 2500, jarGiven: true },
      { itemId: 'gone', itemName: 'Old item', qty: 1, rate: 100, jarGiven: false },
      { itemId: 'box', itemName: 'Box', qty: 3, rate: 10000, jarGiven: false },
    ],
  };
  it('finds the newest bill that is not deleted, ignoring other types', () => {
    expect(findLastBill([{ type: 'receipt' }, { type: 'bill', id: 'x', deleted: true }, { type: 'bill', id: 'ok' }, { type: 'bill', id: 'older' }]).id).toBe('ok');
    expect(findLastBill([{ type: 'receipt' }])).toBeNull(); expect(findLastBill(undefined)).toBeNull();
  });
  it('keeps old qty and OLD rate, skips missing or inactive items, reports changed rates', () => {
    const r = repeatBillLines({ bill, party: {}, itemMap: items, jarMap });
    expect(r.lines.map((l) => [l.itemId, l.qty, l.rate])).toEqual([['i20', 5, 3500], ['box', 3, 10000]]);
    expect(r.skipped).toEqual(['10L Water', 'Old item']);
    expect(r.changedRates).toBe(1);                       // 20L: old 35 vs today 40
    expect(r.lines[0].currentRate).toBe(4000);
  });
  it("today's rate honours the party's special rate", () => {
    const r = repeatBillLines({ bill, party: { jarRates: { j20: { rate: 3500 } } }, itemMap: items, jarMap });
    expect(r.changedRates).toBe(0); expect(r.lines[0].currentRate).toBe(3500);
  });
  it('jarGiven defaults to true when the field is missing, false stays false', () => {
    const r = repeatBillLines({ bill: { lines: [{ itemId: 'i20', qty: 1, rate: 1 }, { itemId: 'box', qty: 1, rate: 1, jarGiven: false }] }, party: {}, itemMap: items, jarMap });
    expect(r.lines.map((l) => l.jarGiven)).toEqual([true, false]);
  });
  it('label is short and safe for missing data', () => {
    expect(repeatLabel(bill)).toBe('Bill 00104, 03/11/2026'); expect(repeatLabel(null)).toBe(''); expect(repeatLabel({})).toBe('Bill');
  });
});
