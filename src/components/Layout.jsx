import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { House, MapTrifold, UsersThree, Receipt, ChartBar, List, Plus, Drop, Wallet, Tag, Database, ClockCounterClockwise, Gear, UsersFour, ListMagnifyingGlass, UserPlus } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';

const main = [
  ['/', House, 'nav.home', true],
  ['/parties', UsersThree, 'nav.parties'],
  ['/bills', Receipt, 'nav.bills'],
  ['/reports', ChartBar, 'nav.reports'],
  ['/more', List, 'nav.more'],
];
const groups = [
  ['Daily', 'layout.group.daily', [['/', House, 'layout.dashboard', true], ['/bill/new', Plus, 'layout.newBill'], ['/parties', UsersThree, 'nav.parties'], ['/map', MapTrifold, 'layout.map'], ['/bills', Receipt, 'layout.billsAndReceipts']]],
  ['Reports', 'layout.group.reports', [['/reports/jars', Drop, 'layout.jarReport'], ['/reports/outstanding', Wallet, 'layout.outstanding']]],
  // Admin-only links below are not translated yet: a label that is not a known key is shown as it is.
  ['Manage', 'layout.group.manage', [['/masters', Tag, 'layout.jarTypesAndItems'], ['/backup', Database, 'layout.backupRestore'], ['/deleted', ClockCounterClockwise, 'layout.deleted'], ['/settings', Gear, 'layout.settings'], ['/staff', UsersFour, 'Staff'], ['/changes', ListMagnifyingGlass, 'Changes (audit log)'], ['/quick-add', UserPlus, 'Quick add party']]],
];

export default function Layout({ banner }) {
  const { settings, isAdmin } = useStore();
  const { t } = useT();
  const { pathname } = useLocation();
  return (
    <div className="min-h-full lg:flex">
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-surface border-r border-slate-200 sticky top-0 h-screen p-4 gap-5 overflow-y-auto">
        <Link to="/" aria-label={settings?.businessName || 'Bluvia'}><img src="/logo.jpg" alt={settings?.businessName || 'Bluvia'} className="w-full rounded-xl" /></Link>
        {groups.filter(([name]) => isAdmin || name !== 'Manage').map(([name, nameKey, links]) => (
          <nav key={name} aria-label={t(nameKey)} className="space-y-0.5">
            <div className="px-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t(nameKey)}</div>
            {links.map(([to, Icon, label, end]) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `rounded-xl px-3 min-h-[42px] text-sm font-medium flex items-center gap-3 transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                {({ isActive }) => (<><Icon size={20} weight={isActive ? 'fill' : 'regular'} />{t(label)}</>)}
              </NavLink>
            ))}
          </nav>
        ))}
      </aside>
      <main className="flex-1 min-w-0 overflow-x-clip">
        {banner}
        <div key={pathname} className="page-enter"><Outlet /></div>
      </main>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-slate-200 safe-bottom" aria-label={t('layout.mainNav')}>
        <div className="grid grid-cols-5 h-[60px]">
          {main.map(([to, Icon, label, end]) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `relative flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${isActive ? 'text-brand-700' : 'text-slate-500'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand-600" />}
                  <Icon size={24} weight={isActive ? 'fill' : 'regular'} /><span className="max-w-full truncate px-0.5">{t(label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
