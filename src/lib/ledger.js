// Pure balance logic. No Firebase here, so it is fully unit-testable.
// All money = integer paise.

export const TXN_TYPES = [
  'bill', 'receipt', 'jarReturn', 'jarGiven',
  'depositTaken', 'depositRefund', 'depositAdjust', 'adjustment',
];

export const TYPE_LABELS = {
  bill: 'Bill',
  receipt: 'Receipt',
  jarReturn: 'Jar Return',
  jarGiven: 'Jar Given',
  depositTaken: 'Deposit Taken',
  depositRefund: 'Deposit Refund',
  depositAdjust: 'Deposit Adjusted',
  adjustment: 'Adjustment',
};

export function emptyEffect() {
  return { outstanding: 0, deposit: 0, jars: {}, daily: {} };
}

function addJar(jars, id, n) {
  if (!id || !n) return;
  jars[id] = (jars[id] || 0) + n;
}
function addDaily(e, key, patch) {
  if (!key) return;
  const d = (e.daily[key] ||= { sales: 0, collection: 0, billsCount: 0 });
  d.sales += patch.sales || 0;
  d.collection += patch.collection || 0;
  d.billsCount += patch.billsCount || 0;
}

/** The effect ONE transaction has on balances. Deleted/absent => zero effect. */
export function effectOf(t) {
  const e = emptyEffect();
  if (!t || t.deleted) return e;
  const amount = t.amount || 0;
  switch (t.type) {
    case 'bill':
      e.outstanding += t.total || 0;
      for (const l of t.lines || []) {
        if (l.jarTypeId && l.jarGiven) addJar(e.jars, l.jarTypeId, l.qty || 0);
      }
      addDaily(e, t.dateKey, { sales: t.total || 0, billsCount: 1 }); // deposit is NEVER in sales
      break;
    case 'receipt':
      e.outstanding -= amount;
      addDaily(e, t.dateKey, { collection: amount });
      break;
    case 'jarReturn':
      addJar(e.jars, t.jarTypeId, -(t.qty || 0));
      break;
    case 'jarGiven':
      addJar(e.jars, t.jarTypeId, t.qty || 0);
      break;
    case 'depositTaken':
      e.deposit += amount;
      break;
    case 'depositRefund':
      e.deposit -= amount;
      break;
    case 'depositAdjust':
      e.deposit -= amount;
      e.outstanding -= amount;
      break;
    case 'adjustment': // signed amount: + increases dues, - reduces dues
      e.outstanding += amount;
      break;
    default:
      break;
  }
  return e;
}

export function addEffects(a, b, sign = 1) {
  const r = emptyEffect();
  r.outstanding = a.outstanding + sign * b.outstanding;
  r.deposit = a.deposit + sign * b.deposit;
  for (const [k, v] of Object.entries(a.jars)) addJar(r.jars, k, v);
  for (const [k, v] of Object.entries(b.jars)) addJar(r.jars, k, sign * v);
  for (const [k, v] of Object.entries(a.daily)) addDaily(r, k, v);
  for (const [k, v] of Object.entries(b.daily)) {
    addDaily(r, k, { sales: sign * v.sales, collection: sign * v.collection, billsCount: sign * v.billsCount });
  }
  return r;
}

function prune(e) {
  for (const k of Object.keys(e.jars)) if (!e.jars[k]) delete e.jars[k];
  for (const k of Object.keys(e.daily)) {
    const d = e.daily[k];
    if (!d.sales && !d.collection && !d.billsCount) delete e.daily[k];
  }
  return e;
}

export function isZeroEffect(e) {
  return !e.outstanding && !e.deposit && !Object.keys(e.jars).length && !Object.keys(e.daily).length;
}

/**
 * Given pairs of [oldTxn, newTxn] (null for create / delete) return only the DIFFERENCE
 * to apply: per-party deltas and one global delta (for stats docs).
 */
export function planChanges(pairs) {
  const parties = {};
  let global = emptyEffect();
  const put = (t, sign) => {
    if (!t) return;
    const e = effectOf(t);
    parties[t.partyId] = addEffects(parties[t.partyId] || emptyEffect(), e, sign);
    global = addEffects(global, e, sign);
  };
  for (const [oldT, newT] of pairs) {
    put(oldT, -1);
    put(newT, 1);
  }
  for (const id of Object.keys(parties)) {
    prune(parties[id]);
    // a party only needs a write if its own balances changed
    const p = parties[id];
    if (!p.outstanding && !p.deposit && !Object.keys(p.jars).length) delete parties[id];
  }
  return { parties, global: prune(global) };
}
export const planChange = (oldT, newT) => planChanges([[oldT, newT]]);

/** Jar types that would go negative after applying `effect` to `party` (warn only, never block). */
export function negativeJarWarnings(party, effect) {
  const out = [];
  for (const [id, delta] of Object.entries(effect.jars || {})) {
    if (delta >= 0) continue;
    const after = ((party?.jarBalance || {})[id] || 0) + delta;
    if (after < 0) out.push({ jarTypeId: id, balance: after });
  }
  return out;
}

/** Stored balances a brand new party starts with. */
export function openingState(p) {
  const jarBalance = {};
  for (const [id, n] of Object.entries(p.openingJars || {})) if (n) jarBalance[id] = n;
  return {
    outstanding: p.openingBalance || 0,
    jarBalance,
    depositBalance: p.openingDeposit || 0,
  };
}

/** When opening figures of an existing party are edited, only the difference moves balances. */
export function openingDelta(oldP, newP) {
  const a = openingState(oldP);
  const b = openingState(newP);
  const e = emptyEffect();
  e.outstanding = b.outstanding - a.outstanding;
  e.deposit = b.depositBalance - a.depositBalance;
  const ids = new Set([...Object.keys(a.jarBalance), ...Object.keys(b.jarBalance)]);
  for (const id of ids) addJar(e.jars, id, (b.jarBalance[id] || 0) - (a.jarBalance[id] || 0));
  return prune(e);
}

/** Rebuild everything from opening balances + non-deleted transactions. */
export function recalculate(parties, txns) {
  const balances = {};
  for (const p of parties) {
    const o = openingState(p);
    balances[p.id] = { outstanding: o.outstanding, depositBalance: o.depositBalance, jarBalance: { ...o.jarBalance } };
  }
  const daily = {};
  const orphans = [];
  for (const t of txns) {
    if (t.deleted) continue;
    const e = effectOf(t);
    const b = balances[t.partyId];
    if (!b) { orphans.push(t.id); continue; }
    b.outstanding += e.outstanding;
    b.depositBalance += e.deposit;
    for (const [k, v] of Object.entries(e.jars)) b.jarBalance[k] = (b.jarBalance[k] || 0) + v;
    for (const [k, v] of Object.entries(e.daily)) {
      const d = (daily[k] ||= { sales: 0, collection: 0, billsCount: 0 });
      d.sales += v.sales; d.collection += v.collection; d.billsCount += v.billsCount;
    }
  }
  const summary = { totalOutstanding: 0, totalJarsOut: {}, totalDepositHeld: 0 };
  for (const b of Object.values(balances)) {
    summary.totalOutstanding += b.outstanding;
    summary.totalDepositHeld += b.depositBalance;
    for (const [k, v] of Object.entries(b.jarBalance)) summary.totalJarsOut[k] = (summary.totalJarsOut[k] || 0) + v;
  }
  return { balances, summary, daily, orphans };
}

const cleanJars = (j) => Object.fromEntries(Object.entries(j || {}).filter(([, v]) => v));

/** Compare stored vs recalculated; returns list of human readable differences. */
export function diffRecalc(parties, calc, storedSummary, storedDaily = {}) {
  const diffs = [];
  for (const p of parties) {
    const c = calc.balances[p.id];
    if (!c) continue;
    if ((p.outstanding || 0) !== c.outstanding)
      diffs.push({ scope: 'party', id: p.id, name: p.name, field: 'outstanding', stored: p.outstanding || 0, calculated: c.outstanding });
    if ((p.depositBalance || 0) !== c.depositBalance)
      diffs.push({ scope: 'party', id: p.id, name: p.name, field: 'depositBalance', stored: p.depositBalance || 0, calculated: c.depositBalance });
    const sj = cleanJars(p.jarBalance), cj = cleanJars(c.jarBalance);
    for (const id of new Set([...Object.keys(sj), ...Object.keys(cj)])) {
      if ((sj[id] || 0) !== (cj[id] || 0))
        diffs.push({ scope: 'party', id: p.id, name: p.name, field: `jarBalance.${id}`, stored: sj[id] || 0, calculated: cj[id] || 0 });
    }
  }
  const s = storedSummary || {};
  if ((s.totalOutstanding || 0) !== calc.summary.totalOutstanding)
    diffs.push({ scope: 'summary', field: 'totalOutstanding', stored: s.totalOutstanding || 0, calculated: calc.summary.totalOutstanding });
  if ((s.totalDepositHeld || 0) !== calc.summary.totalDepositHeld)
    diffs.push({ scope: 'summary', field: 'totalDepositHeld', stored: s.totalDepositHeld || 0, calculated: calc.summary.totalDepositHeld });
  const sj = cleanJars(s.totalJarsOut), cj = cleanJars(calc.summary.totalJarsOut);
  for (const id of new Set([...Object.keys(sj), ...Object.keys(cj)])) {
    if ((sj[id] || 0) !== (cj[id] || 0))
      diffs.push({ scope: 'summary', field: `totalJarsOut.${id}`, stored: sj[id] || 0, calculated: cj[id] || 0 });
  }
  const keys = new Set([...Object.keys(storedDaily), ...Object.keys(calc.daily)]);
  for (const k of keys) {
    const a = storedDaily[k] || {}, b = calc.daily[k] || { sales: 0, collection: 0, billsCount: 0 };
    for (const f of ['sales', 'collection', 'billsCount']) {
      if ((a[f] || 0) !== b[f]) diffs.push({ scope: 'daily', id: k, field: f, stored: a[f] || 0, calculated: b[f] });
    }
  }
  return diffs;
}
