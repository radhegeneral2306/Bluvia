import { useMemo } from 'react';
import { ShareNetwork, FileXls, WhatsappLogo, CheckCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { Page, Empty, useToast } from '../components/ui.jsx';
import { reminderText, waLink, shareText } from '../lib/share.js';
import { fromPaise } from '../lib/money.js';

export default function OutstandingReport() {
  const { parties, money, settings, jarName } = useStore();
  const toast = useToast();
  const rows = useMemo(() => parties.filter((p) => (p.outstanding || 0) > 0).sort((a, b) => b.outstanding - a.outstanding), [parties]);
  const total = rows.reduce((s, p) => s + p.outstanding, 0);

  async function excel() {
    const XLSX = await import('xlsx');
    const aoa = [['Party', 'Phone', 'Outstanding'], ...rows.map((p) => [p.name, p.phone || '', Number(fromPaise(p.outstanding))]), ['TOTAL', '', Number(fromPaise(total))]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Outstanding');
    XLSX.writeFile(wb, 'outstanding.xlsx');
  }
  const listText = [`*${settings.businessName}: Outstanding*`, '', ...rows.map((p, i) => `${i + 1}. ${p.name}: ${money(p.outstanding)}`), '', `*Total: ${money(total)}*`].join('\n');

  return (
    <Page title="Outstanding Report" back="/reports">
      <div className="card px-4 py-3 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-600">Total baaki ({rows.length} parties)</span>
        <b className="text-xl text-red-600 num">{money(total)}</b>
      </div>
      {!rows.length ? <Empty icon={CheckCircle} title="Kisi ka baaki nahi">Sab parties ka hisaab clear hai.</Empty> : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {rows.map((p) => (
            <div key={p.id} className="px-4 min-h-[68px] py-2 flex items-center gap-3">
              <Link to={`/party/${p.id}`} className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-xs text-slate-500 num">{p.phone || 'No phone'}</div>
              </Link>
              <div className="font-bold text-red-600 num">{money(p.outstanding)}</div>
              <a className={`btn btn-sm ${p.phone ? '' : 'opacity-40 pointer-events-none'}`} target="_blank" rel="noreferrer"
                href={waLink(p.phone, reminderText({ party: p, settings, jarName, money }), settings.countryCode)}><WhatsappLogo size={20} />Remind</a>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button className="btn" onClick={async () => { const r = await shareText(listText, 'Outstanding'); if (r === 'copied') toast('Text copy ho gaya'); }}><ShareNetwork size={20} />Text share</button>
        <button className="btn" onClick={excel}><FileXls size={20} />Excel</button>
      </div>
    </Page>
  );
}
