import { useEffect, useState, useMemo } from 'react';
import { errText } from '../lib/errors.js';
import { useT } from '../lib/i18n.js';
import { collection, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import { ClockCounterClockwise, SealCheck, ArrowRight } from '@phosphor-icons/react';
import { db } from '../lib/firebase.js';
import { useStore } from '../data/store.jsx';
import { qDocs, withId, verifyReceipt } from '../data/api.js';
import { Page, Spinner, Empty, Badge, Tabs, useToast } from '../components/ui.jsx';
import { fmtDate } from '../lib/dates.js';
import {
  ACTION_TONES, actionLabel, fmtAt, changePairs, entryTitle, entryAmount, peopleOf, filterRows, sortPending,
} from '../lib/auditView.js';

const PAGE = 30;

function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`shrink-0 min-h-[44px] px-3 rounded-full text-sm font-semibold border ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface text-slate-600 border-slate-200'}`}>{children}</button>
  );
}

function ChangesTab() {
  const { money, jarName } = useStore();
  const toast = useToast();
  const { t: tr } = useT();
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [person, setPerson] = useState('');
  const [action, setAction] = useState('');

  async function load(more) {
    setLoading(true); setFailed(false);
    try {
      const parts = [collection(db, 'audit'), orderBy('at', 'desc')];
      if (more && cursor) parts.push(startAfter(cursor));
      parts.push(limit(PAGE));
      const snap = await qDocs(query(...parts));
      const items = snap.docs.map(withId);
      setRows((p) => (more ? [...p, ...items] : items));
      setCursor(snap.docs[snap.docs.length - 1] || cursor);
      setHasMore(snap.docs.length === PAGE);
    } catch (e) { setFailed(true); toast(errText(e, tr), 'err'); } finally { setLoading(false); }
  }
  useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  const people = useMemo(() => peopleOf(rows), [rows]);
  const shown = useMemo(() => filterRows(rows, { person, action }), [rows, person, action]);
  const opts = { money, jarName };

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            <Chip on={!person} onClick={() => setPerson('')}>Sab log</Chip>
            {people.map((p) => <Chip key={p.name} on={person === p.name} onClick={() => setPerson(person === p.name ? '' : p.name)}>{p.name} ({p.count})</Chip>)}
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            {[['', 'Sab'], ['edit', 'Edit'], ['delete', 'Delete'], ['restore', 'Restore']].map(([k, l]) => <Chip key={k} on={action === k} onClick={() => setAction(k)}>{l}</Chip>)}
          </div>
        </div>
      )}
      {loading && !rows.length ? <Spinner /> : failed && !rows.length ? (
        <Empty icon={ClockCounterClockwise} title="Changes load nahi hue" action={<button className="btn btn-primary" onClick={() => load(false)}>Dobara try karo</button>}>Internet check karke dobara try karo.</Empty>
      ) : !rows.length ? (
        <Empty icon={ClockCounterClockwise} title="Abhi koi change nahi">Edit, delete ya restore hone par yahan record dikhega.</Empty>
      ) : !shown.length ? (
        <p className="text-sm text-slate-500 text-center py-6">Is filter mein koi change nahi mila{hasMore ? '. Aur dikhao dabake purane dekho.' : '.'}</p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const pairs = changePairs(r, opts);
            const amt = entryAmount(r);
            return (
              <div key={r.id} className="card p-3 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge tone={ACTION_TONES[r.action] || 'slate'}>{actionLabel(r.action)}</Badge>
                    <span className="text-sm font-semibold truncate">{r.by?.name || 'Unknown'}</span>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{fmtAt(r.at) || 'Abhi'}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm text-slate-700 break-words min-w-0">{entryTitle(r) || 'Entry'}</div>
                  {amt !== null && <div className="text-sm font-semibold shrink-0">{money(amt)}</div>}
                </div>
                {pairs.length > 0 && (
                  <ul className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-1.5">
                    {pairs.map((p) => (
                      <li key={p.key} className="flex flex-wrap items-center gap-x-1.5 break-words">
                        <span className="font-semibold">{p.label}:</span>
                        <span className="text-slate-500 break-all">{p.from}</span>
                        <ArrowRight size={12} className="shrink-0" />
                        <span className="text-slate-900 break-all">{p.to}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      {hasMore && <button className="btn w-full min-h-[44px]" disabled={loading} onClick={() => load(true)}>{loading ? 'Loading' : 'Aur dikhao'}</button>}
    </div>
  );
}

function VerifyTab({ onCount }) {
  const { money } = useStore();
  const toast = useToast();
  const { t: tr } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState('');

  async function load() {
    setLoading(true); setFailed(false);
    try {
      const snap = await qDocs(query(collection(db, 'transactions'), where('type', '==', 'receipt'), where('verified', '==', false), where('deleted', '==', false)));
      setItems(sortPending(snap.docs.map(withId), 100));
    } catch (e) { setFailed(true); toast(errText(e, tr), 'err'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { onCount(loading || failed ? null : items.length); }, [items, loading, failed]); // eslint-disable-line

  async function one(t) {
    setBusy(t.id);
    try {
      await verifyReceipt(t);
      setItems((p) => p.filter((x) => x.id !== t.id));
      toast('Verify ho gayi');
    } catch (e) { toast(errText(e, tr), 'err'); } finally { setBusy(''); }
  }
  async function all() {
    if (!items.length || !window.confirm(`Bank statement se check kar liya? Yeh ${items.length} receipts verify ho jayengi.`)) return;
    setBusy('all');
    let done = 0;
    try {
      for (const t of [...items]) {
        await verifyReceipt(t);
        done += 1;
        setItems((p) => p.filter((x) => x.id !== t.id));
      }
      toast(`${done} receipts verify ho gayi`);
    } catch (e) { toast(tr('err.verifyStopped', { done, msg: errText(e, tr) }), 'err'); } finally { setBusy(''); }
  }

  if (loading && !items.length) return <Spinner />;
  if (failed && !items.length) return <Empty icon={SealCheck} title="Receipts load nahi hui" action={<button className="btn btn-primary" onClick={load}>Dobara try karo</button>}>Internet check karke dobara try karo.</Empty>;
  if (!items.length) return <Empty icon={SealCheck} title="Sab receipts verify ho chuki hain">Staff ki nayi receipts yahan aayengi.</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Staff ki entry ki hui receipts. Bank statement se match karke verify karo.</p>
      <button className="btn btn-primary w-full min-h-[44px]" disabled={!!busy} onClick={all}><SealCheck size={18} />{busy === 'all' ? 'Verify ho rahi hain' : `Sab verify karo (${items.length})`}</button>
      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="card p-3 space-y-2 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words">{t.partyName || 'Party'}</div>
                <div className="text-xs text-slate-500 break-words">
                  {[fmtDate(t.dateKey), t.mode, t.reference && `Ref ${t.reference}`, t.createdBy?.name && `Entry: ${t.createdBy.name}`].filter(Boolean).join(' | ')}
                </div>
              </div>
              <div className="text-base font-bold shrink-0">{money(t.amount || 0)}</div>
            </div>
            <button className="btn btn-sm w-full min-h-[44px]" disabled={!!busy} onClick={() => one(t)}><SealCheck size={18} />{busy === t.id ? 'Ho raha hai' : 'Verified karo'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Changes() {
  const [tab, setTab] = useState('changes');
  const [count, setCount] = useState(null);
  // The verify tab stays mounted so its count shows on the tab label before it is opened.
  return (
    <Page title="Changes" back="/more">
      <Tabs tabs={[['changes', 'Changes'], ['upi', count ? `UPI verify (${count})` : 'UPI verify']]} value={tab} onChange={setTab} />
      <div hidden={tab !== 'changes'}><ChangesTab /></div>
      <div hidden={tab !== 'upi'}><VerifyTab onCount={setCount} /></div>
    </Page>
  );
}
