import { Link } from 'react-router-dom';
import { MapTrifold, Tag, Database, ClockCounterClockwise, Calculator, Gear, CaretRight, UsersFour, ListMagnifyingGlass, UserPlus, SignOut, UserCircle } from '@phosphor-icons/react';
import { signOut } from 'firebase/auth';
import { Page } from '../components/ui.jsx';
import { useStore } from '../data/store.jsx';
import { auth } from '../lib/firebase.js';

const groups = [
  ['Parties', [
    ['/map', MapTrifold, 'Map', 'Parties ko map par dekho, navigate karo'],
  ]],
  ['Data', [
    ['/masters', Tag, 'Jar Types & Items', 'Jar types, items, rates, deposits'],
    ['/backup', Database, 'Backup & Restore', 'JSON / Excel backup, restore'],
    ['/deleted', ClockCounterClockwise, 'Deleted entries', 'Audit view, restore deleted entries'],
  ]],
  ['Tools', [
    ['/recalc', Calculator, 'Recalculate balances', 'Safety tool: entries se balances dobara banata hai'],
    ['/settings', Gear, 'Settings', 'Business details, payment modes, logout'],
  ]],
];

const adminParties = ['/quick-add', UserPlus, 'Quick add party', 'Naya customer jaldi jodo (naam, phone, location)'];
const teamGroup = ['Team', [
  ['/staff', UsersFour, 'Staff', 'Staff login banao, band karo'],
  ['/changes', ListMagnifyingGlass, 'Changes (audit log)', 'Kisne kya badla, kab'],
]];

export default function More() {
  const { profile, user, isAdmin } = useStore();
  const who = profile?.name || user?.email || '';
  const list = groups
    .filter(([name]) => isAdmin || (name !== 'Data' && name !== 'Tools'))
    .map(([name, rows]) => [name, name === 'Parties' && isAdmin ? [...rows, adminParties] : rows]);
  if (isAdmin) list.push(teamGroup);
  return (
    <Page title="More">
      <div className="card p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><UserCircle size={22} /></span>
        <div className="min-w-0"><div className="text-xs text-slate-500">Login</div><div className="font-semibold truncate">{who ? `${who} (${isAdmin ? 'Owner' : 'Staff'})` : (isAdmin ? 'Owner' : 'Staff')}</div></div>
      </div>
      {list.map(([name, rows]) => (
        <section key={name} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{name}</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {rows.map(([to, Icon, t, d]) => (
              <Link key={to} to={to} className="flex items-center gap-3 px-4 min-h-[64px] py-2.5 transition-colors active:bg-slate-100">
                <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={20} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-900">{t}</span>
                  <span className="block text-sm text-slate-500 truncate">{d}</span>
                </span>
                <CaretRight size={18} className="text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      <button className="btn btn-danger w-full" onClick={() => signOut(auth)}><SignOut size={20} />Logout</button>
    </Page>
  );
}
