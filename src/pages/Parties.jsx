import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MagnifyingGlass, UsersThree, MapTrifold, Receipt, ArrowsClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page, Empty, Avatar, useToast } from '../components/ui.jsx';
import { dueView } from '../lib/advance.js';
import AreaFilter from '../components/AreaFilter.jsx';
import { listTxns } from '../data/api.js';
import { findLastBill } from '../lib/repeatBill.js';
import { jarsShort, sortParties, partyTotals, SORTS } from '../lib/partyRow.js';
import { areaOf, filterByArea, partyMatches, ALL_AREAS, NO_AREA } from '../lib/areas.js';

export default function Parties() {
  const { parties, money, jarTypes, isAdmin } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [area, setArea] = useState(ALL_AREAS);
  const [sort, setSort] = useState('name');
  const [finding, setFinding] = useState('');
  const list = useMemo(
    () => sortParties(filterByArea(parties, area).filter((p) => (showInactive || p.active !== false) && partyMatches(p, q)), sort),
    [parties, q, showInactive, area, sort],
  );
  const totals = useMemo(() => partyTotals(list), [list]);
  const areaLabel = area === NO_AREA ? 'Bina area' : area;

  // Looks up the last bill only when "Repeat" is tapped (no per-row queries).
  async function repeat(p) {
    if (finding) return;
    setFinding(p.id);
    try {
      let cur = null; let more = true; let acc = [];
      for (let i = 0; i < 4 && more && !findLastBill(acc); i += 1) {
        const r = await listTxns({ partyId: p.id, after: cur });
        acc = [...acc, ...r.items]; cur = r.last; more = r.hasMore;
      }
      const found = findLastBill(acc);
      if (found) nav(`/bill/new?party=${p.id}&repeat=${found.id}`);
      else toast('Is party ka abhi koi bill nahi hai.', 'warn');
    } catch (e) { toast(`Bill dhundh nahi paya: ${e.message}`, 'err', 6000); } finally { setFinding(''); }
  }

  return (
    <Page title="Parties" actions={(
      <div className="flex items-center gap-2">
        <Link to="/map" aria-label="Map dekho" className="btn btn-sm !min-h-[44px] !w-11 !px-0"><MapTrifold size={20} /></Link>
        {isAdmin && <Link to="/party/new" className="btn btn-primary btn-sm !min-h-[44px]"><Plus size={18} weight="bold" />Add</Link>}
      </div>
    )} narrow={false}>
      <div className="flex items-center justify-between text-sm text-slate-600 gap-3">
        <span><b className="num">{totals.count}</b> parties</span>
        <span>Total baaki: <b className="num text-red-600">{money(totals.due)}</b></span>
      </div>
      <div className="relative">
        <MagnifyingGlass size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input className="input !pl-11" placeholder="Naam, phone ya area se search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Party search" />
      </div>
      <AreaFilter parties={parties} value={area} onChange={setArea} />
      <div className="flex items-center gap-2 flex-wrap">
        {SORTS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
            className={`min-h-[44px] px-4 rounded-full border text-sm font-medium ${sort === k ? 'bg-brand-50 text-brand-700 border-brand-500' : 'bg-surface text-slate-700 border-slate-200 active:bg-slate-100'}`}>{label}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600 min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive bhi dikhao</label>
      {!list.length && (
        <Empty icon={UsersThree} title={parties.length ? 'Koi party nahi mili' : 'Abhi koi party nahi hai'}
          action={!parties.length && isAdmin && <Link to="/party/new" className="btn btn-primary btn-sm">Pehli party add karo</Link>}>
          {parties.length ? (area ? `"${areaLabel}" mein koi party nahi mili. Dusra area ya naam try karo.` : 'Dusra naam, phone ya area try karo.') : (isAdmin ? 'Party add karke bill banana shuru karo.' : 'Admin se party add karne ko bolo.')}
        </Empty>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {list.map((p) => {
          const o = p.outstanding || 0;
          const jars = jarsShort(p.jarBalance, jarTypes);
          return (
            <div key={p.id} className="card p-3 min-w-0">
              <Link to={`/party/${p.id}`} className="flex items-center gap-3 min-h-[64px] min-w-0 active:bg-slate-100 transition-colors rounded-lg">
                <Avatar name={p.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 truncate">{areaOf(p) || 'Bina area'}{p.active === false ? ', Inactive' : ''}</div>
                  <div className="text-xs text-slate-600 truncate">Jars: {jars || 'koi nahi'}</div>
                </div>
                <div className="text-right shrink-0 max-w-[45%]">
                  <div className={`font-bold text-lg num break-words ${o === 0 ? 'text-slate-500' : dueView(o).tone}`}>{o < 0 ? `Advance ${money(-o)}` : money(o)}</div>
                  {!!p.depositBalance && <div className="text-xs text-slate-500 num">Dep {money(p.depositBalance)}</div>}
                </div>
              </Link>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to={`/bill/new?party=${p.id}`} className="btn btn-primary btn-sm !min-h-[44px]"><Receipt size={18} />Bill</Link>
                <button type="button" className="btn btn-sm !min-h-[44px]" disabled={!!finding} onClick={() => repeat(p)}><ArrowsClockwise size={18} />{finding === p.id ? 'Dhundh raha hai…' : 'Repeat'}</button>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
