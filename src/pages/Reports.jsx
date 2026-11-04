import { Link } from 'react-router-dom';
import { Drop, Wallet, CaretRight } from '@phosphor-icons/react';
import { Page } from '../components/ui.jsx';

const rows = [
  ['/reports/jars', Drop, 'Jar Report', 'Kis party ke paas kitne jar aur kitna deposit'],
  ['/reports/outstanding', Wallet, 'Outstanding Report', 'Baaki paisa, high se low, WhatsApp reminder'],
];

export default function Reports() {
  return (
    <Page title="Reports">
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Party reports</h2>
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {rows.map(([to, Icon, t, d]) => (
            <Link key={to} to={to} className="flex items-center gap-3 px-4 min-h-[64px] py-2.5 transition-colors active:bg-slate-100">
              <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={20} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-900">{t}</span>
                <span className="block text-sm text-slate-500">{d}</span>
              </span>
              <CaretRight size={18} className="text-slate-400 shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </Page>
  );
}
