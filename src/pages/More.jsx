import { Link } from 'react-router-dom';
import { Page } from '../components/ui.jsx';

const links = [
  ['/masters', '🏷️', 'Jar Types & Items', 'Jar types, items, rates, deposits'],
  ['/backup', '💾', 'Backup & Restore', 'JSON / Excel backup, restore'],
  ['/deleted', '🗑️', 'Deleted entries', 'Audit view, restore deleted entries'],
  ['/recalc', '🧮', 'Recalculate balances', 'Safety tool — rebuilds balances from entries'],
  ['/settings', '⚙️', 'Settings', 'Business details, payment modes, logout'],
];
export default function More() {
  return (
    <Page title="More">
      <div className="space-y-3">
        {links.map(([to, ic, t, d]) => (
          <Link key={to} to={to} className="card p-4 flex items-center gap-4 active:bg-slate-50">
            <span className="text-2xl">{ic}</span>
            <span><span className="block font-semibold">{t}</span><span className="block text-sm text-slate-500">{d}</span></span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
