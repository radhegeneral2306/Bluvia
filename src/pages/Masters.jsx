import { useState } from 'react';
import { Plus, PencilSimple, Power, Jar, Package } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { saveMaster } from '../data/api.js';
import { Page, Tabs, Modal, Field, MoneyInput, Badge, Empty, useToast } from '../components/ui.jsx';

export default function Masters() {
  const { jarTypes, items, jarMap, money } = useStore();
  const [tab, setTab] = useState('jar');
  const [edit, setEdit] = useState(null);
  const toast = useToast();

  const blankJar = { name: '', shortCode: '', defaultRate: 0, defaultDeposit: 0, active: true };
  const blankItem = { name: '', unit: 'pcs', defaultRate: 0, jarTypeId: '', active: true };

  async function save() {
    const e = edit.data;
    if (!e.name.trim()) return toast('Naam likho', 'err');
    const coll = tab === 'jar' ? 'jarTypes' : 'items';
    const data = { ...e, name: e.name.trim(), jarTypeId: e.jarTypeId || null };
    if (tab === 'jar') delete data.jarTypeId;
    if (tab === 'jar') delete data.unit;
    await saveMaster(coll, edit.id, data);
    setEdit(null); toast('Save ho gaya');
  }
  async function toggle(coll, row) {
    await saveMaster(coll, row.id, { active: !(row.active !== false) });
  }
  const set = (k, v) => setEdit({ ...edit, data: { ...edit.data, [k]: v } });
  const rows = tab === 'jar' ? jarTypes : items;

  return (
    <Page title="Jar Types & Items" back="/more"
      actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ id: null, data: tab === 'jar' ? blankJar : blankItem })}><Plus size={18} weight="bold" />Add</button>}>
      <Tabs tabs={[['jar', 'Jar Types'], ['item', 'Items']]} value={tab} onChange={setTab} />
      {!rows.length && <Empty icon={tab === 'jar' ? Jar : Package} title="Abhi kuch nahi hai">Upar Add dabakar pehli entry banao.</Empty>}
      {!!rows.length && (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => {
            const inactive = r.active === false;
            const meta = tab === 'jar'
              ? [`Rate ${money(r.defaultRate || 0)}`, `Deposit ${money(r.defaultDeposit || 0)}`, r.shortCode ? `Code ${r.shortCode}` : null]
              : [`Rate ${money(r.defaultRate || 0)}`, r.unit || null, r.jarTypeId ? `Jar: ${jarMap[r.jarTypeId]?.name || '?'}` : null];
            return (
              <div key={r.id} className="flex items-center gap-2 pl-4 pr-2 min-h-[68px] py-2">
                <button className={`flex-1 min-w-0 text-left ${inactive ? 'opacity-60' : ''}`} onClick={() => setEdit({ id: r.id, data: { ...r, jarTypeId: r.jarTypeId || '' } })}>
                  <div className="font-semibold truncate">{r.name} {inactive && <Badge tone="amber">Inactive</Badge>}</div>
                  <div className="text-sm text-slate-500 num">{meta.filter(Boolean).join(', ')}</div>
                </button>
                <button className="btn btn-ghost !w-11 !px-0 rounded-full text-slate-500" aria-label={`${r.name} edit karo`} onClick={() => setEdit({ id: r.id, data: { ...r, jarTypeId: r.jarTypeId || '' } })}><PencilSimple size={20} /></button>
                <button className={`btn btn-sm ${inactive ? 'text-emerald-700' : 'text-slate-600'}`} onClick={() => toggle(tab === 'jar' ? 'jarTypes' : 'items', r)}>
                  <Power size={18} />{inactive ? 'Activate' : 'Deactivate'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500">Delete nahi hota, purani bills/ledger safe rehne ke liye sirf Deactivate hota hai.</p>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit' : 'Add'}>
        {edit && (
          <div className="space-y-3">
            <Field label="Name"><input className="input" value={edit.data.name} onChange={(e) => set('name', e.target.value)} /></Field>
            {tab === 'jar' && (
              <Field label="PDF short code (1-2 letters)" hint="Invoice table mein columns ke liye, jaise N = ND / NR (Normal Delivered / Returned), C = CD / CR.">
                <input className="input" maxLength={3} value={edit.data.shortCode || ''} onChange={(e) => set('shortCode', e.target.value.toUpperCase())} />
              </Field>
            )}
            {tab === 'item' && (
              <>
                <Field label="Unit (jar, pcs, box…)"><input className="input" value={edit.data.unit || ''} onChange={(e) => set('unit', e.target.value)} /></Field>
                <Field label="Is item ka jar type (agar jar wala item hai)">
                  <select className="input" value={edit.data.jarTypeId || ''} onChange={(e) => set('jarTypeId', e.target.value)}>
                    <option value="">Not a jar item</option>
                    {jarTypes.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label={`Default rate (${tab === 'jar' ? 'per jar' : 'per unit'})`}>
              <MoneyInput value={edit.data.defaultRate || 0} onChange={(v) => set('defaultRate', v)} />
            </Field>
            {tab === 'jar' && (
              <Field label="Default deposit (per jar)">
                <MoneyInput value={edit.data.defaultDeposit || 0} onChange={(v) => set('defaultDeposit', v)} />
              </Field>
            )}
            <label className="flex items-center gap-3 min-h-[44px]">
              <input type="checkbox" className="w-5 h-5 accent-brand-600" checked={edit.data.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active
            </label>
            <button className="btn btn-primary w-full" onClick={save}>Save</button>
          </div>
        )}
      </Modal>
    </Page>
  );
}
