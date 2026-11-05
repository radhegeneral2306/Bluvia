import { useCallback, useEffect, useState } from 'react';
import { Plus, PencilSimple, Prohibit, LockOpen, UsersThree, Info, ShieldCheck } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { listStaff, addStaff, renameStaff, setStaffActive } from '../data/staffApi.js';
import { Page, Field, Modal, StickyBar, Empty, Spinner, Avatar, Badge, useToast } from '../components/ui.jsx';
import { validateStaff, staffRows, shortUid, normalizeName, NAME_MAX } from '../lib/staffForm.js';

const pad2 = (n) => String(n).padStart(2, '0');
function fmtDate(ts) {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function Staff() {
  const { user, isAdmin } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', uid: '' });
  const [errs, setErrs] = useState({});
  const [rename, setRename] = useState(null); // { id, name }
  const [renameErr, setRenameErr] = useState('');
  const [confirm, setConfirm] = useState(null); // row to block

  const load = useCallback(async () => {
    setLoadErr('');
    try { setRows(staffRows(await listStaff())); } catch (e) { setLoadErr(e.message || 'Staff list nahi khuli.'); setRows([]); }
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) return <Page title="Staff" back="/more"><Empty icon={ShieldCheck} title="Sirf owner ke liye">Yeh screen sirf owner dekh sakta hai.</Empty></Page>;

  const isSelf = (r) => r.id === user?.uid || r.role === 'admin';

  function openAdd() { setForm({ name: '', uid: '' }); setErrs({}); setAddOpen(true); }
  async function submitAdd() {
    const v = validateStaff(form);
    setErrs(v.errors);
    if (!v.ok) { toast('Details sahi karo', 'err'); return; }
    if (v.value.uid === user?.uid) { setErrs({ uid: 'Yeh aapka apna UID hai. Staff ka UID daalo.' }); return; }
    setBusy(true);
    try {
      await addStaff(v.value);
      toast('Staff jud gaya');
      setAddOpen(false);
      await load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  async function submitRename() {
    const n = normalizeName(rename.name);
    if (!n) { setRenameErr('Naam likho.'); return; }
    if (n.length > NAME_MAX) { setRenameErr(`Naam ${NAME_MAX} akshar se chhota rakho.`); return; }
    setBusy(true);
    try {
      await renameStaff(rename.id, n);
      toast('Naam badal gaya');
      setRename(null);
      await load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  async function toggle(r, active) {
    if (!active && isSelf(r)) { toast('Owner ka apna account block nahi ho sakta', 'err'); return; }
    setBusy(true);
    try {
      await setStaffActive(r.id, active);
      toast(active ? `${r.name} unblock ho gaya` : `${r.name} block ho gaya`);
      setConfirm(null);
      await load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <Page title="Staff" back="/more">
      <div className="card p-4 flex gap-3 bg-brand-50 border-brand-100">
        <Info size={22} className="shrink-0 text-brand-700 mt-0.5" />
        <div className="text-sm text-slate-700 space-y-1.5 min-w-0">
          <p>Pehle Firebase console mein staff ka login (email + password) banao, phir uska UID yahan jodo.</p>
          <p className="text-slate-500">Owner ka apna account block nahi ho sakta.</p>
        </div>
      </div>

      {rows === null ? <Spinner text="Staff list load ho rahi hai" rows={3} /> : (
        <>
          {loadErr && <div className="card p-3 text-sm text-red-700 border-red-200 bg-red-50">{loadErr}</div>}
          {rows.length === 0 && !loadErr ? (
            <Empty icon={UsersThree} title="Abhi koi staff nahi">Niche &quot;Staff jodo&quot; dabao aur pehla staff add karo.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((r) => (
                <li key={r.id} className={`card p-3.5 ${r.active ? '' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} className={r.active ? '' : '!bg-slate-200 !text-slate-500'} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{r.name}</div>
                      <div className="text-xs text-slate-500 num truncate">UID {shortUid(r.id)}{fmtDate(r.createdAt) ? ` | Joda ${fmtDate(r.createdAt)}` : ''}</div>
                    </div>
                    {isSelf(r) ? <Badge tone="blue">Owner</Badge> : <Badge tone={r.active ? 'green' : 'red'}>{r.active ? 'Active' : 'Blocked'}</Badge>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-sm !min-h-[44px] flex-1" disabled={busy} onClick={() => { setRename({ id: r.id, name: r.name === 'Bina naam' ? '' : r.name }); setRenameErr(''); }}>
                      <PencilSimple size={18} /> Rename
                    </button>
                    {isSelf(r) ? null : r.active ? (
                      <button className="btn btn-sm !min-h-[44px] flex-1 !text-red-700 !border-red-200" disabled={busy} onClick={() => setConfirm(r)}>
                        <Prohibit size={18} /> Block
                      </button>
                    ) : (
                      <button className="btn btn-sm !min-h-[44px] flex-1" disabled={busy} onClick={() => toggle(r, true)}>
                        <LockOpen size={18} /> Unblock
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <StickyBar>
        <button className="btn btn-primary flex-1" onClick={openAdd}><Plus size={20} weight="bold" /> Staff jodo</button>
      </StickyBar>

      <Modal open={addOpen} onClose={() => !busy && setAddOpen(false)} title="Staff jodo">
        <div className="space-y-4">
          <Field label="Naam">
            <input className="input" value={form.name} maxLength={NAME_MAX + 20} autoComplete="off" onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jaise Ramesh" />
            {errs.name && <span className="block text-sm text-red-700 mt-1.5">{errs.name}</span>}
          </Field>
          <Field label="UID" hint="UID Firebase console, Authentication, Users mein milta hai">
            <input className="input num" value={form.uid} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setForm({ ...form, uid: e.target.value })} placeholder="Poora UID paste karo" />
            {errs.uid && <span className="block text-sm text-red-700 mt-1.5">{errs.uid}</span>}
          </Field>
          <div className="flex gap-3">
            <button className="btn flex-1" disabled={busy} onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary flex-1" disabled={busy} onClick={submitAdd}>{busy ? 'Ruko...' : 'Jodo'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rename} onClose={() => !busy && setRename(null)} title="Naam badlo">
        {rename && (
          <div className="space-y-4">
            <Field label="Naam">
              <input className="input" value={rename.name} autoComplete="off" onChange={(e) => setRename({ ...rename, name: e.target.value })} />
              {renameErr && <span className="block text-sm text-red-700 mt-1.5">{renameErr}</span>}
            </Field>
            <div className="flex gap-3">
              <button className="btn flex-1" disabled={busy} onClick={() => setRename(null)}>Cancel</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={submitRename}>Save</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title="Block karna hai?">
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              {confirm.name} ko block karoge to woh apne agle action par logout ho jayega aur kuch bhi dekh nahi payega. Baad mein Unblock se wapas chalu kar sakte ho.
            </p>
            <div className="flex gap-3">
              <button className="btn flex-1" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger flex-1" disabled={busy} onClick={() => toggle(confirm, false)}>Block karo</button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
