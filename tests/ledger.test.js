import { describe, it, expect } from 'vitest';
import {
  effectOf, planChange, planChanges, negativeJarWarnings, openingState, openingDelta,
  recalculate, diffRecalc,
} from '../src/lib/ledger.js';
import { toPaise, fromPaise, fmtMoney, lineAmount, billTotals } from '../src/lib/money.js';

// ---- tiny in-memory "database" that applies plans exactly like Firestore increments ----
function newParty(over = {}) {
  return { id: 'p1', name: 'Ram', openingBalance: 0, openingJars: {}, openingDeposit: 0, ...openingStateFor(over), ...over };
}
function openingStateFor(p) {
  const o = openingState(p);
  return { outstanding: o.outstanding, jarBalance: o.jarBalance, depositBalance: o.depositBalance };
}
function applyPlan(world, plan) {
  for (const [pid, e] of Object.entries(plan.parties)) {
    const p = world.parties[pid];
    p.outstanding += e.outstanding;
    p.depositBalance += e.deposit;
    for (const [k, v] of Object.entries(e.jars)) p.jarBalance[k] = (p.jarBalance[k] || 0) + v;
  }
  const g = plan.global, s = world.summary;
  s.totalOutstanding += g.outstanding;
  s.totalDepositHeld += g.deposit;
  for (const [k, v] of Object.entries(g.jars)) s.totalJarsOut[k] = (s.totalJarsOut[k] || 0) + v;
  for (const [k, v] of Object.entries(g.daily)) {
    const d = (world.daily[k] ||= { sales: 0, collection: 0, billsCount: 0 });
    d.sales += v.sales; d.collection += v.collection; d.billsCount += v.billsCount;
  }
}
function world() {
  return { parties: { p1: newParty() }, summary: { totalOutstanding: 0, totalDepositHeld: 0, totalJarsOut: {} }, daily: {} };
}
const clean = (j) => Object.fromEntries(Object.entries(j).filter(([, v]) => v));

const bill = (over = {}) => ({
  id: 'b1', type: 'bill', partyId: 'p1', dateKey: '2026-01-10', deleted: false,
  lines: [{ itemId: 'i20', jarTypeId: 'j20', qty: 5, rate: 4000, amount: 20000, jarGiven: true }],
  discount: 0, extraCharge: 0, total: 20000, ...over,
});

describe('bill create / edit / delete', () => {
  it('create bill: outstanding += total, jars += qty, sales and bill count updated', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    expect(w.parties.p1.outstanding).toBe(20000);
    expect(w.parties.p1.jarBalance.j20).toBe(5);
    expect(w.summary.totalOutstanding).toBe(20000);
    expect(w.summary.totalJarsOut.j20).toBe(5);
    expect(w.daily['2026-01-10']).toEqual({ sales: 20000, collection: 0, billsCount: 1 });
  });

  it('jarGiven=false line does not change jar balance', () => {
    const b = bill({ lines: [{ jarTypeId: 'j20', qty: 5, rate: 4000, amount: 20000, jarGiven: false }] });
    expect(effectOf(b).jars).toEqual({});
  });

  it('non-jar item never changes jar balance', () => {
    const b = bill({ lines: [{ itemId: 'x', jarTypeId: null, qty: 2, rate: 1000, amount: 2000, jarGiven: true }], total: 2000 });
    expect(effectOf(b).jars).toEqual({});
  });

  it('edit bill qty: only the difference is applied', () => {
    const w = world();
    const old = bill();
    applyPlan(w, planChange(null, old));
    const edited = bill({ lines: [{ itemId: 'i20', jarTypeId: 'j20', qty: 8, rate: 4000, amount: 32000, jarGiven: true }], total: 32000 });
    const plan = planChange(old, edited);
    expect(plan.parties.p1.outstanding).toBe(12000);
    expect(plan.parties.p1.jars.j20).toBe(3);
    applyPlan(w, plan);
    expect(w.parties.p1.outstanding).toBe(32000);
    expect(w.parties.p1.jarBalance.j20).toBe(8);
    expect(w.daily['2026-01-10']).toEqual({ sales: 32000, collection: 0, billsCount: 1 });
  });

  it('edit bill rate only: jars unchanged, outstanding changes by difference', () => {
    const w = world();
    const old = bill();
    applyPlan(w, planChange(null, old));
    const edited = bill({ lines: [{ itemId: 'i20', jarTypeId: 'j20', qty: 5, rate: 4500, amount: 22500, jarGiven: true }], total: 22500 });
    const plan = planChange(old, edited);
    expect(plan.parties.p1.jars).toEqual({});
    expect(plan.parties.p1.outstanding).toBe(2500);
    applyPlan(w, plan);
    expect(w.parties.p1.outstanding).toBe(22500);
  });

  it('edit bill: change date moves daily sales from old day to new day', () => {
    const w = world();
    const old = bill();
    applyPlan(w, planChange(null, old));
    applyPlan(w, planChange(old, bill({ dateKey: '2026-01-12' })));
    expect(w.daily['2026-01-10']).toEqual({ sales: 0, collection: 0, billsCount: 0 });
    expect(w.daily['2026-01-12']).toEqual({ sales: 20000, collection: 0, billsCount: 1 });
  });

  it('edit bill: change party moves balances between the two parties', () => {
    const w = world();
    w.parties.p2 = newParty({ id: 'p2' });
    const old = bill();
    applyPlan(w, planChange(null, old));
    applyPlan(w, planChange(old, bill({ partyId: 'p2' })));
    expect(w.parties.p1.outstanding).toBe(0);
    expect(w.parties.p1.jarBalance.j20).toBe(0);
    expect(w.parties.p2.outstanding).toBe(20000);
    expect(w.summary.totalOutstanding).toBe(20000);
  });

  it('delete bill (soft) reverses everything; restore re-applies', () => {
    const w = world();
    const old = bill();
    applyPlan(w, planChange(null, old));
    const del = { ...old, deleted: true };
    applyPlan(w, planChange(old, del));
    expect(w.parties.p1.outstanding).toBe(0);
    expect(w.parties.p1.jarBalance.j20).toBe(0);
    expect(w.summary.totalOutstanding).toBe(0);
    expect(w.daily['2026-01-10'].billsCount).toBe(0);
    applyPlan(w, planChange(del, { ...old, deleted: false }));
    expect(w.parties.p1.outstanding).toBe(20000);
    expect(w.parties.p1.jarBalance.j20).toBe(5);
  });

  it('no-op edit gives an empty plan', () => {
    const plan = planChange(bill(), bill());
    expect(plan.parties).toEqual({});
    expect(plan.global.daily).toEqual({});
  });

  it('bill with discount and extra charge: total drives outstanding', () => {
    const b = bill({ discount: 1000, extraCharge: 500, total: 19500 });
    expect(effectOf(b).outstanding).toBe(19500);
  });
});

describe('receipt', () => {
  const receipt = (over = {}) => ({ id: 'r1', type: 'receipt', partyId: 'p1', dateKey: '2026-01-11', amount: 5000, mode: 'Cash', deleted: false, ...over });

  it('create receipt reduces outstanding and adds to collection', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    applyPlan(w, planChange(null, receipt()));
    expect(w.parties.p1.outstanding).toBe(15000);
    expect(w.summary.totalOutstanding).toBe(15000);
    expect(w.daily['2026-01-11'].collection).toBe(5000);
  });

  it('edit receipt amount applies only the difference', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    const r = receipt();
    applyPlan(w, planChange(null, r));
    applyPlan(w, planChange(r, receipt({ amount: 8000 })));
    expect(w.parties.p1.outstanding).toBe(12000);
    expect(w.daily['2026-01-11'].collection).toBe(8000);
  });

  it('delete receipt restores outstanding', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    const r = receipt();
    applyPlan(w, planChange(null, r));
    applyPlan(w, planChange(r, { ...r, deleted: true }));
    expect(w.parties.p1.outstanding).toBe(20000);
    expect(w.daily['2026-01-11'].collection).toBe(0);
  });

  it('advance receipt makes outstanding negative (party has credit)', () => {
    const w = world();
    applyPlan(w, planChange(null, receipt()));
    expect(w.parties.p1.outstanding).toBe(-5000);
  });
});

describe('jar return / given', () => {
  it('jar return reduces and jar given increases', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    const ret = { id: 'j1', type: 'jarReturn', partyId: 'p1', dateKey: '2026-01-12', jarTypeId: 'j20', qty: 3 };
    applyPlan(w, planChange(null, ret));
    expect(w.parties.p1.jarBalance.j20).toBe(2);
    expect(w.summary.totalJarsOut.j20).toBe(2);
    applyPlan(w, planChange(null, { ...ret, id: 'j2', type: 'jarGiven', qty: 4 }));
    expect(w.parties.p1.jarBalance.j20).toBe(6);
    expect(w.parties.p1.outstanding).toBe(20000); // jars never touch money
  });

  it('edit jar return qty and delete', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    const ret = { id: 'j1', type: 'jarReturn', partyId: 'p1', dateKey: '2026-01-12', jarTypeId: 'j20', qty: 3 };
    applyPlan(w, planChange(null, ret));
    applyPlan(w, planChange(ret, { ...ret, qty: 5 }));
    expect(w.parties.p1.jarBalance.j20).toBe(0);
    applyPlan(w, planChange({ ...ret, qty: 5 }, { ...ret, qty: 5, deleted: true }));
    expect(w.parties.p1.jarBalance.j20).toBe(5);
  });

  it('warns (does not block) when the balance would go negative', () => {
    const party = { jarBalance: { j20: 2 } };
    const ret = { type: 'jarReturn', partyId: 'p1', jarTypeId: 'j20', qty: 5, dateKey: '2026-01-12' };
    const warn = negativeJarWarnings(party, effectOf(ret));
    expect(warn).toEqual([{ jarTypeId: 'j20', balance: -3 }]);
    // the plan itself is still produced -> caller decides, nothing is blocked
    const w = world();
    applyPlan(w, planChange(null, ret));
    expect(w.parties.p1.jarBalance.j20).toBe(-5);
  });

  it('no warning when balance stays >= 0 or when jars increase', () => {
    expect(negativeJarWarnings({ jarBalance: { j20: 5 } }, effectOf({ type: 'jarReturn', jarTypeId: 'j20', qty: 5 }))).toEqual([]);
    expect(negativeJarWarnings({ jarBalance: { j20: -9 } }, effectOf({ type: 'jarGiven', jarTypeId: 'j20', qty: 1 }))).toEqual([]);
  });
});

describe('deposit', () => {
  const dep = (type, amount, id = 'd1') => ({ id, type, partyId: 'p1', dateKey: '2026-01-13', jarTypeId: 'j20', amount, deleted: false });

  it('deposit taken: deposit up, outstanding and sales untouched', () => {
    const w = world();
    applyPlan(w, planChange(null, dep('depositTaken', 100000)));
    expect(w.parties.p1.depositBalance).toBe(100000);
    expect(w.parties.p1.outstanding).toBe(0);
    expect(w.summary.totalDepositHeld).toBe(100000);
    expect(w.daily).toEqual({});
  });

  it('deposit refund: deposit down, outstanding untouched', () => {
    const w = world();
    applyPlan(w, planChange(null, dep('depositTaken', 100000)));
    applyPlan(w, planChange(null, dep('depositRefund', 40000, 'd2')));
    expect(w.parties.p1.depositBalance).toBe(60000);
    expect(w.parties.p1.outstanding).toBe(0);
  });

  it('deposit adjust: deposit down AND outstanding down', () => {
    const w = world();
    applyPlan(w, planChange(null, bill()));
    applyPlan(w, planChange(null, dep('depositTaken', 100000)));
    applyPlan(w, planChange(null, dep('depositAdjust', 15000, 'd3')));
    expect(w.parties.p1.depositBalance).toBe(85000);
    expect(w.parties.p1.outstanding).toBe(5000);
    expect(w.summary.totalOutstanding).toBe(5000);
    expect(w.summary.totalDepositHeld).toBe(85000);
  });

  it('edit and delete deposit entries', () => {
    const w = world();
    const d = dep('depositTaken', 100000);
    applyPlan(w, planChange(null, d));
    applyPlan(w, planChange(d, { ...d, amount: 120000 }));
    expect(w.parties.p1.depositBalance).toBe(120000);
    applyPlan(w, planChange({ ...d, amount: 120000 }, { ...d, amount: 120000, deleted: true }));
    expect(w.parties.p1.depositBalance).toBe(0);
  });

  it('bill + deposit taken in same save are planned together without touching sales', () => {
    const w = world();
    const plan = planChanges([[null, bill()], [null, dep('depositTaken', 50000)]]);
    applyPlan(w, plan);
    expect(w.parties.p1.outstanding).toBe(20000);
    expect(w.parties.p1.depositBalance).toBe(50000);
    expect(w.daily['2026-01-10'].sales).toBe(20000);
  });
});

describe('rate changes never rewrite old bills', () => {
  it('the bill stores a rate snapshot; changing party/item rate later has no effect on its effect', () => {
    const w = world();
    const saved = bill(); // rate snapshot 4000 inside the saved bill
    applyPlan(w, planChange(null, saved));
    const partyAfterRateChange = { ...w.parties.p1, jarRates: { j20: { rate: 9999, deposit: 1 } } };
    // an unrelated later edit of the SAME stored bill (e.g. note) uses the stored snapshot, not the new party rate
    const edited = { ...saved, note: 'checked' };
    const plan = planChange(saved, edited);
    expect(plan.parties).toEqual({});
    expect(effectOf(edited).outstanding).toBe(20000);
    expect(partyAfterRateChange.jarRates.j20.rate).toBe(9999);
    expect(w.parties.p1.outstanding).toBe(20000);
  });
});

describe('opening balances & recalculation', () => {
  it('opening state initialises stored balances', () => {
    const p = { openingBalance: 25000, openingJars: { j20: 4, j10: 0 }, openingDeposit: 80000 };
    expect(openingState(p)).toEqual({ outstanding: 25000, jarBalance: { j20: 4 }, depositBalance: 80000 });
  });

  it('editing opening values applies only the difference', () => {
    const a = { openingBalance: 25000, openingJars: { j20: 4 }, openingDeposit: 0 };
    const b = { openingBalance: 30000, openingJars: { j20: 2, j10: 1 }, openingDeposit: 500 };
    const d = openingDelta(a, b);
    expect(d.outstanding).toBe(5000);
    expect(d.deposit).toBe(500);
    expect(d.jars).toEqual({ j20: -2, j10: 1 });
  });

  it('recalculate equals incremental result; diff is empty when in sync and detects drift', () => {
    const w = world();
    w.parties.p1 = newParty({ openingBalance: 1000, openingJars: { j20: 2 } });
    w.summary = { totalOutstanding: 1000, totalDepositHeld: 0, totalJarsOut: { j20: 2 } };
    const txns = [
      bill(),
      { id: 'r1', type: 'receipt', partyId: 'p1', dateKey: '2026-01-11', amount: 5000, deleted: false },
      { id: 'j1', type: 'jarReturn', partyId: 'p1', dateKey: '2026-01-12', jarTypeId: 'j20', qty: 3, deleted: false },
      { id: 'd1', type: 'depositTaken', partyId: 'p1', dateKey: '2026-01-12', amount: 7000, deleted: false },
      { ...bill({ id: 'b2' }), deleted: true },
    ];
    for (const t of txns) applyPlan(w, planChange(null, t));
    const parties = [{ id: 'p1', name: 'Ram', openingBalance: 1000, openingJars: { j20: 2 }, openingDeposit: 0, ...w.parties.p1 }];
    const calc = recalculate(parties, txns);
    expect(calc.balances.p1.outstanding).toBe(16000);
    expect(calc.balances.p1.jarBalance.j20).toBe(4);
    expect(calc.balances.p1.depositBalance).toBe(7000);
    expect(diffRecalc(parties, calc, w.summary, w.daily)).toEqual([]);

    const drifted = [{ ...parties[0], outstanding: 99 }];
    const diffs = diffRecalc(drifted, calc, w.summary, w.daily);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ field: 'outstanding', stored: 99, calculated: 16000 });
  });
});

describe('money & rounding', () => {
  it('toPaise parses without float errors', () => {
    expect(toPaise('0.1')).toBe(10);
    expect(toPaise('19.99')).toBe(1999);
    expect(toPaise('1,250.50')).toBe(125050);
    expect(toPaise('1.005')).toBe(101); // round half up
    expect(toPaise('1.004')).toBe(100);
    expect(toPaise('abc')).toBe(0);
    expect(toPaise('')).toBe(0);
    expect(toPaise('-5')).toBe(-500);
    expect(toPaise(0.29)).toBe(29);
  });

  it('fromPaise / fmtMoney', () => {
    expect(fromPaise(1999)).toBe('19.99');
    expect(fromPaise(5)).toBe('0.05');
    expect(fromPaise(-250)).toBe('-2.50');
    expect(fmtMoney(123456700)).toBe('₹12,34,567');
    expect(fmtMoney(12345)).toBe('₹123.45');
    expect(fmtMoney(-5000, 'Rs ')).toBe('-Rs 50');
  });

  it('line amounts are rounded to whole paise and totals add exactly', () => {
    expect(lineAmount(3, 3333)).toBe(9999);
    expect(lineAmount(0.5, 3333)).toBe(1667); // 1666.5 -> 1667
    expect(lineAmount(1.1, 1000)).toBe(1100); // 1.1*1000 = 1100.0000000000002 in float
    const lines = [{ amount: lineAmount(3, 3333) }, { amount: lineAmount(7, 1429) }];
    expect(billTotals(lines, 100, 50)).toEqual({ subTotal: 9999 + 10003, total: 9999 + 10003 - 100 + 50 });
    // many small additions stay exact because everything is integers
    let s = 0;
    for (let i = 0; i < 1000; i++) s += toPaise('0.10');
    expect(s).toBe(10000);
  });
});
