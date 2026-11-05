import { createContext, lazy, Suspense, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CloudSlash, ArrowsClockwise } from '@phosphor-icons/react';
import { StoreProvider, useStore } from './data/store.jsx';
import { ToastProvider, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { signOut } from 'firebase/auth';
import { useT } from './lib/i18n.js';
import { configured, auth } from './lib/firebase.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Parties from './pages/Parties.jsx';
import PartyForm from './pages/PartyForm.jsx';
import PartyDetail from './pages/PartyDetail.jsx';
import BillForm from './pages/BillForm.jsx';
import EntryForm from './pages/EntryForm.jsx';
import Bills from './pages/Bills.jsx';
import Reports from './pages/Reports.jsx';
import JarReport from './pages/JarReport.jsx';
import OutstandingReport from './pages/OutstandingReport.jsx';
import Masters from './pages/Masters.jsx';
import Settings from './pages/Settings.jsx';
import Backup from './pages/Backup.jsx';
import Recalc from './pages/Recalc.jsx';
import Deleted from './pages/Deleted.jsx';
import More from './pages/More.jsx';
import Staff from './pages/Staff.jsx';
import QuickAddParty from './pages/QuickAddParty.jsx';
import Changes from './pages/Changes.jsx';

const MapView = lazy(() => import('./pages/MapView.jsx')); // Leaflet is only downloaded when the map is opened

function ConfigMissing() {
  const { t } = useT();
  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold mb-2">{t('app.configMissing.title')}</h1>
      <p className="text-sm text-slate-600">{t('app.configMissing.body')}</p>
    </div>
  );
}

// Service worker registration lives at the App root so it installs on the very first visit (also on the login screen).
const SwCtx = createContext({ needRefresh: false, update: () => {} });

function UpdateBar() {
  const { needRefresh, update } = useContext(SwCtx);
  const { t } = useT();
  if (!needRefresh) return null;
  return (
    <div className="bg-brand-600 text-white text-sm px-4 py-2 flex items-center justify-center gap-3" role="status">
      <ArrowsClockwise size={18} weight="bold" className="shrink-0" />
      {t('app.update.text')}
      <button className="btn btn-sm !min-h-[44px] !bg-white !text-[#01616a] !border-white" onClick={update}>{t('app.update.btn')}</button>
    </div>
  );
}

function Banners() {
  const { online } = useStore();
  const { t } = useT();
  return (
    <>
      {!online && (
        <div className="bg-[#92400e] text-white text-sm font-medium flex items-center justify-center gap-2 py-2 px-4" role="status">
          <CloudSlash size={18} weight="bold" className="shrink-0" />
          <span>{t('app.offline')}</span>
        </div>
      )}
      <UpdateBar />
    </>
  );
}

function Gate() {
  const { user, ready, accessError, blocked, isAdmin } = useStore();
  const { t } = useT();
  if (user === undefined) return <div className="p-4 max-w-2xl mx-auto"><Spinner text={t('app.starting')} rows={3} /></div>;
  if (!user) return <><UpdateBar /><Login /></>;
  if (blocked) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold mb-2 text-red-700">{t('app.blocked.title')}</h1>
        <p className="text-sm text-slate-700">{t('app.blocked.body')}</p>
        <button className="btn btn-secondary mt-4" onClick={() => signOut(auth)}>{t('common.logout')}</button>
      </div>
    );
  }
  if (accessError) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold mb-2 text-red-700">{t('app.denied.title')}</h1>
        <p className="text-sm text-slate-700">{t('app.denied.staff')}</p>
        <p className="text-sm mt-3 text-slate-700">{t('app.denied.uid')}</p>
        <code className="block mt-1 rounded-xl bg-slate-100 border border-slate-200 px-3 py-2.5 text-sm break-all num select-all">{user.uid}</code>
        <p className="text-xs mt-4 text-slate-500">{t('app.denied.owner')}</p>
        <button className="btn btn-secondary mt-4" onClick={() => signOut(auth)}>{t('common.logout')}</button>
      </div>
    );
  }
  if (!ready) return <div className="p-4 max-w-2xl mx-auto"><Spinner text={t('app.loading')} rows={5} /></div>;
  return (
    <Routes>
      <Route element={<Layout banner={<Banners />} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parties" element={<Parties />} />
        <Route path="/map" element={<Suspense fallback={<div className="p-4 max-w-2xl mx-auto"><Spinner text={t('app.mapLoading')} rows={3} /></div>}><MapView /></Suspense>} />
        <Route path="/party/new" element={isAdmin ? <PartyForm /> : <Navigate to="/" replace />} />
        <Route path="/party/:id" element={<PartyDetail />} />
        <Route path="/party/:id/edit" element={isAdmin ? <PartyForm /> : <Navigate to="/" replace />} />
        <Route path="/bill/new" element={<BillForm />} />
        <Route path="/bill/:id/edit" element={<BillForm />} />
        <Route path="/entry/new/:kind" element={<EntryForm />} />
        <Route path="/entry/:id/edit" element={<EntryForm />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/jars" element={<JarReport />} />
        <Route path="/reports/outstanding" element={<OutstandingReport />} />
        <Route path="/masters" element={isAdmin ? <Masters /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={isAdmin ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="/backup" element={isAdmin ? <Backup /> : <Navigate to="/" replace />} />
        <Route path="/recalc" element={isAdmin ? <Recalc /> : <Navigate to="/" replace />} />
        <Route path="/deleted" element={isAdmin ? <Deleted /> : <Navigate to="/" replace />} />
        <Route path="/quick-add" element={isAdmin ? <QuickAddParty /> : <Navigate to="/" replace />} />
        <Route path="/staff" element={isAdmin ? <Staff /> : <Navigate to="/" replace />} />
        <Route path="/changes" element={isAdmin ? <Changes /> : <Navigate to="/" replace />} />
        <Route path="/more" element={<More />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!configured) return <ConfigMissing />;
  return (
    <SwCtx.Provider value={{ needRefresh, update: () => updateServiceWorker(true) }}>
      <ToastProvider>
        <StoreProvider>
          <Gate />
        </StoreProvider>
      </ToastProvider>
    </SwCtx.Provider>
  );
}
