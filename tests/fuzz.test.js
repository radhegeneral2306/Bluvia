// Seeded property/fuzz tests for the pure ledger + money logic.
// Every step applies the plan EXACTLY like Firestore increments would (see applyPlan) and then
// checks the incremental result against a full recalculate() from the raw transactions.
import { describe, it, expect } from 'vitest';
import {
  effectOf, planChange, planChanges, negativeJarWarnings, openingState, openingDelta,
  recalculate, diffRecalc,
} from '../src/lib/ledger.js';
import { toPaise, fromPaise, lineAmount, billTotals } from '../src/lib/money.js';

// ---------- reproducible PRNG ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = (rng) => ({
  f: () => rng(),
  int: (a, b) => a + Math.floor(rng() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(rng() * arr.length)],
  chance: (p) => rng() < p,
});

const JARS = ['j1', 'j2', 'j3'];
const PARTY_IDS = ['p1', 'p2', 'p3'];
const DATES = Array.from({ length: 24 }, (_, i) => `2026-0${1 + Math.floor(i / 12)}-${String((i % 12) + 10)}`);

// ---------- in-memory "Firestore" ----------
function makeWorld(r) {
  const w = { parties: {}, txns: {}, summary: { totalOutstanding: 0, totalDepositHeld: 0, totalJarsOut: {} }, daily: {}, nextId: 1 };
  for (const id of PARTY_IDS) {
    const openingJars = {};
    for (const j of JARS) if (r.chance(0.5)) openingJars[j] = r.int(0, 6);
    const p = { id, name: id, openingBalance: r.int(-5000, 90000), openingJars, openingDeposit: r.int(0, 50000) };
    const o = openingState(p);
    // exactly what createParty writes
    w.parties[id] = { ...p, outstanding: o.outstanding, jarBalance: { ...o.jarBalance }, depositBalance: o.depositBalance };
    w.summary.totalOutstanding += o.outstanding;
    w.summary.totalDepositHeld += o.depositBalance;
    for (const [k, v] of Object.entries(o.jarBalance)) w.summary.totalJarsOut[k] = (w.summary.totalJarsOut[k] || 0) + v;
  }
  return w;
}

// identical semantics to the increment() batches in src/data/api.js writePlan
function applyPlan(w, plan) {
  for (const [pid, e] of Object.entries(plan.parties)) {
    const p = w.parties[pid];
    p.outstanding += e.outstanding;
    p.depositBalance += e.deposit;
    for (const [k, v] of Object.entries(e.jars)) p.jarBalance[k] = (p.jarBalance[k] || 0) + v;
  }
  const g = plan.global, s = w.summary;
  s.totalOutstanding += g.outstanding;
  s.totalDepositHeld += g.deposit;
  for (const [k, v] of Object.entries(g.jars)) s.totalJarsOut[k] = (s.totalJarsOut[k] || 0) + v;
  for (const [k, v] of Object.entries(g.daily)) {
    const d = (w.daily[k] ||= { sales: 0, collection: 0, billsCount: 0 });
    d.sales += v.sales; d.collection += v.collection; d.billsCount += v.billsCount;
  }
}

function assertInSync(w, ctx) {
  const parties = Object.values(w.parties);
  const calc = recalculate(parties, Object.values(w.txns));
  const diffs = diffRecalc(parties, calc, w.summary, w.daily);
  expect(diffs, ctx).toEqual([]);
  expect(calc.orphans, ctx).toEqual([]);
}

// ---------- random transaction factory ----------
function randLine(r) {
  const jar = r.chance(0.7);
  const jarTypeId = jar ? r.pick(JARS) : null;
  const qty = jar ? r.int(1, 20) : r.pick([1, 2, 3, 0.5, 1.5, 2.25]);
  const rate = r.int(100, 9999);
  return { itemId: `i-${jarTypeId || 'x'}`, itemName: 'Item', jarTypeId, qty, rate, amount: lineAmount(qty, rate), jarGiven: jar ? r.chance(0.85) : false };
}
function randBill(r, base) {
  const lines = Array.from({ length: r.int(1, 3) }, () => randLine(r));
  const sub = lines.reduce((s, l) => s + l.amount, 0);
  const discount = r.chance(0.3) ? r.int(0, Math.max(0, sub)) : 0;
  const extraCharge = r.chance(0.3) ? r.int(0, 2000) : 0;
  const { subTotal, total } = billTotals(lines, discount, extraCharge);
  return { ...base, type: 'bill', lines, subTotal, discount, extraCharge, total };
}
function randTxn(r, w, forceType) {
  const id = `t${w.nextId++}`;
  const type = forceType || r.pick(['bill', 'bill', 'receipt', 'receipt', 'jarReturn', 'jarGiven', 'depositTaken', 'depositRefund', 'depositAdjust', 'adjustment']);
  const base = { id, type, partyId: r.pick(PARTY_IDS), dateKey: r.pick(DATES), deleted: false };
  switch (type) {
    case 'bill': return randBill(r, base);
    case 'receipt': return { ...base, amount: r.int(1, 60000) };
    case 'jarReturn': case 'jarGiven': return { ...base, jarTypeId: r.pick(JARS), qty: r.int(1, 12) };
    case 'adjustment': return { ...base, amount: r.pick([-1, 1]) * r.int(1, 30000) };
    default: return { ...base, jarTypeId: r.chance(0.5) ? r.pick(JARS) : null, amount: r.int(1, 80000) };
  }
}
const GROUPS = [['jarReturn', 'jarGiven'], ['depositTaken', 'depositRefund', 'depositAdjust']];
function randEdit(r, old) {
  const patch = {};
  if (r.chance(0.35)) patch.partyId = r.pick(PARTY_IDS);   // party move
  if (r.chance(0.35)) patch.dateKey = r.pick(DATES);       // date move
  if (old.type === 'bill') {
    if (r.chance(0.7)) return randBill(r, { ...old, ...patch });
  } else if (old.type === 'receipt' || old.type === 'adjustment') {
    if (r.chance(0.7)) patch.amount = old.type === 'adjustment' ? r.pick([-1, 1]) * r.int(1, 30000) : r.int(1, 60000);
  } else if (old.type === 'jarReturn' || old.type === 'jarGiven') {
    if (r.chance(0.5)) patch.qty = r.int(1, 12);
    if (r.chance(0.3)) patch.jarTypeId = r.pick(JARS);
  } else if (r.chance(0.7)) patch.amount = r.int(1, 80000);
  const group = GROUPS.find((g) => g.includes(old.type));
  if (group && r.chance(0.3)) patch.type = r.pick(group); // same type-switch the entry form allows
  return { ...old, ...patch };
}

// one random step; returns a label for failure messages
function step(r, w) {
  const all = Object.values(w.txns);
  const live = all.filter((t) => !t.deleted);
  const dead = all.filter((t) => t.deleted);
  const roll = r.f();
  if (roll < 0.40 || !all.length) {
    // bill + deposit + returns in ONE batch, like createBill's single transaction
    if (r.chance(0.2)) {
      const bill = randTxn(r, w, 'bill');
      const dep = { ...randTxn(r, w, 'depositTaken'), partyId: bill.partyId, dateKey: bill.dateKey };
      const ret = { ...randTxn(r, w, 'jarReturn'), partyId: bill.partyId, dateKey: bill.dateKey };
      applyPlan(w, planChanges([[null, bill], [null, dep], [null, ret]]));
      for (const t of [bill, dep, ret]) w.txns[t.id] = t;
      return 'create-batch';
    }
    const t = randTxn(r, w);
    applyPlan(w, planChange(null, t));
    w.txns[t.id] = t;
    return `create ${t.type}`;
  }
  if (roll < 0.70 && live.length) {
    const old = r.pick(live);
    const nw = randEdit(r, old);
    applyPlan(w, planChange(old, nw));
    w.txns[old.id] = nw;
    return `edit ${old.type}->${nw.type}`;
  }
  if (roll < 0.88 && live.length) {
    const old = r.pick(live);
    const nw = { ...old, deleted: true };
    applyPlan(w, planChange(old, nw));
    w.txns[old.id] = nw;
    return `delete ${old.type}`;
  }
  if (dead.length) {
    const old = r.pick(dead);
    const nw = { ...old, deleted: false };
    applyPlan(w, planChange(old, nw));
    w.txns[old.id] = nw;
    return `restore ${old.type}`;
  }
  return 'noop';
}

const cleanJars = (j) => Object.fromEntries(Object.entries(j).filter(([, v]) => v));

describe('ledger fuzz: incremental balances == full recalculation', () => {
  for (const seed of [1, 2, 3, 7, 42, 2026]) {
    it(`seed ${seed}: 1500 random create/edit/delete/restore steps stay in sync after EVERY step`, () => {
      const r = R(mulberry32(seed));
      const w = makeWorld(r);
      assertInSync(w, `seed ${seed} initial`);
      for (let i = 0; i < 1500; i++) {
        const what = step(r, w);
        assertInSync(w, `seed ${seed} step ${i} (${what})`);
      }
    });
  }

  it('deposit is NEVER part of sales: daily sales == sum of live bill totals, collection == sum of live receipts', () => {
    const r = R(mulberry32(99));
    const w = makeWorld(r);
    for (let i = 0; i < 1200; i++) step(r, w);
    const live = Object.values(w.txns).filter((t) => !t.deleted);
    const sales = {}; const coll = {}; const cnt = {};
    for (const t of live) {
      if (t.type === 'bill') { sales[t.dateKey] = (sales[t.dateKey] || 0) + t.total; cnt[t.dateKey] = (cnt[t.dateKey] || 0) + 1; }
      if (t.type === 'receipt') coll[t.dateKey] = (coll[t.dateKey] || 0) + t.amount;
    }
    for (const k of new Set([...Object.keys(w.daily), ...Object.keys(sales), ...Object.keys(coll)])) {
      const d = w.daily[k] || { sales: 0, collection: 0, billsCount: 0 };
      expect(d.sales, `sales ${k}`).toBe(sales[k] || 0);
      expect(d.collection, `collection ${k}`).toBe(coll[k] || 0);
      expect(d.billsCount, `bills ${k}`).toBe(cnt[k] || 0);
    }
    // a deposit-only history has no sales and no collection at all
    const w2 = makeWorld(R(mulberry32(5)));
    const rr = R(mulberry32(6));
    for (let i = 0; i < 200; i++) {
      const t = randTxn(rr, w2, rr.pick(['depositTaken', 'depositRefund', 'depositAdjust']));
      applyPlan(w2, planChange(null, t)); w2.txns[t.id] = t;
    }
    expect(w2.daily).toEqual({});
  });

  for (const seed of [11, 12, 13]) {
    it(`seed ${seed}: deleting everything returns exactly to the opening state; restoring everything returns to the snapshot`, () => {
      const r = R(mulberry32(seed));
      const w = makeWorld(r);
      const openings = Object.fromEntries(PARTY_IDS.map((id) => [id, openingState(w.parties[id])]));
      for (let i = 0; i < 600; i++) step(r, w);
      const snap = JSON.parse(JSON.stringify({ parties: w.parties, summary: w.summary }));
      const liveBefore = Object.values(w.txns).filter((t) => !t.deleted);

      for (const t of liveBefore) { const nw = { ...t, deleted: true }; applyPlan(w, planChange(t, nw)); w.txns[t.id] = nw; }
      assertInSync(w, `seed ${seed} after delete-all`);
      let totO = 0, totD = 0; const totJ = {};
      for (const id of PARTY_IDS) {
        const p = w.parties[id], o = openings[id];
        expect(p.outstanding).toBe(o.outstanding);
        expect(p.depositBalance).toBe(o.depositBalance);
        expect(cleanJars(p.jarBalance)).toEqual(cleanJars(o.jarBalance));
        totO += o.outstanding; totD += o.depositBalance;
        for (const [k, v] of Object.entries(o.jarBalance)) totJ[k] = (totJ[k] || 0) + v;
      }
      expect(w.summary.totalOutstanding).toBe(totO);
      expect(w.summary.totalDepositHeld).toBe(totD);
      expect(cleanJars(w.summary.totalJarsOut)).toEqual(cleanJars(totJ));
      for (const d of Object.values(w.daily)) expect(d).toEqual({ sales: 0, collection: 0, billsCount: 0 });

      for (const t of liveBefore) { const del = w.txns[t.id]; const nw = { ...del, deleted: false }; applyPlan(w, planChange(del, nw)); w.txns[t.id] = nw; }
      assertInSync(w, `seed ${seed} after restore-all`);
      for (const id of PARTY_IDS) {
        expect(w.parties[id].outstanding).toBe(snap.parties[id].outstanding);
        expect(w.parties[id].depositBalance).toBe(snap.parties[id].depositBalance);
        expect(cleanJars(w.parties[id].jarBalance)).toEqual(cleanJars(snap.parties[id].jarBalance));
      }
      expect(w.summary.totalOutstanding).toBe(snap.summary.totalOutstanding);
    });
  }

  it('a batch of several creates is identical to applying them one by one (bill + deposit + returns)', () => {
    const r = R(mulberry32(77));
    for (let n = 0; n < 200; n++) {
      const w1 = makeWorld(r); const w2 = JSON.parse(JSON.stringify(w1));
      const txns = Array.from({ length: r.int(1, 4) }, () => randTxn(r, w1));
      applyPlan(w1, planChanges(txns.map((t) => [null, t])));
      for (const t of txns) applyPlan(w2, planChange(null, t));
      const norm = (w) => ({
        parties: Object.fromEntries(Object.entries(w.parties).map(([k, p]) => [k, { o: p.outstanding, d: p.depositBalance, j: cleanJars(p.jarBalance) }])),
        s: { o: w.summary.totalOutstanding, d: w.summary.totalDepositHeld, j: cleanJars(w.summary.totalJarsOut) },
        daily: Object.fromEntries(Object.entries(w.daily).filter(([, d]) => d.sales || d.collection || d.billsCount)),
      });
      expect(norm(w1)).toEqual(norm(w2));
    }
  });

  it('planChange(old, old) is always empty and planChange(null,x) then planChange(x,null-like deleted) cancels out', () => {
    const r = R(mulberry32(123));
    const w = makeWorld(r);
    for (let i = 0; i < 500; i++) {
      const t = randTxn(r, w);
      const same = planChange(t, { ...t });
      expect(same.parties).toEqual({});
      expect(same.global.daily).toEqual({});
      expect(same.global.outstanding).toBe(0);
      expect(same.global.deposit).toBe(0);
      expect(same.global.jars).toEqual({});
      const there = planChange(null, t);
      const back = planChange(t, { ...t, deleted: true });
      for (const [pid, e] of Object.entries(there.parties)) {
        expect(e.outstanding + (back.parties[pid]?.outstanding || 0)).toBe(0);
        expect(e.deposit + (back.parties[pid]?.deposit || 0)).toBe(0);
      }
    }
  });

  it('only parties with a changed balance appear in the plan (no useless writes)', () => {
    const r = R(mulberry32(31));
    const w = makeWorld(r);
    for (let i = 0; i < 500; i++) {
      const t = randTxn(r, w);
      const plan = planChange(null, t);
      for (const e of Object.values(plan.parties)) {
        expect(e.outstanding !== 0 || e.deposit !== 0 || Object.keys(e.jars).length > 0).toBe(true);
      }
      for (const v of Object.values(effectOf(t).jars)) expect(Number.isInteger(v)).toBe(true);
    }
  });
});

// ---------- independent oracle: the business rules written out again, WITHOUT using effectOf ----------
// (so a wrong rule inside effectOf cannot hide behind "incremental == recalculate", which share effectOf)
function oracle(w) {
  const out = {};
  for (const id of PARTY_IDS) {
    const p = w.parties[id];
    out[id] = { o: p.openingBalance, d: p.openingDeposit, j: { ...p.openingJars } };
  }
  for (const t of Object.values(w.txns)) {
    if (t.deleted) continue;
    const b = out[t.partyId];
    if (t.type === 'bill') {
      b.o += t.total;
      for (const l of t.lines) if (l.jarTypeId && l.jarGiven) b.j[l.jarTypeId] = (b.j[l.jarTypeId] || 0) + l.qty;
    } else if (t.type === 'receipt') b.o -= t.amount;
    else if (t.type === 'jarReturn') b.j[t.jarTypeId] = (b.j[t.jarTypeId] || 0) - t.qty;
    else if (t.type === 'jarGiven') b.j[t.jarTypeId] = (b.j[t.jarTypeId] || 0) + t.qty;
    else if (t.type === 'depositTaken') b.d += t.amount;
    else if (t.type === 'depositRefund') b.d -= t.amount;
    else if (t.type === 'depositAdjust') { b.d -= t.amount; b.o -= t.amount; }
    else if (t.type === 'adjustment') b.o += t.amount;
  }
  return out;
}

describe('independent business-rule oracle', () => {
  for (const seed of [21, 22, 23, 24]) {
    it(`seed ${seed}: incremental balances match the spec rules written out independently`, () => {
      const r = R(mulberry32(seed));
      const w = makeWorld(r);
      for (let i = 0; i < 1200; i++) {
        const what = step(r, w);
        const want = oracle(w);
        let to = 0, td = 0; const tj = {};
        for (const id of PARTY_IDS) {
          const p = w.parties[id];
          const ctx = `seed ${seed} step ${i} (${what}) party ${id}`;
          expect(p.outstanding, ctx).toBe(want[id].o);
          expect(p.depositBalance, ctx).toBe(want[id].d);
          expect(cleanJars(p.jarBalance), ctx).toEqual(cleanJars(want[id].j));
          to += want[id].o; td += want[id].d;
          for (const [k, v] of Object.entries(want[id].j)) tj[k] = (tj[k] || 0) + v;
        }
        expect(w.summary.totalOutstanding, `seed ${seed} step ${i}`).toBe(to);
        expect(w.summary.totalDepositHeld, `seed ${seed} step ${i}`).toBe(td);
        expect(cleanJars(w.summary.totalJarsOut), `seed ${seed} step ${i}`).toEqual(cleanJars(tj));
      }
    });
  }
});

describe('openingDelta fuzz', () => {
  it('stored(old opening) + openingDelta(old,new) == openingState(new) for random openings', () => {
    const r = R(mulberry32(555));
    const rndOpening = () => {
      const openingJars = {};
      for (const j of JARS) if (r.chance(0.6)) openingJars[j] = r.int(0, 9);
      return { openingBalance: r.int(-9000, 99000), openingJars, openingDeposit: r.int(0, 70000) };
    };
    for (let i = 0; i < 2000; i++) {
      const a = rndOpening(), b = rndOpening();
      const sa = openingState(a), sb = openingState(b);
      const d = openingDelta(a, b);
      expect(sa.outstanding + d.outstanding).toBe(sb.outstanding);
      expect(sa.depositBalance + d.deposit).toBe(sb.depositBalance);
      for (const j of JARS) expect((sa.jarBalance[j] || 0) + (d.jars[j] || 0)).toBe(sb.jarBalance[j] || 0);
      expect(openingDelta(a, a)).toEqual({ outstanding: 0, deposit: 0, jars: {}, daily: {} });
    }
  });

  it('editing opening values mid-history keeps incremental == recalculation', () => {
    const r = R(mulberry32(808));
    const w = makeWorld(r);
    for (let i = 0; i < 400; i++) {
      step(r, w);
      if (r.chance(0.1)) {
        const id = r.pick(PARTY_IDS), old = w.parties[id];
        const openingJars = {};
        for (const j of JARS) if (r.chance(0.5)) openingJars[j] = r.int(0, 8);
        const nw = { ...old, openingBalance: r.int(-5000, 80000), openingJars, openingDeposit: r.int(0, 40000) };
        const d = openingDelta(old, nw);
        // what updateParty does: replace opening fields, add delta to balances and to stats
        w.parties[id] = { ...nw, outstanding: old.outstanding + d.outstanding, depositBalance: old.depositBalance + d.deposit, jarBalance: { ...old.jarBalance } };
        for (const [k, v] of Object.entries(d.jars)) w.parties[id].jarBalance[k] = (w.parties[id].jarBalance[k] || 0) + v;
        w.summary.totalOutstanding += d.outstanding;
        w.summary.totalDepositHeld += d.deposit;
        for (const [k, v] of Object.entries(d.jars)) w.summary.totalJarsOut[k] = (w.summary.totalJarsOut[k] || 0) + v;
      }
      assertInSync(w, `opening-edit step ${i}`);
    }
  });
});

describe('negative jar warnings (warn only)', () => {
  it('warns exactly for jar types that decrease AND end below zero', () => {
    const r = R(mulberry32(404));
    for (let i = 0; i < 3000; i++) {
      const party = { jarBalance: Object.fromEntries(JARS.map((j) => [j, r.int(-3, 10)])) };
      const eff = { jars: Object.fromEntries(JARS.filter(() => r.chance(0.6)).map((j) => [j, r.int(-12, 8)])) };
      const got = negativeJarWarnings(party, eff).map((x) => x.jarTypeId).sort();
      const want = JARS.filter((j) => (eff.jars[j] ?? 0) < 0 && party.jarBalance[j] + eff.jars[j] < 0).sort();
      expect(got).toEqual(want);
      for (const w of negativeJarWarnings(party, eff)) expect(w.balance).toBe(party.jarBalance[w.jarTypeId] + eff.jars[w.jarTypeId]);
    }
  });
});

describe('money fuzz', () => {
  it('fromPaise/toPaise round-trip for random integer paise (positive, negative, huge)', () => {
    const r = R(mulberry32(1));
    for (let i = 0; i < 5000; i++) {
      const p = r.pick([r.int(-9999999, 9999999), r.int(0, 99), r.int(-99, 0), r.int(0, 2 ** 40)]);
      expect(toPaise(fromPaise(p)), `p=${p}`).toBe(p);
    }
  });

  it('toPaise equals pure integer string arithmetic for random decimal strings (0-2 decimals exact, 3rd decimal rounds half up)', () => {
    const r = R(mulberry32(2));
    for (let i = 0; i < 6000; i++) {
      const rupees = r.int(0, 999999);
      const decs = r.int(0, 4);
      const frac = Array.from({ length: decs }, () => r.int(0, 9)).join('');
      const s = decs ? `${rupees}.${frac}` : String(rupees);
      const padded = (frac + '00').slice(0, 2);
      let want = rupees * 100 + Number(padded);
      if (frac.length > 2 && frac[2] >= '5') want += 1;
      expect(toPaise(s), s).toBe(want);
      expect(toPaise(`-${s}`), `-${s}`).toBe(-want);
      // as a JS number too (what a numeric input box may give): only compare when the number prints back identically
      if (String(Number(s)) === s) expect(toPaise(Number(s)), `num ${s}`).toBe(want);
    }
    expect(toPaise('1,00,000.50')).toBe(10000050);
    expect(toPaise('.5')).toBe(50);
    expect(toPaise('5.')).toBe(500);
    for (const bad of ['', '-', '.', 'abc', '1.2.3', '1e3', ' ', null, undefined, '--5', '₹5']) expect(toPaise(bad), String(bad)).toBe(0);
  });

  it('adding many fromPaise/toPaise values never drifts (integer paise only)', () => {
    const r = R(mulberry32(3));
    let sumInt = 0, sumStr = 0;
    for (let i = 0; i < 20000; i++) { const p = r.int(-5000, 5000); sumInt += p; sumStr += toPaise(fromPaise(p)); }
    expect(sumStr).toBe(sumInt);
  });

  it('lineAmount equals exact integer arithmetic for integer quantities', () => {
    const r = R(mulberry32(4));
    for (let i = 0; i < 20000; i++) {
      const q = r.int(0, 5000), rate = r.int(0, 1000000);
      expect(lineAmount(q, rate), `${q}x${rate}`).toBe(q * rate);
    }
  });

  it('lineAmount for quantities with 1-3 decimals rounds half up on the exact value', () => {
    const r = R(mulberry32(5));
    for (let i = 0; i < 20000; i++) {
      const decs = r.int(1, 3);
      const q1000 = r.int(1, 99000);                       // qty in thousandths
      const q = q1000 / 1000;
      if (String(q).split('.')[1]?.length > decs) continue; // only quantities that have <= `decs` decimals
      const rate = r.int(1, 99999);
      const exactNumer = q1000 * rate;                      // value * 1000
      const want = Math.floor((2 * exactNumer + 1000) / 2000); // round half up
      expect(lineAmount(q, rate), `${q}x${rate}`).toBe(want);
    }
  });

  it('billTotals: subTotal is the integer sum of amounts and total = sub - discount + extra', () => {
    const r = R(mulberry32(6));
    for (let i = 0; i < 5000; i++) {
      const lines = Array.from({ length: r.int(0, 6) }, () => ({ amount: r.int(0, 500000) }));
      const discount = r.int(0, 100000), extra = r.int(0, 100000);
      const sub = lines.reduce((s, l) => s + l.amount, 0);
      expect(billTotals(lines, discount, extra)).toEqual({ subTotal: sub, total: sub - discount + extra });
    }
    expect(billTotals([], undefined, undefined)).toEqual({ subTotal: 0, total: 0 });
    expect(billTotals(undefined, 0, 0)).toEqual({ subTotal: 0, total: 0 });
  });
});
