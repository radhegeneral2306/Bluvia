import { NavLink, Outlet, Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';

const main = [
  ['/', '🏠', 'Home', true],
  ['/parties', '👥', 'Parties'],
  ['/bills', '🧾', 'Bills'],
  ['/reports', '📊', 'Reports'],
  ['/more', '☰', 'More'],
];
const side = [
  ['/', '🏠', 'Dashboard', true], ['/bill/new', '➕', 'New Bill'], ['/parties', '👥', 'Parties'], ['/bills', '🧾', 'Bills & Receipts'],
  ['/reports/jars', '🫙', 'Jar Report'], ['/reports/outstanding', '💰', 'Outstanding Report'],
  ['/masters', '🏷️', 'Jar Types & Items'], ['/backup', '💾', 'Backup & Restore'], ['/deleted', '🗑️', 'Deleted entries'], ['/settings', '⚙️', 'Settings'],
];

export default function Layout({ banner }) {
  const { settings } = useStore();
  return (
    <div className="min-h-full lg:flex">
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen p-3 gap-1">
        <Link to="/" className="px-3 py-4 font-bold text-brand-700 text-lg leading-tight">{settings?.businessName || 'Bluvia'}</Link>
        {side.map(([to, ic, label, end]) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `rounded-xl px-3 py-2.5 text-sm font-semibold flex gap-3 ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`}>
            <span>{ic}</span>{label}
          </NavLink>
        ))}
      </aside>
      <main className="flex-1 min-w-0">
        {banner}
        <Outlet />
      </main>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 safe-bottom">
        <div className="grid grid-cols-5 h-[60px]">
          {main.map(([to, ic, label, end]) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex flex-col items-center justify-center text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-slate-500'}`}>
              <span className="text-xl leading-none">{ic}</span>{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
