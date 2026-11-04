import { useMemo, useState } from 'react';
import { useStore } from '../data/store.jsx';
import { CaretDown } from '@phosphor-icons/react';
import { Modal, Avatar } from './ui.jsx';
import { dueView } from '../lib/advance.js';
import AreaFilter from './AreaFilter.jsx';
import { areaOf, filterByArea, partyMatches, ALL_AREAS } from '../lib/areas.js';

export default function PartyPicker({ value, onChange, disabled }) {
  const { parties, partyMap, money } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [area, setArea] = useState(ALL_AREAS);
  const list = useMemo(() => {
    return filterByArea(parties, area).filter((p) => p.active !== false && partyMatches(p, q)).slice(0, 60);
  }, [parties, q, area]);
  const cur = partyMap[value];
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="input text-left flex items-center justify-between disabled:bg-slate-100">
        <span className={`min-w-0 truncate ${cur ? '' : 'text-slate-400'}`}>{cur ? cur.name : 'Party chuno'}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500 shrink-0 ml-2">
          {cur && <span className="num">{dueView(cur.outstanding).label} {money(dueView(cur.outstanding).amount)}</span>}
          <CaretDown size={16} />
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Party chuno">
        <div className="mb-3"><AreaFilter parties={parties.filter((p) => p.active !== false)} value={area} onChange={setArea} /></div>
        <input className="input mb-3" placeholder="Naam, phone ya area se search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-1">
          {list.map((p) => (
            <button key={p.id} className="w-full text-left rounded-xl px-3 py-2.5 min-h-[56px] active:bg-slate-100 border border-slate-100 flex items-center gap-3"
              onClick={() => { onChange(p.id); setOpen(false); setQ(''); }}>
              <Avatar name={p.name} className="!w-9 !h-9" /><span className="flex-1 min-w-0"><span className="block font-medium truncate">{p.name}</span>{areaOf(p) && <span className="block text-xs text-slate-500 truncate">{areaOf(p)}</span>}</span><span className={`text-sm num shrink-0 ${(p.outstanding || 0) < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{(p.outstanding || 0) < 0 ? `Advance ${money(-p.outstanding)}` : money(p.outstanding || 0)}</span>
            </button>
          ))}
          {!list.length && <p className="text-sm text-slate-500 text-center py-4">Koi party nahi mili</p>}
        </div>
      </Modal>
    </>
  );
}
