import { useMemo, useState } from 'react';
import { useStore } from '../data/store.jsx';
import { CaretDown } from '@phosphor-icons/react';
import { Modal, Avatar } from './ui.jsx';

export default function PartyPicker({ value, onChange, disabled }) {
  const { parties, partyMap, money } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return parties.filter((p) => p.active !== false && (!s || p.name.toLowerCase().includes(s) || (p.phone || '').includes(s))).slice(0, 60);
  }, [parties, q]);
  const cur = partyMap[value];
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="input text-left flex items-center justify-between disabled:bg-slate-100">
        <span className={cur ? '' : 'text-slate-400'}>{cur ? cur.name : 'Party chuno'}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {cur && <span className="num">Due {money(cur.outstanding || 0)}</span>}
          <CaretDown size={16} />
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Party chuno">
        <input className="input mb-3" autoFocus placeholder="Naam ya phone se search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-1">
          {list.map((p) => (
            <button key={p.id} className="w-full text-left rounded-xl px-3 py-2.5 min-h-[56px] active:bg-slate-100 border border-slate-100 flex items-center gap-3"
              onClick={() => { onChange(p.id); setOpen(false); setQ(''); }}>
              <Avatar name={p.name} className="!w-9 !h-9" /><span className="font-medium flex-1 truncate">{p.name}</span><span className="text-sm text-slate-500 num">{money(p.outstanding || 0)}</span>
            </button>
          ))}
          {!list.length && <p className="text-sm text-slate-500 text-center py-4">Koi party nahi mili</p>}
        </div>
      </Modal>
    </>
  );
}
