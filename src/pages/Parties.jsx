import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MagnifyingGlass, UsersThree } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page, Empty, Badge, Avatar } from '../components/ui.jsx';

export default function Parties() {
  const { parties, money, jarTypes } = useStore();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return parties.filter((p) => (showInactive || p.active !== false) && (!s || p.name.toLowerCase().includes(s) || (p.phone || '').includes(s)));
  }, [parties, q, showInactive]);

  const jarText = (p) => jarTypes.map((j) => [j.name, (p.jarBalance || {})[j.id] || 0]).filter(([, n]) => n).map(([n, c]) => `${c}×${n}`).join(', ');

  return (
    <Page title="Parties" actions={<Link to="/party/new" className="btn btn-primary btn-sm"><Plus size={18} weight="bold" />Add</Link>} narrow={false}>
      <div className="relative">
        <MagnifyingGlass size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input className="input !pl-11" placeholder="Naam ya phone se search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Party search" />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600 min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive bhi dikhao</label>
      {!list.length && (
        <Empty icon={UsersThree} title={parties.length ? 'Koi party nahi mili' : 'Abhi koi party nahi hai'}
          action={!parties.length && <Link to="/party/new" className="btn btn-primary btn-sm">Pehli party add karo</Link>}>
          {parties.length ? 'Dusra naam ya phone try karo.' : 'Party add karke bill banana shuru karo.'}
        </Empty>
      )}
      <div className="grid gap-2 lg:grid-cols-2">
        {list.map((p) => (
          <Link key={p.id} to={`/party/${p.id}`} className="card p-3 flex items-center gap-3 min-h-[68px] active:bg-slate-100 transition-colors">
            <Avatar name={p.name} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{p.name} {p.active === false && <Badge tone="amber">Inactive</Badge>}</div>
              <div className="text-xs text-slate-500 truncate">{p.phone || 'No phone'}{jarText(p) ? `, Jars: ${jarText(p)}` : ''}</div>
            </div>
            <div className="text-right">
              <div className={`font-semibold num ${(p.outstanding || 0) > 0 ? 'text-red-600' : (p.outstanding || 0) < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{money(p.outstanding || 0)}</div>
              {!!p.depositBalance && <div className="text-xs text-slate-500 num">Dep {money(p.depositBalance)}</div>}
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
