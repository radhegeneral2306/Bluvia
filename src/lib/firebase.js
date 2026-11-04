import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
} from 'firebase/firestore';

const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const configured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);

let app = null, auth = null, db = null;
if (configured) {
  app = initializeApp(cfg);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Offline storage not available, using memory cache', e);
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}
// Dev/testing only: VITE_USE_EMULATOR=true talks to local Firebase emulators instead of the real project.
if (configured && env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, `http://127.0.0.1:${env.VITE_EMULATOR_AUTH_PORT || 9099}`, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', Number(env.VITE_EMULATOR_FIRESTORE_PORT || 8080));
}
export { app, auth, db };
