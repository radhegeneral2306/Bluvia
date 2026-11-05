import { Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { byLine, canModifyTxn, editMinutesLeft } from '../lib/roles.js';
import { Receipt, HandCoins, ArrowUUpLeft, ArrowUDownRight, Bank, ArrowFatLinesDown, ArrowsLeftRight, SlidersHorizontal, PencilSimple } from '@phosphor-icons/react';

export const editPath = (t) => (t.type === 'bill' ? `/bill/${t.id}/edit` : `/entry/${t.id}/edit`);

const ICONS = {
  bill: [Receipt, 'bg-brand-100 text-brand-700'],
  receipt: [HandCoins, 'bg-emerald-100 text-emerald-700'],
  jarReturn: [ArrowUUpLeft, 'bg-slate-100 text-slate-700'],
  jarGiven: [ArrowUDownRight, 'bg-slate-100 text-slate-700'],
  depositTaken: [Bank, 'bg-amber-100 text-amber-800'],
  depositRefund: [ArrowFatLinesDown, 'bg-amber-100 text-amber-800'],
  depositAdjust: [ArrowsLeftRight, 'bg-amber-100 text-amber-800'],
  adjustment: [SlidersHorizontal, 'bg-slate-100 text-slate-700'],
};

const STD_MODES = { cash: 'cash', upi: 'upi', bank: 'bank' };

/** Translate the English text built by describeTxn (kept English for tests) at render time. */
function localize(t, d, tr) {
  let { title, detail, note } = d;
  if (t.type === 'bill') title = tr('txn.billNo', { no: t.billNo || '' }).trim();
  else if (ICONS[t.type]) title = tr(`txn.type.${t.type}`);
  if (t.type === 'receipt' && t.mode && STD_MODES[String(t.mode).trim().toLowerCase()] && detail.startsWith(t.mode)) {
    detail = tr(`txn.mode.${STD_MODES[String(t.mode).trim().toLowerCase()]}`) + detail.slice(t.mode.length);
  }
  const m = /^With bill (.+)$/.exec(note || '');
  if (m) note = tr('txn.withBill', { no: m[1] });
  return { ...d, title, detail, note };
}

/** One entry in a list. `row` = {t, d, balance?}. */
export default function TxnRow({ row, money, showParty, actions }) {
  const { t, d: d0 } = row;
  const { profile, user, isAdmin } = useStore();
  const { t: tr } = useT();
  const d = localize(t, d0, tr);
  const by = byLine(t);
  const left = !isAdmin && canModifyTxn(profile, user?.uid, t) ? editMinutesLeft(profile, t) : null;
  const amt = d.outstanding;
  const [Icon, tone] = ICONS[t.type] || ICONS.adjustment;
  return (
    <div className="card p-3 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${tone}`}><Icon size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap"><span className="font-semibold">{d.title}</span><span className="text-xs text-slate-500 num">{d.dateText}</span></div>
          {showParty && <div className="text-sm font-medium text-slate-700 truncate">{t.partyName}</div>}
          {d.detail && <div className="text-sm text-slate-600 break-words">{d.detail}</div>}
          {d.note && <div className="text-xs text-slate-500 italic break-words">{d.note}</div>}
          {(by || t.verified === false || left !== null) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {by && <span>{tr('txn.by', { name: by })}</span>}
              {t.type === 'receipt' && t.verified === false && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-semibold">{tr('txn.unverified')}</span>}
              {left !== null && <span>{tr('txn.editLeft', { n: left })}</span>}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 max-w-[40%] break-words">
          {amt !== 0 && <div className={`font-semibold num ${amt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{amt > 0 ? '+' : '−'}{money(Math.abs(amt))}</div>}
          {amt === 0 && t.amount > 0 && <div className="font-semibold num text-slate-700">{money(t.amount)}</div>}
          {row.balance !== undefined && <div className="text-xs text-slate-500 num">{tr('txn.bal', { amt: money(row.balance) })}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 mt-2 justify-end">{actions(row)}</div>}
    </div>
  );
}

export function EditLink({ t }) {
  const { t: tr } = useT();
  return <Link to={editPath(t)} className="btn btn-sm"><PencilSimple size={18} />{tr('common.edit')}</Link>;
}
