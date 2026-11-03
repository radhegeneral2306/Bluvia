import { Link } from 'react-router-dom';
import { Page } from '../components/ui.jsx';

export default function Reports() {
  return (
    <Page title="Reports">
      <div className="space-y-3">
        <Link to="/reports/jars" className="card p-4 block active:bg-slate-50">
          <b>🫙 Jar Report</b><span className="block text-sm text-slate-500">Kis party ke paas kitne jar aur kitna deposit</span>
        </Link>
        <Link to="/reports/outstanding" className="card p-4 block active:bg-slate-50">
          <b>💰 Outstanding Report</b><span className="block text-sm text-slate-500">Baaki paisa — high se low, WhatsApp reminder</span>
        </Link>
      </div>
    </Page>
  );
}
