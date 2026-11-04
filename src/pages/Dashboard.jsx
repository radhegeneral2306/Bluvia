import { Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { Page } from '../components/ui.jsx';

function Stat({ label, value, tone = '', sub }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { settings, summary, daily, jarTypes, jarName, money, parties } = useStore();
  const jars = Object.entries(summary?.totalJarsOut || {}).filter(([, n]) => n);
  const totalJars = jars.reduce((s, [, n]) => s + n, 0);
  const last = settings.lastBackupAt?.toMillis?.();
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const stale = days === null || days >= 7;

  return (
    <Page title={settings.businessName} narrow={false}>
      <img src="/logo.jpg" alt="" className="h-14 rounded-lg lg:hidden" />
      {stale && (
        <Link to="/backup" className="block rounded-xl bg-amber-100 text-amber-900 p-3 text-sm font-medium">
          ⚠️ {days === null ? 'Abhi tak koi backup nahi liya.' : `Last backup ${days} din pehle liya tha.`} Backup lene ke liye yahan dabao.
        </Link>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total outstanding" value={money(summary?.totalOutstanding || 0)} tone="text-red-600" sub={`${parties.filter((p) => (p.outstanding || 0) > 0).length} parties`} />
        <Stat label="Total jars out" value={totalJars} sub={jars.map(([id, n]) => `${n}×${jarName(id)}`).join(' • ') || 'No jars out'} />
        <Stat label="Deposit held" value={money(summary?.totalDepositHeld || 0)} />
        <Stat label="Aaj ki sales" value={money(daily?.sales || 0)} sub={`${daily?.billsCount || 0} bills`} />
        <Stat label="Aaj ki collection" value={money(daily?.collection || 0)} tone="text-emerald-600" />
      </div>
      <div>
        <h2 className="font-bold mb-2">Quick actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link to="/bill/new" className="btn btn-primary !min-h-[64px] text-lg">🧾 New Bill</Link>
          <Link to="/entry/new/receipt" className="btn !min-h-[64px] text-lg">💵 Receipt</Link>
          <Link to="/entry/new/jar" className="btn !min-h-[64px] text-lg">🫙 Jar Return</Link>
          <Link to="/entry/new/deposit" className="btn !min-h-[64px] text-lg">🏦 Deposit</Link>
        </div>
      </div>
      {!jarTypes.length && <p className="text-sm text-slate-500">Pehle "More → Jar Types & Items" mein jar types banao.</p>}
    </Page>
  );
}
