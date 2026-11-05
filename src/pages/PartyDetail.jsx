import { useCallback, useEffect, useMemo, useState } from 'react';
import { errText } from '../lib/errors.js';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
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
import { canModifyTxn } from '../lib/roles.js';
import { sharePdf, statementText, waLink, shareText } from '../lib/share.js';

export default function PartyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { t: tr } = useT();
  const { partyMap, jarTypes, jarName, money, settings, profile, user, isAdmin } = useStore();
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
    } catch (e) { toast(tr('party.err.load', { msg: errText(e, tr) }), 'err', 6000); } finally { setLoading(false); }
  }, [id, cursor, toast, tr]);
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

  if (!party) return <Page title={tr('word.party')} back="/parties"><Empty>{tr('party.notFound')}</Empty></Page>;

  async function del(t) {
    if (!window.confirm(tr('party.confirmDelete'))) return;
    try {
      const { withLinked, linked } = await askLinkedDelete(t, tr);
      await softDeleteTxn(t, { withLinked });
      const gone = new Set([t.id, ...linked.map((l) => l.id)]);
      setEntries((p) => p.filter((x) => !gone.has(x.id)));
      toast(withLinked ? tr('party.toast.deletedLinked') : tr('party.toast.deleted'));
    } catch (e) { toast(errText(e, tr), 'err'); }
  }

  const actions = (row) => (
    <>
      {row.t.type === 'bill' && <button className="btn btn-sm" onClick={() => setShareBill(row.t)}><ShareNetwork size={18} />{tr('party.share')}</button>}
      {row.t.type === 'bill' && (
        <button className="btn btn-sm !min-h-[44px] !min-w-[44px]" aria-label={tr('party.repeatAria')} onClick={() => nav(`/bill/new?party=${id}&repeat=${row.t.id}`)}>
          <ArrowsClockwise size={18} /><span className="hidden min-[400px]:inline">{tr('party.repeat')}</span>
        </button>
      )}
      {canModifyTxn(profile, user?.uid, row.t) && <EditLink t={row.t} />}
      {canModifyTxn(profile, user?.uid, row.t) && <button className="btn btn-sm !text-red-600" onClick={() => del(row.t)}><Trash size={18} />{tr('common.delete')}</button>}
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
      else toast(more ? tr('party.toast.noBillMore') : tr('party.toast.noBill'), 'warn');
    } catch (e) { toast(tr('party.err.findBill', { msg: errText(e, tr) }), 'err', 6000); } finally { setFinding(false); }
  }

  async function stmtPdf() {
    const doc = await buildStatementPdf({ party, rows, settings, jarName });
    const r = await sharePdf(doc, `statement-${party.name}.pdf`, `Statement ${party.name}`);
    if (r === 'downloaded') toast(tr('party.toast.pdfDownloaded'));
  }
  const stmt = statementText({ party, rows, settings, jarName, money });

  return (
    <Page title={party.name} back="/parties" actions={isAdmin ? <Link to={`/party/${id}/edit`} className="btn btn-sm">{tr('common.edit')}</Link> : null}>
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={party.name} className="!w-12 !h-12 !text-base" />
          <div className="min-w-0">
            <div className="text-sm text-slate-600 truncate">{party.phone || tr('party.noPhone')}</div>
            {party.address && <div className="text-xs text-slate-500 break-words line-clamp-2">{party.address}</div>}
          </div>
        </div>
        <div className="grid grid-cols-1 min-[340px]:grid-cols-[1.4fr_1fr_1.2fr] gap-3">
          <div className="min-w-0"><div className="text-[13px] text-slate-500">{(party.outstanding || 0) < 0 ? tr('party.advance') : tr('word.baaki')}</div><div className={`font-semibold text-2xl num break-words ${(party.outstanding || 0) === 0 ? 'text-slate-800' : dueView(party.outstanding).tone}`}>{money(dueView(party.outstanding).amount)}</div></div>
          <div className="min-w-0"><div className="text-[13px] text-slate-500">{tr('word.jars')}</div><div className="font-semibold text-2xl num break-words">{totalJars}</div></div>
          <div className="min-w-0"><div className="text-[13px] text-slate-500">{tr('word.deposit')}</div><div className="font-semibold text-2xl num break-words">{money(party.depositBalance || 0)}</div></div>
        </div>
        {totalJars !== 0 && <div className="text-xs text-slate-500 mt-3">{jarTypes.filter((j) => jarBal[j.id]).map((j) => `${jarBal[j.id]} × ${j.name}`).join(', ')}</div>}
      </div>

      <LocationCard party={party} />

      <div className="grid grid-cols-2 min-[340px]:grid-cols-4 gap-2">
        {[[q('/bill/new'), Receipt, tr('word.bill'), true], [q('/entry/new/receipt'), HandCoins, tr('word.receipt')], [q('/entry/new/jar'), ArrowUUpLeft, tr('word.jars')], [q('/entry/new/deposit'), Bank, tr('word.deposit')]].map(([to, Icon, label, primary]) => (
          <Link key={to} to={to} className={`btn flex-col !gap-1 !py-2 !px-1 min-h-[64px] text-xs ${primary ? 'btn-primary' : ''}`}><Icon size={22} />{label}</Link>
        ))}
      </div>
      <button className="btn w-full" onClick={() => setQrOpen(true)}><QrCode size={20} />{tr('party.qr')}</button>
      {(lastBill || hasMore) && (
        <button className="btn w-full" disabled={finding || (loading && !entries.length)} onClick={repeatLast}>
          <ArrowsClockwise size={20} />{finding ? tr('party.finding') : tr('party.repeatLast')}
        </button>
      )}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-3 gap-2">
        <button className="btn btn-sm" onClick={() => setStmtOpen(true)}><ShareNetwork size={18} />{tr('party.statement')}</button>
        <a className={`btn btn-sm ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} href={`tel:${party.phone}`}><Phone size={18} />{tr('party.call')}</a>
        <a className={`btn btn-sm ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer" href={waLink(party.phone, '', settings.countryCode)}><WhatsappLogo size={18} />WhatsApp</a>
      </div>

      <Tabs tabs={[['ledger', tr('party.tab.ledger')], ['jars', tr('party.tab.jars')], ['deposit', tr('party.tab.deposit')]]} value={tab} onChange={setTab} />
      {tab === 'jars' && (
        <div className="card p-3 text-sm space-y-1">
          {jarTypes.map((j) => <div key={j.id} className="flex justify-between"><span>{j.name}</span><b className={`num ${(jarBal[j.id] || 0) < 0 ? 'text-red-600' : ''}`}>{jarBal[j.id] || 0}</b></div>)}
        </div>
      )}
      {tab === 'deposit' && <div className="card p-3 text-sm flex justify-between"><span>{tr('party.depositWithUs')}</span><b className="num">{money(party.depositBalance || 0)}</b></div>}

      {loading && !entries.length ? <Spinner /> : !shown.length ? <Empty icon={ListBullets} title={tab === 'ledger' ? tr('party.empty.none') : tr('party.empty.nothing')}>{tab === 'ledger' ? tr('party.empty.hintLedger') : tr('party.empty.hintOther')}</Empty> : (
        <div className="space-y-2">{shown.map((r) => <TxnRow key={r.t.id} row={r} money={money} actions={actions} />)}</div>
      )}
      {hasMore && <button className="btn w-full" disabled={loading} onClick={() => load(true)}>{loading ? tr('party.loading') : tr('party.loadMore')}</button>}
      {isAdmin && <div className="text-center"><Link className="btn btn-ghost btn-sm text-slate-500 underline" to={q('/entry/new/adjustment')}>{tr('party.manualAdjust')}</Link></div>}

      <ShareBillModal bill={shareBill} onClose={() => setShareBill(null)} />
      <UpiQrSheet open={qrOpen} onClose={() => setQrOpen(false)} partyName={party.name} billNo="" suggestedPaise={(party.outstanding || 0) > 0 ? party.outstanding : 0} />
      <Modal open={stmtOpen} onClose={() => setStmtOpen(false)} title={tr('party.stmt.title')}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{tr('party.stmt.note', { n: rows.length })}</p>
          <button className="btn btn-primary w-full" onClick={stmtPdf}><FilePdf size={20} />{tr('party.stmt.pdf')}</button>
          <a className={`btn w-full ${party.phone ? '' : 'opacity-50 pointer-events-none'}`} target="_blank" rel="noreferrer" href={waLink(party.phone, stmt, settings.countryCode)}><WhatsappLogo size={20} />{tr('party.stmt.wa')}</a>
          <button className="btn w-full" onClick={async () => { const r = await shareText(stmt, 'Statement'); if (r === 'copied') toast(tr('party.toast.textCopied')); }}>{tr('party.stmt.text')}</button>
        </div>
      </Modal>
    </Page>
  );
}
