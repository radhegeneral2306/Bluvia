import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { listTxns, softDeleteTxn } from '../data/api.js';
import { Page, Tabs, Spinner, Empty, useToast } from '../components/ui.jsx';
import TxnRow, { EditLink } from '../components/TxnRow.jsx';
import ShareBillModal from '../components/ShareBillModal.jsx';
import { describeTxn } from '../lib/describe.js';

export default function Bills() {
  const { jarName, money } = useStore();
  const toast = useToast();
  const [type, setType] = useState('bill');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(null);

  const load = useCallback(async (more, c) => {
    setLoading(true);
    try {
      const r = await listTxns({ type, from: from || null, to: to || null, after: more ? c : null });
      setItems((p) => (more ? [...p, ...r.items] : r.items)); setCursor(r.last); setHasMore(r.hasMore);
    } catch (e) { toast(`Load nahi hua: ${e.message}`, 'err', 6000); } finally { setLoading(false); }
  }, [type, from, to, toast]);
  useEffect(() => { load(false); }, [load]);

  async function del(t) {
    if (!window.confirm('Delete karna hai?')) return;
    await softDeleteTxn(t); setItems((p) => p.filter((x) => x.id !== t.id)); toast('Delete ho gaya');
  }
  const rows = items.map((t) => ({ t, d: describeTxn(t, { jarName, money }) }));
  const actions = (row) => (
    <>
      {row.t.type === 'bill' && <button className="btn btn-sm" onClick={() => setShare(row.t)}>📤 Share</button>}
      <EditLink t={row.t} />
      <button className="btn btn-sm !text-red-600" onClick={() => del(row.t)}>🗑</button>
    </>
  );

  return (
    <Page title="Bills & Receipts" actions={<Link to="/bill/new" className="btn btn-primary btn-sm">+ Bill</Link>}>
      <Tabs tabs={[['bill', 'Bills'], ['receipt', 'Receipts']]} value={type} onChange={setType} />
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">From</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label><span className="label">To</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {(from || to) && <button className="btn btn-sm" onClick={() => { setFrom(''); setTo(''); }}>Filter hatao</button>}
      {loading && !items.length ? <Spinner /> : !rows.length ? <Empty>Kuch nahi mila</Empty> : (
        <div className="space-y-2">{rows.map((r) => <TxnRow key={r.t.id} row={r} money={money} showParty actions={actions} />)}</div>
      )}
      {hasMore && <button className="btn w-full" disabled={loading} onClick={() => load(true, cursor)}>{loading ? 'Loading…' : 'Load more'}</button>}
      <ShareBillModal bill={share} onClose={() => setShare(null)} />
    </Page>
  );
}
