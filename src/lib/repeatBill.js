// "Repeat bill": copy items, quantities and the OLD rates of an earlier bill into a new bill.
// Discount, extra charge, note, deposit, returned jars and the invoice FOR text are NOT copied (they belong to that one delivery).
import { rateFor } from './rates.js';

/** The newest non-deleted bill in a list of transactions that is already sorted newest first. */
export function findLastBill(entries) {
  return (entries || []).find((t) => t && t.type === 'bill' && !t.deleted) || null;
}

/**
 * Lines for the new bill.
 * Returns { lines, skipped, changedRates } where
 *  - lines: [{ itemId, qty, rate, jarGiven, currentRate }]  rate = the old bill's rate (editable); currentRate = today's rate for this party and item
 *  - skipped: item names that no longer exist or are inactive (they are left out)
 *  - changedRates: how many lines have a currentRate different from the old rate
 */
export function repeatBillLines({ bill, party, itemMap, jarMap }) {
  const lines = [];
  const skipped = [];
  let changedRates = 0;
  for (const l of bill?.lines || []) {
    const item = itemMap?.[l.itemId];
    if (!item || item.active === false) { skipped.push(l.itemName || l.itemId || '?'); continue; }
    const currentRate = rateFor(party, item, jarMap);
    if (currentRate && currentRate !== l.rate) changedRates += 1;
    lines.push({ itemId: l.itemId, qty: l.qty, rate: l.rate, jarGiven: l.jarGiven !== false, currentRate });
  }
  return { lines, skipped, changedRates };
}

/** Short Hinglish description of the bill used in the banner on the new bill form. */
export function repeatLabel(bill) {
  if (!bill) return '';
  const d = bill.dateKey ? bill.dateKey.split('-').reverse().join('/') : '';
  return `${bill.billNo ? `Bill ${bill.billNo}` : 'Bill'}${d ? `, ${d}` : ''}`;
}
