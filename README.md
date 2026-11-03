# Bluvia Pure Drinking Water

Mobile-first installable PWA for simple billing (no GST), party ledger, receipts, empty-jar tracking, jar deposit tracking and backup.
Stack: React + Vite + Tailwind, Firebase (Auth + Firestore, Spark free plan), vite-plugin-pwa, jsPDF, SheetJS. Hosted on Cloudflare Pages (free).

**Non-technical setup guide (Hinglish): see [SETUP.md](SETUP.md).**

## Scripts
| Command | What |
|---|---|
| `npm run dev` | local dev server (needs `.env`, copy `.env.example`) |
| `npm run build` | production build into `dist/` |
| `npm test` | unit tests for balance/delta/rounding logic (Vitest) |
| `npm run test:emulator` | end-to-end test against Firebase emulators (needs Java; real rules + batches) |

## Design notes
- Money = integer paise everywhere (`src/lib/money.js`).
- All balance maths is pure and tested: `src/lib/ledger.js` (`effectOf`, `planChanges`, `recalculate`).
- Every write = one `writeBatch` / `runTransaction` with `increment()` deltas (edit = only the difference; delete = soft delete + reverse effect).
- Firestore rules: owner-UID only, numeric validation (`firestore.rules`). Indexes: `firestore.indexes.json`.
- Local dev against emulators: set `VITE_USE_EMULATOR=true` plus fake `VITE_FIREBASE_*` values and run `firebase emulators:start --only auth,firestore`.
