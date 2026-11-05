import { Link } from 'react-router-dom';
import { Receipt, HandCoins, ArrowUUpLeft, Bank, Warning } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page } from '../components/ui.jsx';
import { useT } from '../lib/i18n.js';

function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className="py-3 border-b border-slate-200 min-w-0 break-words">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className={`text-xl font-semibold num ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

const actions = [
  ['/bill/new', Receipt, 'dash.act.newBill'],
  ['/entry/new/receipt', HandCoins, 'dash.act.receipt'],
  ['/entry/new/jar', ArrowUUpLeft, 'dash.act.jarReturn'],
  ['/entry/new/deposit', Bank, 'dash.act.deposit'],
];

export default function Dashboard() {
  const { settings, summary, daily, jarName, money, parties, jarTypes, isAdmin } = useStore();
  const { t } = useT();
  const jars = Object.entries(summary?.totalJarsOut || {}).filter(([, n]) => n);
  const totalJars = jars.reduce((s, [, n]) => s + n, 0);
  const last = settings.lastBackupAt?.toMillis?.();
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const stale = days === null || days >= 7;
  const dueCount = parties.filter((p) => (p.outstanding || 0) > 0).length;

  return (
    <Page title={settings.businessName} narrow={false}>
      <img src="/logo.jpg" alt="" className="h-14 rounded-xl lg:hidden" />
      {isAdmin && stale && (
        <Link to="/backup" className="flex items-start gap-3 rounded-xl bg-amber-100 text-amber-900 p-3 text-sm font-medium">
          <Warning size={20} className="shrink-0 mt-px" />
          <span>{days === null ? t('dash.backup.none') : t('dash.backup.days', { days })} {t('dash.backup.cta')}</span>
        </Link>
      )}

      {isAdmin && !parties.length && (
        <section className="card p-4 space-y-3" aria-label={t('dash.start.title')}>
          <h2 className="font-semibold">{t('dash.start.title')}</h2>
          <p className="text-sm text-slate-600">{t('dash.start.hint')}</p>
          <ol className="space-y-1">
            {[['/masters', t('dash.start.masters')], ['/settings', t('dash.start.settings')], ['/party/new', t('dash.start.party')], ['/bill/new', t('dash.start.bill')]].map(([to, label], i) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-3 min-h-[44px] rounded-xl px-2 active:bg-slate-100">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-brand-100 text-brand-700 text-sm font-semibold flex items-center justify-center num">{i + 1}</span>
                  <span className="text-sm font-medium text-slate-800 min-w-0 break-words">{label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="rounded-2xl bg-brand-600 text-white p-5">
          <div className="text-sm opacity-90">{t('dash.totalOutstanding')}</div>
          <div className="text-3xl min-[400px]:text-4xl font-semibold num mt-1 break-words">{money(summary?.totalOutstanding || 0)}</div>
          <div className="text-sm opacity-90 mt-2">{t(dueCount === 1 ? 'dash.dueParties.one' : 'dash.dueParties.many', { n: dueCount })}</div>
        </div>
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-x-6">
          <Stat label={t('dash.jarsOut')} value={totalJars} sub={jars.map(([id, n]) => `${n}×${jarName(id)}`).join(', ') || t('dash.noJars')} />
          <Stat label={t('dash.depositHeld')} value={money(summary?.totalDepositHeld || 0)} />
          <Stat label={t('dash.todaySales')} value={money(daily?.sales || 0)} sub={t((daily?.billsCount || 0) === 1 ? 'dash.bill.one' : 'dash.bill.many', { n: daily?.billsCount || 0 })} />
          <Stat label={t('dash.todayCollection')} value={money(daily?.collection || 0)} tone="text-emerald-600" />
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-3">{t('dash.quick')}</h2>
        <div className="grid grid-cols-2 min-[340px]:grid-cols-4 gap-2">
          {actions.map(([to, Icon, label]) => (
            <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-2xl py-3 active:scale-[0.98] transition-transform">
              <span className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center"><Icon size={24} /></span>
              <span className="text-[13px] font-medium text-slate-700 text-center leading-tight">{t(label)}</span>
            </Link>
          ))}
        </div>
      </section>
      {isAdmin && !jarTypes.length && <p className="text-sm text-slate-500">{t('dash.needJarTypes')}</p>}
    </Page>
  );
}
