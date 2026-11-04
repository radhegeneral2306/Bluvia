import { Link } from 'react-router-dom';
import { Badge } from './ui.jsx';

export const editPath = (t) => (t.type === 'bill' ? `/bill/${t.id}/edit` : `/entry/${t.id}/edit`);

/** One entry in a list. `row` = {t, d, balance?}. */
export default function TxnRow({ row, money, showParty, actions }) {
  const { t, d } = row;
  const amt = d.outstanding;
  const tone = t.type === 'bill' ? 'blue' : t.type === 'receipt' ? 'green' : t.type.startsWith('deposit') ? 'amber' : 'slate';
  return (
    <div className="card p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><Badge tone={tone}>{d.title}</Badge><span className="text-xs text-slate-500">{d.dateText}</span></div>
          {showParty && <div className="font-semibold truncate mt-0.5">{t.partyName}</div>}
          {d.detail && <div className="text-sm text-slate-600 break-words">{d.detail}</div>}
          {d.note && <div className="text-xs text-slate-500 italic">{d.note}</div>}
        </div>
        <div className="text-right shrink-0">
          {amt !== 0 && <div className={`font-bold ${amt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{amt > 0 ? '+' : '−'}{money(Math.abs(amt))}</div>}
          {amt === 0 && t.amount > 0 && <div className="font-bold text-slate-600">{money(t.amount)}</div>}
          {row.balance !== undefined && <div className="text-xs text-slate-500">Bal {money(row.balance)}</div>}
        </div>
      </div>
      {actions && <div className="flex gap-2 mt-2 justify-end">{actions(row)}</div>}
    </div>
  );
}

export function EditLink({ t }) {
  return <Link to={editPath(t)} className="btn btn-sm">✏️ Edit</Link>;
}
