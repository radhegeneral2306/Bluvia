import { useEffect, useState } from 'react';
import { useStore } from '../data/store.jsx';
import { listTxns, restoreTxn } from '../data/api.js';
import { Page, Spinner, Empty, useToast } from '../components/ui.jsx';
import TxnRow from '../components/TxnRow.jsx';
import { describeTxn } from '../lib/describe.js';

export default function Deleted() {
  const { jarName, money } = useStore();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(more) {
    setLoading(true);
    try {
      const r = await listTxns({ deleted: true, after: more ? cursor : null });
      setItems((p) => (more ? [...p, ...r.items] : r.items)); setCursor(r.last); setHasMore(r.hasMore);
    } catch (e) { toast(e.message, 'err'); } finally { setLoading(false); }
  }
  useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  async function restore(t) {
    await restoreTxn(t); setItems((p) => p.filter((x) => x.id !== t.id)); toast('Restore ho gaya');
  }
  // describeTxn shows effect of non-deleted version
  const rows = items.map((t) => ({ t, d: describeTxn({ ...t, deleted: false }, { jarName, money }) }));
  return (
    <Page title="Deleted entries" back="/more">
      <p className="text-sm text-slate-600">Yeh entries balance mein nahi ginti. Restore karne par wapas balance mein judengi.</p>
      {loading && !items.length ? <Spinner /> : !rows.length ? <Empty>Koi deleted entry nahi</Empty> : (
        <div className="space-y-2">
          {rows.map((r) => <TxnRow key={r.t.id} row={r} money={money} showParty actions={(row) => <button className="btn btn-sm btn-primary" onClick={() => restore(row.t)}>♻️ Restore</button>} />)}
        </div>
      )}
      {hasMore && <button className="btn w-full" disabled={loading} onClick={() => load(true)}>Load more</button>}
    </Page>
  );
}
