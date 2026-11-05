import { Link } from 'react-router-dom';
import { MapTrifold, Tag, Database, ClockCounterClockwise, Calculator, Gear, CaretRight, UsersFour, ListMagnifyingGlass, UserPlus, SignOut, UserCircle } from '@phosphor-icons/react';
import { signOut } from 'firebase/auth';
import { Page } from '../components/ui.jsx';
import { useStore } from '../data/store.jsx';
import { auth } from '../lib/firebase.js';
import { useT } from '../lib/i18n.js';
import LanguageToggle from '../components/LanguageToggle.jsx';

const groups = [
  ['Parties', 'more.group.parties', [
    ['/map', MapTrifold, 'more.map', 'more.map.desc'],
  ]],
  ['Data', 'more.group.data', [
    ['/masters', Tag, 'more.masters', 'more.masters.desc'],
    ['/backup', Database, 'more.backup', 'more.backup.desc'],
    ['/deleted', ClockCounterClockwise, 'more.deleted', 'more.deleted.desc'],
  ]],
  ['Tools', 'more.group.tools', [
    ['/recalc', Calculator, 'more.recalc', 'more.recalc.desc'],
    ['/settings', Gear, 'more.settings', 'more.settings.desc'],
  ]],
];

const adminParties = ['/quick-add', UserPlus, 'Quick add party', 'Naya customer jaldi jodo (naam, phone, location)'];
// Admin-only rows (quick add, team) are not translated yet: t() returns an unknown key as it is.
const teamGroup = ['Team', 'Team', [
  ['/staff', UsersFour, 'Staff', 'Staff login banao, band karo'],
  ['/changes', ListMagnifyingGlass, 'Changes (audit log)', 'Kisne kya badla, kab'],
]];

export default function More() {
  const { profile, user, isAdmin } = useStore();
  const { t } = useT();
  const who = profile?.name || user?.email || '';
  const role = isAdmin ? t('more.owner') : t('more.staff');
  const list = groups
    .filter(([name]) => isAdmin || (name !== 'Data' && name !== 'Tools'))
    .map(([name, nameKey, rows]) => [name, nameKey, name === 'Parties' && isAdmin ? [...rows, adminParties] : rows]);
  if (isAdmin) list.push(teamGroup);
  return (
    <Page title={t('more.title')}>
      <div className="card p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><UserCircle size={22} /></span>
        <div className="min-w-0"><div className="text-xs text-slate-500">{t('more.login')}</div><div className="font-semibold truncate">{who && who !== role ? `${who} (${role})` : role}</div></div>
      </div>
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('more.language')}</h2>
        <LanguageToggle />
      </section>
      {list.map(([name, nameKey, rows]) => (
        <section key={name} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{t(nameKey)}</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {rows.map(([to, Icon, title, d]) => (
              <Link key={to} to={to} className="flex items-center gap-3 px-4 min-h-[64px] py-2.5 transition-colors active:bg-slate-100">
                <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={20} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-900">{t(title)}</span>
                  <span className="block text-sm text-slate-500 truncate">{t(d)}</span>
                </span>
                <CaretRight size={18} className="text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      <button className="btn btn-danger w-full" onClick={() => signOut(auth)}><SignOut size={20} />{t('common.logout')}</button>
    </Page>
  );
}
