import { createContext, lazy, Suspense, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CloudSlash, ArrowsClockwise } from '@phosphor-icons/react';
import { StoreProvider, useStore } from './data/store.jsx';
import { ToastProvider, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { signOut } from 'firebase/auth';
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
  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold mb-2">Firebase config missing</h1>
      <p className="text-sm text-slate-600">
        App ko Firebase ki config values nahi mili. <code>.env</code> file (ya Cloudflare Pages ke Variables) mein
        <code> VITE_FIREBASE_*</code> values daalo. Steps <b>SETUP.md</b> mein hain.
      </p>
    </div>
  );
}

// Service worker registration lives at the App root so it installs on the very first visit (also on the login screen).
const SwCtx = createContext({ needRefresh: false, update: () => {} });

function UpdateBar() {
  const { needRefresh, update } = useContext(SwCtx);
  if (!needRefresh) return null;
  return (
    <div className="bg-brand-600 text-white text-sm px-4 py-2 flex items-center justify-center gap-3" role="status">
      <ArrowsClockwise size={18} weight="bold" className="shrink-0" />
      Naya version available hai
      <button className="btn btn-sm !min-h-[36px] !bg-white !text-[#01616a] !border-white" onClick={update}>Update karo</button>
    </div>
  );
}

function Banners() {
  const { online } = useStore();
  return (
    <>
      {!online && (
        <div className="bg-[#92400e] text-white text-sm font-medium flex items-center justify-center gap-2 py-2 px-4" role="status">
          <CloudSlash size={18} weight="bold" className="shrink-0" />
          <span>Offline hain. Receipt, jar aur deposit save honge aur net aane par sync honge. Bill ke liye internet chahiye.</span>
        </div>
      )}
      <UpdateBar />
    </>
  );
}

function Gate() {
  const { user, ready, accessError, blocked, isAdmin } = useStore();
  if (user === undefined) return <div className="p-4 max-w-2xl mx-auto"><Spinner text="Starting" rows={3} /></div>;
  if (!user) return <><UpdateBar /><Login /></>;
  if (blocked) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold mb-2 text-red-700">Account band hai</h1>
        <p className="text-sm text-slate-700">Aapka login band kar diya gaya hai. Owner se baat karo.</p>
        <button className="btn btn-secondary mt-4" onClick={() => signOut(auth)}>Logout</button>
      </div>
    );
  }
  if (accessError) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold mb-2 text-red-700">Access denied</h1>
        <p className="text-sm text-slate-700">Is login ko access nahi mila. Agar aap owner ho: SETUP.md ka "UID kaise nikalein" step dekho aur <code>firestore.rules</code> mein OWNER_UID badal kar rules dobara publish karo. Agar aap staff ho: owner se kaho ki Staff screen mein aapka UID jod de.</p>
        <p className="text-sm mt-2 text-slate-700">Aapka UID: <code className="break-all num">{user.uid}</code></p>
      </div>
    );
  }
  if (!ready) return <div className="p-4 max-w-2xl mx-auto"><Spinner text="Data load ho raha hai" rows={5} /></div>;
  return (
    <Routes>
      <Route element={<Layout banner={<Banners />} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parties" element={<Parties />} />
        <Route path="/map" element={<Suspense fallback={<div className="p-4 max-w-2xl mx-auto"><Spinner text="Map khul raha hai" rows={3} /></div>}><MapView /></Suspense>} />
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
