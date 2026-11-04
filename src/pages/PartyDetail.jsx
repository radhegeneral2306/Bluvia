import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { listTxns, softDeleteTxn } from '../data/api.js';
import { askLinkedDelete } from '../lib/linkedDelete.js';
import { dueView } from '../lib/advance.js';
import { Receipt, HandCoins, ArrowUUpLeft, Bank, ShareNetwork, Phone, WhatsappLogo, Trash, ListBullets, FilePdf, ArrowsClockwise, QrCode } from '@phosphor-icons/react';
import { Page, Tabs, Spinner, Empty, Modal, Avatar, useToast } from '../components/ui.jsx';
import TxnRow, { EditLink } from '../components/TxnRow.jsx';
import ShareBillModal from '../components/ShareBillModal.jsx';
import LocationCard from '../components/LocationCard.jsx';
import UpiQrSheet from '../components/UpiQrSheet.jsx';
import { describeTxn } from '../lib/describe.js';
import { findLastBill } from '../lib/repeatBill.js';
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
  const [qrOpen, setQrOpen] = useState(false);
  const [finding, setFinding] = useState(false);

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

  const lastBill = useMemo(() => findLastBill(entries), [entries]);

  if (!party) return <Page title="Party" back="/parties"><Empty>Party nahi mili</Empty></Page>;

  async function del(t) {
    if (!window.confirm('Is entry ko delete karna hai? (Balance wapas theek ho jayega, "Deleted entries" mein restore ho sakti hai)')) return;
    try {
      const { withLinked, linked } = await askLinkedDelete(t);
      await softDeleteTxn(t, { withLinked });
      const gone = new Set([t.id, ...linked.map((l) => l.id)]);
      setEntries((p) => p.filter((x) => !gone.has(x.id)));
      toast(withLinked ? 'Bill aur uski linked entries delete ho gayi' : 'Delete ho gaya');
    } catch (e) { toast(e.message, 'err'); }
  }

  const actions = (row) => (
    <>
      {row.t.type === 'bill' && <button className="btn btn-sm" onClick={() => setShareBill(row.t)}><ShareNetwork size={18} />Share</button>}
      {row.t.type === 'bill' && (
        <button className="btn btn-sm !min-h-[44px] !min-w-[44px]" aria-label="Is bill ko dobara banao" onClick={() => nav(`/bill/new?party=${id}&repeat=${row.t.id}`)}>
          <ArrowsClockwise size={18} /><span className="hidden min-[400px]:inline">Dobara</span>
        </button>
      )}
      <EditLink t={row.t} />
      <button className="btn btn-sm !text-red-600" onClick={() => del(row.t)}><Trash size={18} />Delete</button>
    </>
  );

  const jarRows = rows.filter((r) => Object.keys(r.d.jars).length);
  const depRows = rows.filter((r) => r.d.deposit !== 0);
  const shown = tab === 'ledger' ? rows : tab === 'jars' ? jarRows : depRows;
  const jarBal = party.jarBalance || {};
  const totalJars = Object.values(jarBal).reduce((a, b) => a + b, 0);
  const q = (path) => `${path}?party=${id}`;

  // 'Pichhla bill dobara': uses the newest bill already loaded; if the loaded page has none, looks through a few more pages.
  async function repeatLast() {
    if (lastBill) return nav(`/bill/new?party=${id}&repeat=${lastBill.id}`);
    setFinding(true);
    try {
      let cur = cursor; let more = hasMore; let acc = entries;
      for (let i = 0; i < 4 && more && !findLastBill(acc); i += 1) {
        const r = await listTxns({ partyId: id, after: cur });
        acc = [...acc, ...r.items]; cur = r.last; more = r.hasMore;
      }
      setEntries(acc); setCursor(cur); setHasMore(more);
      const found = findLastBill(acc);
      if (found) nav(`/bill/new?party=${id}&repeat=${found.id}`);
      else toast(more ? 'Pichhle entries mein koi bill nahi mila. Load more karke dekho.' : 'Is party ka abhi koi bill nahi hai.', 'warn');
    } catch (e) { toast(`Bill dhundh nahi paya: ${e.message}`, 'err', 6000); } finally { setFinding(false); }
  }

  async function stmtPdf() {
    const doc = await buildStatementPdf({ party, rows, settings, jarName });
    const r = await sharePdf(doc, `statement-${party.name}.pdf`, `Statement ${party.name}`);
    if (r === 'downloaded') toast('PDF download ho gaya');
  }
  const stmt = statementText({ party, rows, settings, jarName, money });

  return (
    <Page title={party.name} back="/parties" actions={<Link to={`/party/${id}/edit`} className="btn btn-sm">Edit</Link>}>
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={party.name} className="!w-12 !h-12 !text-base" />
          <div className="min-w-0">
            <div className="text-sm text-slate-600 truncate">{party.phone || 'No phone'}</div>
            {party.address && <div className="text-xs text-slate-500 break-words line-clamp-2">{party.address}</div>}
          </div>
        </div>
        <div className="grid grid-cols-1 min-[340px]:grid-cols-[1.4fr_1fr_1.2fr] gap-3">
          <div className="min-w-0"><div className="text-[13px] text-slate-500">{dueView(party.outstanding).label}</div><div className={`font-semibold text-2xl num break-words ${(party.outstanding || 0) === 0 ? 'text-slate-800' : dueView(party.outstanding).tone}`}>{money(dueView(party.outstanding).amount)}</div></div>
          <div className="min-w-0"><div className="text-[13px] text-slate-500">Jars</div><div className="font-semibold text-2xl num break-words">{totalJars}</div></div>
          <div className="min-w-0"><div className="text-[13px] text-slate-500">Deposit</div><div className="font-semibold text-2xl num break-words">{money(party.depositBalance || 0)}</div></div>
        </div>
        {totalJars !== 0 && <div className="text-xs text-slate-500 mt-3">{jarTypes.filter((j) => jarBal[j.id]).map((j) => `${jarBal[j.id]} × ${j.name}`).join(', ')}</div>}
      </div>

      <LocationCard party={party} />

      <div className="grid grid-cols-2 min-[340px]:grid-cols-4 gap-2">
        {[[q('/bill/new'), Receipt, 'Bill', true], [q('/entry/new/receipt'), HandCoins, 'Receipt'], [q('/entry/new/jar'), ArrowUUpLeft, 'Jar'], [q('/entry/new/deposit'), Bank, 'Deposit']].map(([to, Icon, label, primary]) => (
          <Link key={label} to={to} className={`btn flex-col !gap-1 !py-2 !px-1 min-h-[64px] text-xs ${primary ? 'btn-primary' : ''}`}><Icon size={22} />{label}</Link>
        ))}
      </div>
      <button className="btn w-full" onClick={() => setQrOpen(true)}><QrCode size={20} />Paisa lo (UPI QR)</button>
      {(lastBill || hasMore) && (
        <button className="btn w-full" disabled={finding || (loading && !entries.length)} onClick={repeatLast}>
          <ArrowsClockwise size={20} />{finding ? 'Dhundh raha hai...' : 'Pichhla bill dobara'}
        </button>
      )}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-3 gap-2">
        <button className="btn btn-sm" onClick={() => setStmtOpen(true)}><ShareNetwork size={18} />Statement</button>
        <a className={`btn btn-sm ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} href={`tel:${party.phone}`}><Phone size={18} />Call</a>
        <a className={`btn btn-sm ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer" href={waLink(party.phone, '', settings.countryCode)}><WhatsappLogo size={18} />WhatsApp</a>
      </div>

      <Tabs tabs={[['ledger', 'Ledger'], ['jars', 'Jars'], ['deposit', 'Deposit']]} value={tab} onChange={setTab} />
      {tab === 'jars' && (
        <div className="card p-3 text-sm space-y-1">
          {jarTypes.map((j) => <div key={j.id} className="flex justify-between"><span>{j.name}</span><b className={`num ${(jarBal[j.id] || 0) < 0 ? 'text-red-600' : ''}`}>{jarBal[j.id] || 0}</b></div>)}
        </div>
      )}
      {tab === 'deposit' && <div className="card p-3 text-sm flex justify-between"><span>Deposit abhi hamare paas</span><b className="num">{money(party.depositBalance || 0)}</b></div>}

      {loading && !entries.length ? <Spinner /> : !shown.length ? <Empty icon={ListBullets} title={tab === 'ledger' ? 'Abhi koi entry nahi' : 'Kuch nahi mila'}>{tab === 'ledger' ? 'Bill ya receipt banao, yahan dikhega.' : 'Loaded entries mein kuch nahi mila. Load more try karo.'}</Empty> : (
        <div className="space-y-2">{shown.map((r) => <TxnRow key={r.t.id} row={r} money={money} actions={actions} />)}</div>
      )}
      {hasMore && <button className="btn w-full" disabled={loading} onClick={() => load(true)}>{loading ? 'Loading…' : 'Load more'}</button>}
      <div className="text-center"><Link className="btn btn-ghost btn-sm text-slate-500 underline" to={q('/entry/new/adjustment')}>Manual adjustment entry</Link></div>

      <ShareBillModal bill={shareBill} onClose={() => setShareBill(null)} />
      <UpiQrSheet open={qrOpen} onClose={() => setQrOpen(false)} partyName={party.name} billNo="" suggestedPaise={(party.outstanding || 0) > 0 ? party.outstanding : 0} />
      <Modal open={stmtOpen} onClose={() => setStmtOpen(false)} title="Statement share">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Statement mein wahi entries aayengi jo screen par loaded hain ({rows.length}). Zyada ke liye pehle "Load more" dabao.</p>
          <button className="btn btn-primary w-full" onClick={stmtPdf}><FilePdf size={20} />PDF share / download</button>
          <a className={`btn w-full ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer" href={waLink(party.phone, stmt, settings.countryCode)}><WhatsappLogo size={20} />WhatsApp text</a>
          <button className="btn w-full" onClick={async () => { const r = await shareText(stmt, 'Statement'); if (r === 'copied') toast('Text copy ho gaya'); }}>Text share / copy</button>
        </div>
      </Modal>
    </Page>
  );
}
