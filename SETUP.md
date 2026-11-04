# Bluvia — Setup Guide (Hinglish, step-by-step)

Yeh guide non-technical logon ke liye hai. Har step ko **upar se neeche, ek ek karke** follow karo.
Total time: **~45–60 minute** (pehli baar). Kharcha: **₹0** (Firebase Spark free plan + Cloudflare free plan).

> **Difficulty:** Medium. Kuch bhi "code" likhna nahi hai — bas websites par click karna hai aur kuch values copy-paste karni hain.

---

## Pehle yeh cheezein ready rakho

1. Ek **Google account** (Gmail) — Firebase ke liye.
2. **GitHub account** (aapka repo `bluvia` already hai).
3. Ek **Cloudflare account** (free) — https://dash.cloudflare.com/sign-up
4. Ek **Notepad / Notes app** — kuch values copy karke rakhni hongi.

---

## STEP 1 — Firebase project banao

1. Browser mein kholo: **https://console.firebase.google.com** (Google account se login).
2. **"Create a project"** (ya "Add project") dabao.
3. Project ka naam likho, jaise `bluvia-billing`. **Continue**.
4. "Google Analytics" ka option aaye to **OFF** kar do (zaroorat nahi). **Create project** dabao.
5. Wait karo, phir **Continue**.

> ⚠️ **Plan:** Firebase by default **Spark (free)** plan par hota hai. **Kabhi "Upgrade" mat dabana.** Is app ko paid plan ki zaroorat nahi.

---

## STEP 2 — Web app register karo aur "config" values copy karo

1. Firebase project ke home page par, **`</>`** (Web) icon dabao. Agar nahi dikhe: upar left mein **⚙️ (gear) → Project settings → neeche "Your apps" → `</>`**.
2. App nickname likho: `bluvia-web`.
3. **"Also set up Firebase Hosting" ko tick MAT karo.** → **Register app**.
4. Ek code box dikhega jisme `firebaseConfig = { apiKey: "...", authDomain: "...", ... }` hoga.
5. In 6 values ko **Notepad mein copy** karke rakho:

| Firebase mein naam | Hum ise yahan daalenge (Step 8) |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

> Value **inverted commas ("...") ke andar** wali copy karo, commas/quotes ke bina.
> Yeh values "secret password" nahi hain — Firebase web config public hota hai. Asli security **rules** (Step 5) se aati hai.

---

## STEP 3 — Email/Password login ON karo + apna user banao

1. Left menu: **Build → Authentication**. **"Get started"** dabao.
2. **"Sign-in method"** tab → **Email/Password** par click → **Enable** ON karo → **Save**.
3. **"Users"** tab → **"Add user"**:
   - Email: aapki email (jisse app mein login karoge)
   - Password: koi strong password (kam se kam 6 character)
   - **Add user** dabao.
4. Ab list mein aapka user dikhega. Us row mein **"User UID"** naam ka lamba code hoga (jaise `x7Kd9...`).
   **Is UID ko copy karke Notepad mein rakho.** 👈 Yeh bahut zaroori hai (Step 5 mein lagega).

### UID kaise nikalein (agar nahi dikh raha)
- Authentication → **Users** tab → aapke email wali row → sabse right/last column **"User UID"**. Us par copy icon aata hai.

---

## STEP 4 — Firestore database banao

1. Left menu: **Build → Firestore Database** → **"Create database"**.
2. **Location:** `asia-south1 (Mumbai)` chuno (India ke liye fast). ⚠️ Baad mein badal nahi sakti.
3. Mode: **"Start in production mode"** chuno → **Enable**.
4. Thodi der wait karo, database ready ho jayega.

---

## STEP 5 — Security Rules publish karo (UID yahan lagta hai)

1. Firestore Database page par upar **"Rules"** tab kholo.
2. Wahan jo bhi purana text hai, **sab select karke delete** kar do.
3. GitHub par apne repo mein file **`firestore.rules`** kholo, **poora text copy** karo aur Firebase ke Rules box mein **paste** karo.
4. Paste kiye hue text mein yeh line dhundo:
   ```
   return request.auth != null && request.auth.uid in ['OWNER_UID'];
   ```
5. `OWNER_UID` ko hata kar **apna UID** (Step 3 wala) likho — **inverted commas ' ' rehne do**. Example:
   ```
   return request.auth != null && request.auth.uid in ['x7Kd9AbC123yourRealUid'];
   ```
   (Agar 2 log use karenge to: `['UID_ek', 'UID_do']`.)
6. **"Publish"** dabao. ✅

> Iske baad sirf wahi login data dekh/likh sakta hai jiska UID list mein hai. Baaki sab ke liye database band hai.

---

## STEP 6 — Indexes banao (3 chhote index)

Ledger / bills list tez aur sasti rakhne ke liye 3 "composite index" chahiye.

1. Firestore Database → **"Indexes"** tab → **"Composite"** → **"Add index"**.
2. Pehla index:
   - **Collection ID:** `transactions`
   - Fields (is order mein add karo):
     1. `partyId` — **Ascending**
     2. `deleted` — **Ascending**
     3. `date` — **Descending**
     4. `createdAt` — **Descending**
   - Query scope: **Collection** → **Create**.
3. Dusra index (**Add index** phir se):
   - Collection ID: `transactions`
   - Fields: `type` — Ascending, `deleted` — Ascending, `date` — Descending, `createdAt` — Descending
   - Query scope: Collection → Create.
4. Teesra index:
   - Collection ID: `transactions`
   - Fields: `deleted` — Ascending, `updatedAt` — Descending
   - Query scope: Collection → Create.
5. Teeno ka status **"Building"** se **"Enabled"** hone mein 2–10 minute lagte hain. Wait karo.

> 💡 **Shortcut agar kuch miss ho jaye:** Agar app mein kabhi error aaye jisme "The query requires an index" likha ho aur ek lamba link ho — us link ko browser mein kholo, wahan **Create index** dabao. Firebase khud bana dega.
> (Index definitions repo ki `firestore.indexes.json` file mein bhi hain — jo log Firebase CLI jaante hain woh `firebase deploy --only firestore` se bhi daal sakte hain. Aapko zaroorat nahi.)

---

## STEP 7 — GitHub par code ready hai?

- Aapka repo `radhegeneral2306/bluvia` hai. Cloudflare **jis branch** ko dekhega wahi live hoga.
- Agar code abhi kisi alag branch (jaise `claude/...`) par hai, to GitHub par us branch ko **`main`** mein **merge** kar do (Pull Request → Merge), ya Cloudflare mein wahi branch "Production branch" chuno.

---

## STEP 8 — Cloudflare Pages par app host karo

1. **https://dash.cloudflare.com** → login.
2. Left menu: **Workers & Pages** → **Create** (ya "Create application").
3. **"Pages"** tab chuno → **"Connect to Git"** (Import an existing Git repository).
   > Cloudflare ka design badalta rehta hai. Agar sirf "Workers" dikhe, to neeche ek link hota hai "Looking to deploy Pages? **Get started**" — us par click karo.
4. **GitHub** connect karo → permission do → repo **`bluvia`** chuno → **Begin setup**.
5. Build settings bharo:
   - **Production branch:** `main`
   - **Framework preset:** `None` (ya `Vite` — dono chalega)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
6. **"Environment variables"** (Advanced) mein yeh **7 variables** add karo (naam bilkul waise hi, capital letters mein):

   | Variable name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | Step 2 wali apiKey |
   | `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
   | `VITE_FIREBASE_PROJECT_ID` | projectId |
   | `VITE_FIREBASE_STORAGE_BUCKET` | storageBucket |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
   | `VITE_FIREBASE_APP_ID` | appId |
   | `NODE_VERSION` | `22` |

7. **"Save and Deploy"** dabao. 2–4 minute mein build ho jayega.
8. Aapko ek link milega, jaise `https://bluvia-xxxx.pages.dev` — **yahi aapki app hai.** Isse bookmark karo.

> ⚠️ **Bahut important:** Variables **pehli build se pehle** daalna. Agar baad mein daalo ya badlo, to **Deployments → latest deployment → "Retry deployment"** (ya koi chhota change push karo) — warna app purani/khali config ke saath rahegi (white screen / "Firebase config missing").

### Firebase mein Cloudflare domain allow karo (ek baar)
1. Firebase → **Authentication → Settings → Authorized domains → Add domain**.
2. `bluvia-xxxx.pages.dev` (apna link, `https://` ke bina) daalo → **Add**.

---

## STEP 9 — Pehli baar login aur setup

1. Apni `.pages.dev` link kholo.
2. Step 3 wala **email + password** daalo → **Login**.
   - Agar **"Access denied"** dikhe: matlab rules mein UID galat hai. Step 5 dobara check karo (screen par aapka asli UID bhi dikhaya jayega — wahi rules mein daalo).
3. Pehli baar app khud kuch **default** cheezein bana degi: 20L Jar, 10L Jar, 2 items, payment modes (Cash/UPI/Bank). Sab **edit/delete** ho sakte hain.
4. **More → Settings** mein jao aur apna **business name, address, phone, bill prefix, footer note** bharo → **Save settings**.
5. **More → Jar Types & Items** mein apne rates aur deposit set karo.

---

## STEP 10 — Phone par app install karo (PWA)

### Android (Chrome)
1. Chrome mein apni `.pages.dev` link kholo, login karo.
2. **Option A:** **More → Settings → "📲 App install karo"** dabao → Install.
3. **Option B:** Chrome ka menu **⋮ (teen dots) → "Install app"** ya **"Add to Home screen"**.
4. Home screen par **Bluvia** icon aa jayega. Wahi se kholo — full screen app jaisa chalega.

### iPhone (Safari — sirf Safari, Chrome nahi)
1. **Safari** mein link kholo.
2. Neeche **Share (⬆️ square)** button dabao.
3. Neeche scroll karo → **"Add to Home Screen"** → **Add**.
4. Home screen se icon kholo.

### Computer (Chrome / Edge)
- Address bar ke right side mein **install icon (⊕ / monitor)** dikhega → **Install**.

> App **offline** bhi khulti hai. Offline mein **Receipt / Jar / Deposit** entries save ho jati hain aur internet aane par apne aap sync ho jati hain. **Bill banane ke liye internet chahiye** (bill number server se aata hai).
> Jab naya version aayega, upar ek bar dikhega **"Update karo"** — dabao.

---

## Roz ka use — zaroori baatein

- **Hafte mein ek baar backup lo:** More → Backup & Restore → "Full backup (JSON)" (+ Excel). Dashboard par 7 din baad reminder aayega.
- **Free limit:** Firebase free plan mein roz **50,000 reads** aur **20,000 writes** milte hain. Settings mein "Aaj ki reads" ka andaaza dikhta hai. Asli count: Firebase Console → Firestore → **Usage**.
  - "Recalculate balances" aur "Backup" **bahut reads** lete hain — roz mat chalao.
- **Entry delete karne par** wo "Deleted entries" mein jati hai (More → Deleted entries) — wahan se **Restore** ho sakti hai.
- **Kuch numbers galat lage?** More → "Recalculate balances" → pehle sirf difference dikhata hai, aap "Apply" dabaoge tabhi badlega.

---

## Dikkat aaye to (Troubleshooting)

| Problem | Kya karein |
|---|---|
| Safed/khali screen ya "Firebase config missing" | Cloudflare mein 6 `VITE_FIREBASE_*` variables check karo, phir **Retry deployment**. |
| "Access denied" | Firestore Rules mein UID galat/missing. Step 5 dobara. Rules **Publish** karna mat bhoolo. |
| "Email ya password galat" | Firebase → Authentication → Users mein user hai? Password reset ke liye wahin se 3-dot menu. |
| "The query requires an index" | Step 6 ke teeno index banao, ya error ka link kholkar Create dabao. Enabled hone tak 2–10 min wait. |
| Ledger/Bill list khali par data hai | Index abhi "Building" hai — thoda wait. |
| Bill save nahi ho raha | Internet check karo — bill ke liye internet zaroori hai. |
| Naya version nahi dikh raha | App band karke dobara kholo, ya "Update karo" bar dabao. |

---

## Manual test checklist (phone par — 10 minute)

1. **Login** karo → Dashboard dikhna chahiye.
2. **Settings** mein apna business name daalo → Save.
3. **Parties → + Add** → naam "Test Party", phone daalo, **Opening baaki ₹500** → Save. ➜ Party page par **Baaki ₹500**.
4. **Bill:** party page par **Bill** → item "20L Jar Water", qty 5 (rate auto aayega) → "Deposit bhi liya" tick (auto ₹1000) → Save.
   ➜ Share box aayega: **PDF** aur **WhatsApp** try karo. ➜ Party page: **Baaki ₹700, Jars 5, Deposit ₹1,000**. (Deposit sales/total mein nahi judna chahiye.)
5. **Receipt:** ₹300 → Save ➜ **Baaki ₹400**.
6. **Jar Return:** 2 jar → Save ➜ **Jars 3**.
7. **Edit:** bill par **Edit** → qty 6 → Save ➜ **Baaki ₹440**, **Jars 4**.
8. **Delete:** receipt par **Delete** ➜ **Baaki ₹740**. **More → Deleted entries → Restore** ➜ phir ₹440.
9. **Deposit:** Deposit → "Refund" ₹200 ➜ Deposit ₹800 (Baaki wahi). Phir "Adjust vs dues" ₹100 ➜ Deposit ₹700 aur Baaki ₹100 kam.
10. **Dashboard:** Total outstanding, jars, deposit, aaj ki sales (sirf bill ka total) aur collection (sirf receipts) check karo.
11. **Reports:** Jar Report aur Outstanding Report kholo → "Remind" se WhatsApp text khulna chahiye.
12. **Offline test:** Phone ka internet band karo → Receipt save karo (toast: "Phone par save hua") → internet on karo → kuch second mein sync. Bill offline banane par message aana chahiye.
13. **More → Recalculate balances → Check karo** ➜ "koi difference nahi" aana chahiye.
14. **Backup:** More → Backup → JSON download hona chahiye.
15. App **install** karke home screen se kholo.
