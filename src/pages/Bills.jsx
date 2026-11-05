import { useCallback, useEffect, useState } from 'react';
import { errText } from '../lib/errors.js';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ShareNetwork, Trash, Receipt, FunnelSimple, ArrowsClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { listTxns, softDeleteTxn } from '../data/api.js';
import { Page, Tabs, Spinner, Empty, useToast } from '../components/ui.jsx';
import TxnRow, { EditLink } from '../components/TxnRow.jsx';
import ShareBillModal from '../components/ShareBillModal.jsx';
import { describeTxn } from '../lib/describe.js';
import { canModifyTxn } from '../lib/roles.js';
import { askLinkedDelete } from '../lib/linkedDelete.js';
import { useT } from '../lib/i18n.js';

export default function Bills() {
  const { jarName, money, profile, user } = useStore();
  const toast = useToast();
  const { t: tr } = useT();
  const nav = useNavigate();
  const [type, setType] = useState('bill');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dFrom, setDFrom] = useState('');
  const [dTo, setDTo] = useState('');
  const rangeErr = dFrom && dTo && dFrom > dTo ? tr('bills.rangeErr') : '';
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
    } catch (e) { toast(tr('bills.loadFail', { msg: errText(e, tr) }), 'err', 6000); } finally { setLoading(false); }
  }, [type, from, to, toast, tr]);
  useEffect(() => { load(false); }, [load]);

  async function del(t) {
    if (!window.confirm(tr('bills.confirmDelete'))) return;
    try {
      const { withLinked, linked } = await askLinkedDelete(t);
      await softDeleteTxn(t, { withLinked });
      const gone = new Set([t.id, ...linked.map((l) => l.id)]);
      setItems((p) => p.filter((x) => !gone.has(x.id)));
      toast(withLinked ? tr('bills.deletedLinked') : tr('bills.deleted'));
    } catch (e) { toast(errText(e, tr), 'err'); }
  }
  const rows = items.map((t) => ({ t, d: describeTxn(t, { jarName, money }) }));
  const actions = (row) => (
    <>
      {row.t.type === 'bill' && <button className="btn btn-sm" onClick={() => setShare(row.t)}><ShareNetwork size={18} />{tr('bills.share')}</button>}
      {row.t.type === 'bill' && (
        <button className="btn btn-sm !min-h-[44px] !min-w-[44px]" aria-label={tr('bills.repeatAria')} onClick={() => nav(`/bill/new?party=${row.t.partyId}&repeat=${row.t.id}`)}>
          <ArrowsClockwise size={18} /><span className="hidden min-[400px]:inline">{tr('bills.repeat')}</span>
        </button>
      )}
      {canModifyTxn(profile, user?.uid, row.t) && <EditLink t={row.t} />}
      {canModifyTxn(profile, user?.uid, row.t) && <button className="btn btn-sm !text-red-600" aria-label={tr('common.delete')} onClick={() => del(row.t)}><Trash size={18} /></button>}
    </>
  );

  return (
    <Page title={tr('bills.title')} actions={<Link to="/bill/new" className="btn btn-primary btn-sm"><Plus size={18} weight="bold" />{tr('bills.billBtn')}</Link>}>
      <Tabs tabs={[['bill', tr('bills.tabBills')], ['receipt', tr('bills.tabReceipts')]]} value={type} onChange={setType} />
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-3">
        <label className="min-w-0"><span className="label">{tr('bills.from')}</span><input type="date" className="input num" value={dFrom} onChange={(e) => setDFrom(e.target.value)} aria-invalid={!!rangeErr} /></label>
        <label className="min-w-0"><span className="label">{tr('bills.to')}</span><input type="date" className="input num" value={dTo} onChange={(e) => setDTo(e.target.value)} aria-invalid={!!rangeErr} /></label>
      </div>
      {rangeErr && <p className="text-sm text-red-600" role="alert">{rangeErr}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" disabled={!!rangeErr || (dFrom === from && dTo === to)} onClick={() => { setFrom(dFrom); setTo(dTo); }}><FunnelSimple size={18} />{tr('bills.applyFilter')}</button>
        {(from || to || dFrom || dTo) && <button className="btn btn-sm" onClick={() => { setFrom(''); setTo(''); setDFrom(''); setDTo(''); }}>{tr('bills.clearFilter')}</button>}
      </div>
      {loading && !items.length ? <Spinner /> : !rows.length ? <Empty icon={Receipt} title={type === 'bill' ? tr('bills.noBill') : tr('bills.noReceipt')} action={type === 'bill' ? <Link to="/bill/new" className="btn btn-primary btn-sm mt-2"><Plus size={18} weight="bold" />{tr('bills.newBill')}</Link> : null}>{tr('bills.emptyHint')}</Empty> : (
        <div className="space-y-2">{rows.map((r) => <TxnRow key={r.t.id} row={r} money={money} showParty actions={actions} />)}</div>
      )}
      {hasMore && <button className="btn w-full" disabled={loading} onClick={() => load(true, cursor)}>{loading ? tr('bills.loading') : tr('bills.loadMore')}</button>}
      <ShareBillModal bill={share} onClose={() => setShare(null)} />
    </Page>
  );
}
