import { effectOf, TYPE_LABELS } from './ledger.js';
import { fmtDate } from './dates.js';

/** Human text for one ledger row. */
export function describeTxn(t, { jarName, money }) {
  const e = effectOf(t);
  let detail = '';
  switch (t.type) {
    case 'bill':
      detail = (t.lines || []).map((l) => `${l.qty}×${l.itemName}`).join(', ');
      break;
    case 'receipt': detail = [t.mode, t.reference].filter(Boolean).join(' • '); break;
    case 'jarReturn': case 'jarGiven': detail = `${t.qty} × ${jarName(t.jarTypeId)}`; break;
    case 'depositTaken': case 'depositRefund': case 'depositAdjust':
      detail = `${money(t.amount || 0)}${t.jarTypeId ? ` • ${jarName(t.jarTypeId)}` : ''}`; break;
    default: detail = '';
  }
  const title = t.type === 'bill' ? `Bill ${t.billNo || ''}` : TYPE_LABELS[t.type] || t.type;
  return { title, detail, note: t.note || '', dateText: fmtDate(t.dateKey), outstanding: e.outstanding, deposit: e.deposit, jars: e.jars };
}
