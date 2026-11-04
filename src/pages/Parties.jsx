import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MagnifyingGlass, UsersThree, MapTrifold } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page, Empty, Badge, Avatar } from '../components/ui.jsx';
import { dueView } from '../lib/advance.js';
import AreaFilter from '../components/AreaFilter.jsx';
import { areaOf, filterByArea, partyMatches, ALL_AREAS, NO_AREA } from '../lib/areas.js';

export default function Parties() {
  const { parties, money, jarTypes } = useStore();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [area, setArea] = useState(ALL_AREAS);
  const list = useMemo(
    () => filterByArea(parties, area).filter((p) => (showInactive || p.active !== false) && partyMatches(p, q)),
    [parties, q, showInactive, area],
  );
  const areaLabel = area === NO_AREA ? 'Bina area' : area;

  const jarText = (p) => jarTypes.map((j) => [j.name, (p.jarBalance || {})[j.id] || 0]).filter(([, n]) => n).map(([n, c]) => `${c}×${n}`).join(', ');

  return (
    <Page title="Parties" actions={(
      <div className="flex items-center gap-2">
        <Link to="/map" aria-label="Map dekho" className="btn btn-sm !min-h-[44px] !w-11 !px-0"><MapTrifold size={20} /></Link>
        <Link to="/party/new" className="btn btn-primary btn-sm !min-h-[44px]"><Plus size={18} weight="bold" />Add</Link>
      </div>
    )} narrow={false}>
      <div className="relative">
        <MagnifyingGlass size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input className="input !pl-11" placeholder="Naam, phone ya area se search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Party search" />
      </div>
      <AreaFilter parties={parties} value={area} onChange={setArea} />
      <label className="flex items-center gap-2 text-sm text-slate-600 min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive bhi dikhao</label>
      {!list.length && (
        <Empty icon={UsersThree} title={parties.length ? 'Koi party nahi mili' : 'Abhi koi party nahi hai'}
          action={!parties.length && <Link to="/party/new" className="btn btn-primary btn-sm">Pehli party add karo</Link>}>
          {parties.length ? (area ? `"${areaLabel}" mein koi party nahi mili. Dusra area ya naam try karo.` : 'Dusra naam, phone ya area try karo.') : 'Party add karke bill banana shuru karo.'}
        </Empty>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {list.map((p) => (
          <Link key={p.id} to={`/party/${p.id}`} className="card p-3 flex items-center gap-3 min-h-[68px] min-w-0 active:bg-slate-100 transition-colors">
            <Avatar name={p.name} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{p.name}</div>
              {p.active === false && <div className="mt-0.5"><Badge tone="amber">Inactive</Badge></div>}
              <div className="text-xs text-slate-500 truncate">{areaOf(p) ? `${areaOf(p)}, ` : ''}{p.phone || 'No phone'}{jarText(p) ? `, Jars: ${jarText(p)}` : ''}</div>
            </div>
            <div className="text-right shrink-0 max-w-[45%]">
              <div className={`font-semibold num break-words ${(p.outstanding || 0) === 0 ? 'text-slate-500' : dueView(p.outstanding).tone}`}>{(p.outstanding || 0) < 0 ? `Advance ${money(-p.outstanding)}` : money(p.outstanding || 0)}</div>
              {!!p.depositBalance && <div className="text-xs text-slate-500 num">Dep {money(p.depositBalance)}</div>}
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
