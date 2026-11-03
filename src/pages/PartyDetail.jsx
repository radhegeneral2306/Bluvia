import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { listTxns, softDeleteTxn } from '../data/api.js';
import { Page, Tabs, Spinner, Empty, Modal, useToast } from '../components/ui.jsx';
import TxnRow, { EditLink } from '../components/TxnRow.jsx';
import ShareBillModal from '../components/ShareBillModal.jsx';
import { describeTxn } from '../lib/describe.js';
import { buildStatementPdf } from '../lib/pdf.js';
import { sharePdf, statementText, waLink, shareText } from '../lib/share.js';

export default function PartyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { partyMap, jarTypes, jarName, money, settings } = useStore();
  const party = partyMap[id];
  const [tab, setTab] = useState('ledger');
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareBill, setShareBill] = useState(null);
  const [stmtOpen, setStmtOpen] = useState(false);

  const load = useCallback(async (more) => {
    setLoading(true);
    try {
      const r = await listTxns({ partyId: id, after: more ? cursor : null });
      setEntries((prev) => (more ? [...prev, ...r.items] : r.items));
      setCursor(r.last); setHasMore(r.hasMore);
    } catch (e) { toast(`Ledger load nahi hua: ${e.message}`, 'err', 6000); } finally { setLoading(false); }
  }, [id, cursor, toast]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [id]);

  const rows = useMemo(() => {
    let bal = party?.outstanding || 0;
    return entries.map((t) => {
      const d = describeTxn(t, { jarName, money });
      const r = { t, d, balance: bal };
      bal -= d.outstanding;
      return r;
    });
  }, [entries, party, jarName, money]);

  if (!party) return <Page title="Party" back="/parties"><Empty>Party nahi mili</Empty></Page>;

  async function del(t) {
    if (!window.confirm('Is entry ko delete karna hai? (Balance wapas theek ho jayega, "Deleted entries" mein restore ho sakti hai)')) return;
    try {
      await softDeleteTxn(t);
      setEntries((p) => p.filter((x) => x.id !== t.id));
      toast('Delete ho gaya');
    } catch (e) { toast(e.message, 'err'); }
  }

  const actions = (row) => (
    <>
      {row.t.type === 'bill' && <button className="btn btn-sm" onClick={() => setShareBill(row.t)}>📤 Share</button>}
      <EditLink t={row.t} />
      <button className="btn btn-sm !text-red-600" onClick={() => del(row.t)}>🗑 Delete</button>
    </>
  );

  const jarRows = rows.filter((r) => Object.keys(r.d.jars).length);
  const depRows = rows.filter((r) => r.d.deposit !== 0);
  const shown = tab === 'ledger' ? rows : tab === 'jars' ? jarRows : depRows;
  const jarBal = party.jarBalance || {};
  const totalJars = Object.values(jarBal).reduce((a, b) => a + b, 0);
  const q = (path) => `${path}?party=${id}`;

  async function stmtPdf() {
    const doc = await buildStatementPdf({ party, rows, settings, jarName });
    const r = await sharePdf(doc, `statement-${party.name}.pdf`, `Statement ${party.name}`);
    if (r === 'downloaded') toast('PDF download ho gaya');
  }
  const stmt = statementText({ party, rows, settings, jarName, money });

  return (
    <Page title={party.name} back="/parties" actions={<Link to={`/party/${id}/edit`} className="btn btn-sm">Edit</Link>}>
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-slate-500">Baaki</div><div className={`font-bold text-lg ${(party.outstanding || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(party.outstanding || 0)}</div></div>
          <div><div className="text-xs text-slate-500">Jars</div><div className="font-bold text-lg">{totalJars}</div></div>
          <div><div className="text-xs text-slate-500">Deposit</div><div className="font-bold text-lg">{money(party.depositBalance || 0)}</div></div>
        </div>
        {totalJars !== 0 && <div className="text-xs text-slate-500 text-center mt-2">{jarTypes.filter((j) => jarBal[j.id]).map((j) => `${jarBal[j.id]} × ${j.name}`).join(' • ')}</div>}
        <div className="text-xs text-slate-500 text-center mt-1">{party.phone}{party.address ? ` • ${party.address}` : ''}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Link to={q('/bill/new')} className="btn btn-primary !px-1 text-xs">🧾 Bill</Link>
        <Link to={q('/entry/new/receipt')} className="btn !px-1 text-xs">💵 Receipt</Link>
        <Link to={q('/entry/new/jar')} className="btn !px-1 text-xs">🫙 Jar</Link>
        <Link to={q('/entry/new/deposit')} className="btn !px-1 text-xs">🏦 Deposit</Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn btn-sm" onClick={() => setStmtOpen(true)}>📤 Statement</button>
        <a className={`btn btn-sm ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} href={`tel:${party.phone}`}>📞 Call</a>
        <a className={`btn btn-sm ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer" href={waLink(party.phone, '', settings.countryCode)}>💬 WhatsApp</a>
      </div>

      <Tabs tabs={[['ledger', 'Ledger'], ['jars', 'Jars'], ['deposit', 'Deposit']]} value={tab} onChange={setTab} />
      {tab === 'jars' && (
        <div className="card p-3 text-sm space-y-1">
          {jarTypes.map((j) => <div key={j.id} className="flex justify-between"><span>{j.name}</span><b className={(jarBal[j.id] || 0) < 0 ? 'text-red-600' : ''}>{jarBal[j.id] || 0}</b></div>)}
        </div>
      )}
      {tab === 'deposit' && <div className="card p-3 text-sm flex justify-between"><span>Deposit abhi hamare paas</span><b>{money(party.depositBalance || 0)}</b></div>}

      {loading && !entries.length ? <Spinner /> : !shown.length ? <Empty>{tab === 'ledger' ? 'Abhi koi entry nahi' : 'Loaded entries mein kuch nahi mila (Load more try karo)'}</Empty> : (
        <div className="space-y-2">{shown.map((r) => <TxnRow key={r.t.id} row={r} money={money} actions={actions} />)}</div>
      )}
      {hasMore && <button className="btn w-full" disabled={loading} onClick={() => load(true)}>{loading ? 'Loading…' : 'Load more'}</button>}
      <div className="text-center"><Link className="text-xs text-slate-500 underline" to={q('/entry/new/adjustment')}>Manual adjustment entry</Link></div>

      <ShareBillModal bill={shareBill} onClose={() => setShareBill(null)} />
      <Modal open={stmtOpen} onClose={() => setStmtOpen(false)} title="Statement share">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Statement mein wahi entries aayengi jo screen par loaded hain ({rows.length}). Zyada ke liye pehle "Load more" dabao.</p>
          <button className="btn btn-primary w-full" onClick={stmtPdf}>📄 PDF share / download</button>
          <a className={`btn w-full ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer" href={waLink(party.phone, stmt, settings.countryCode)}>💬 WhatsApp text</a>
          <button className="btn w-full" onClick={async () => { const r = await shareText(stmt, 'Statement'); if (r === 'copied') toast('Text copy ho gaya'); }}>Text share / copy</button>
        </div>
      </Modal>
    </Page>
  );
}
