# Google Sheet Backup: Setup Guide (Hinglish)

Ye guide aapko Bluvia app ka data apni Google Sheet **"Bluvia.app"** mein automatic copy karwane ke liye hai.

- Sheet: https://docs.google.com/spreadsheets/d/1nmEKaQmw38_cZn8tgFwAQL-Y782xz62Oo7kce1kD62g/edit
- **Difficulty: Medium.** Time: lagbhag 20 minute.
- Kuch bhi code likhna nahi hai. Bas copy-paste aur click. Par kuch Google screens darawni lagti hain (warning wali). Wo normal hain, neeche samjhaya hai.
- Ye sirf ek baar karna hai.

---

## 0. Ye kya deta hai, aur kya NAHI deta

**Deta hai:**
- App ki har nayi ya badli hui entry (bill, receipt, jar, deposit) sheet ke **Log** tab mein ek nayi row ban kar aa jaati hai.
- **Parties** tab: har party ka baaki, deposit aur jar balance.
- **Daily** tab: roz ki sales, collection aur bills.
- **Status** tab: last sync kab hua, sab theek hai ya nahi.
- Koi password ya key kahin store nahi hoti. Script aapke apne Google login se chalti hai.

**NAHI deta (seedhi baat):**
- Sirf **ek taraf**: app se sheet. Sheet mein kuch badloge to app mein kuch nahi badlega. Kabhi nahi.
- **Lagbhag 10 minute ki delay.** Entry banate hi sheet mein nahi aati. Turant chahiye to menu se "Sync now".
- **Edit ya delete karne par purani row nahi badalti.** Nayi row judti hai: Event column mein `Created`, `Updated` ya `Deleted` likha hota hai. Purani row jaisi thi waisi rehti hai (isse history bachti hai).
- **Parties aur Daily tab roz sirf ek baar** (raat 2 baje) puri tarah naye sire se bante hain. Beech mein chahiye to menu se "Refresh parties and daily summary".
- Jo entries **backup file se restore** hui hain, unka purana timestamp wapas aata hai. Isliye wo Log mein dobara nahi aati (wo pehle hi log ho chuki thi).
- Ye sheet ek **copy** hai. Asli data app mein hai. Weekly app ka JSON backup lena band mat karna.

---

## 1. Pehle ye check karo (zaroori)

Script aapke Google account se Firebase database padhegi. To **jis Google account se aap sheet kholte ho, wahi account Firebase project mein bhi hona chahiye.**

1. https://console.firebase.google.com kholo. Project `bluvia-0027` chuno.
2. Upar left mein **gear icon (⚙️) > Project settings > Users and permissions** par jao.
3. Dekho ki aapka email list mein hai ya nahi, aur role **Owner** ya **Editor** ya **Viewer** hai.
4. Agar aap Firebase aur sheet **dono ke liye ek hi Gmail** use karte ho, to kuch karna nahi hai. Agla step.
5. Agar sheet wala Gmail alag hai: **Add member** dabao, wo email daalo aur role kam se kam **Viewer** do (Google Cloud mein ye "Cloud Datastore Viewer" jaisa kaam karta hai). Phir **Add member**.

Kya galat ho sakta hai: email alag hai aur add nahi kiya. Tab baad mein "403" error aayega.

---

## 2. Script sheet mein paste karo

1. Sheet kholo (upar wala link).
2. Menu: **Extensions > Apps Script**. Ek naya tab khulega.
3. Left mein `Code.gs` file dikhegi. Uska poora purana text **select all** karke delete kar do.
4. Repo ki file `integrations/google-sheet/Code.gs` kholo (GitHub par), poora text copy karo, aur Apps Script mein paste karo.
5. Upar **Save** icon (💾) dabao ya `Ctrl + S`.
6. Left mein neeche **Project Settings (⚙️ gear icon)** dabao.
7. **"Show 'appsscript.json' manifest file in editor"** ke saamne tick lagao.
8. Left mein wapas **Editor (`< >` icon)** par aao. Ab `appsscript.json` naam ki file dikhegi. Use kholo.
9. Uska poora purana text delete karke repo ki file `integrations/google-sheet/appsscript.json` ka text paste karo. Save karo.

Kya galat ho sakta hai: purana text poora delete nahi kiya aur do script mil gayi. Save karte waqt "syntax error" aayega. Phir se poora delete karke paste karo.

---

## 3. Script ko Firebase ke Google Cloud project se jodo (sabse zaroori step)

Ye step skip kiya to sab fail hoga ("Cloud Firestore API has not been used in project ...").

**3a. Project number nikalo**
1. Firebase console mein **Project settings > General** par jao.
2. **Project number** (sirf numbers, jaise `123456789012`) copy karo. Ye **Project ID** (`bluvia-0027`) se alag hai.

**3b. Apps Script mein lagao**
1. Apps Script tab mein **Project Settings (⚙️)** kholo.
2. Neeche **Google Cloud Platform (GCP) Project** section dhundo.
3. **Change project** dabao.
4. Project number paste karo aur **Set project** dabao.

**3c. Agar Google OAuth consent screen maange** (pehli baar aksar maangta hai)
1. https://console.cloud.google.com kholo. Upar project selector mein `bluvia-0027` chuno.
2. Left menu: **APIs and Services > OAuth consent screen**.
3. **Get started** ya **Configure** dabao. App name `Bluvia Backup` likho. Support email apna daalo.
4. **Audience / User type: External** chuno. Developer contact email apna daalo. Save karo.
5. **Audience** (ya **Test users**) mein jao. **Add users** dabao aur **apna Gmail** daalo. Save karo.
6. Wapas Apps Script mein jao aur step 3b dobara karo (**Change project**, number paste, **Set project**).

---

## 4. Firestore API check karo

App Firestore use karti hai, isliye ye pehle se ON hona chahiye. Phir bhi:
1. Google Cloud console > **APIs and Services > Enabled APIs**.
2. List mein **Cloud Firestore API** dikhni chahiye. Nahi dikhe to **Enable APIs and Services** dabao, "Cloud Firestore API" search karo aur **Enable** karo.

---

## 5. Setup chalao

1. Apni Google Sheet wale tab par jao aur **page reload** karo (`F5`).
2. 5 se 10 second baad menu bar mein ek naya menu **Bluvia Backup** aayega.
3. **Bluvia Backup > 1. Setup (first time)** dabao.
4. Google permissions maangega. Ye normal hai:
   - **Authorization required** aaye to **Continue** dabao. Apna Gmail chuno.
   - Screen aayegi **"Google hasn't verified this app"**. Ghabrao mat. Ye script aapne khud banai hai (aap hi ki hai), isliye Google ne use verify nahi kiya. Ye warning isi wajah se aati hai.
   - **Advanced** dabao. Phir **Go to Bluvia Backup (unsafe)** (ya project ka naam) dabao.
   - Jo permissions dikhengi unhe **Allow** karo (sheet padhna/likhna, Firestore data padhna, trigger banana).
5. Allow ke baad kabhi kabhi setup apne aap nahi chalta. Aisa ho to dobara **Bluvia Backup > 1. Setup (first time)** dabao.
6. Thodi der baad ek alert aayega: **"Connection OK. Business: ..."**, phir **"Setup complete. Auto sync runs every 10 minutes. See the Status tab."**

Kya galat ho sakta hai: error aaya (403 ya "has not been used"). Seedha neeche section 8 dekho.

---

## 6. Check karo ki sab bana ya nahi

Sheet ke neeche 4 tabs dikhne chahiye:

| Tab | Kya hona chahiye |
|---|---|
| **Log** | Upar header row, neeche aapki puri purani entries (pehli baar sab ek saath aati hain) |
| **Parties** | Har party ek row: naam, phone, baaki, deposit, jars |
| **Daily** | Roz ki sales, collection, bills |
| **Status** | `Last result` = **OK**, `Last log sync` mein abhi ka time |

Agar `Last result` mein **FAILED** likha hai, to `Last error` wali line padho aur section 8 dekho.

Aur ek cheez dekho: Apps Script mein left mein **Triggers (⏰ clock icon)** kholo. Do triggers dikhne chahiye: `syncLog` (har 10 minute) aur `refreshParties` (roz raat 2 se 3 ke beech).

---

## 7. Asli test karo (5 minute)

1. App mein ek test receipt banao (chhota amount, note mein "test").
2. Sheet mein **Bluvia Backup > Sync now** dabao (ya 10 minute ruko).
3. **Log** tab ke neeche nayi row aani chahiye: Type `Receipt`, Event `Created`.
4. App mein wahi receipt **edit** karo (amount badlo). Sync karo. Nayi row aayegi, Event `Updated`.
5. App mein wo receipt **delete** karo. Sync karo. Nayi row aayegi, Event `Deleted`, Deleted column mein `YES`.
6. Test receipt ko app se **Deleted entries** ke through restore kar sakte ho, ya wahin rehne do.

Teeno rows Log mein dikhni chahiye. Purani rows badli nahi honi chahiye.

---

## 8. Dikkat aaye to

| Problem | Matlab / kya karein |
|---|---|
| **403** wala message ("Firestore ne mana kar diya") | Teen mein se ek galat hai: (1) section 3 ka Google Cloud project link nahi hua, (2) is Gmail ko Firebase project mein access nahi (section 1), (3) OAuth test user mein apna email nahi joda. Teeno dobara check karo. |
| **"Cloud Firestore API has not been used in project ..."** | Script abhi bhi apne default project par chal rahi hai. **Section 3b** dobara karo (Change project, Firebase ka Project number). Phir setup dobara chalao. |
| **"Authorization required"** ya 401 | Permissions poori nahi di. **Setup** dobara chalao, Advanced se Allow karo. Ek hi Gmail se login rakho (browser mein do Gmail mix na ho). |
| **404** (project ya database nahi mila) | `CONFIG.PROJECT_ID` galat hai. Code.gs mein upar `PROJECT_ID: 'bluvia-0027'` hona chahiye. Firebase ke Project ID se match karo. |
| Koi nayi row nahi aa rahi | Triggers (⏰) mein `syncLog` hai ya nahi dekho. Nahi hai to **1. Setup** dobara chalao. Status tab mein `Last error` bhi padho. Phir **Sync now** dabao. |
| Menu "Bluvia Backup" dikhta hi nahi | Sheet reload karo. Phir bhi nahi to Apps Script mein `onOpen` function ek baar Run karo. |
| Duplicate rows dikh rahi hain | Ek hi entry ki do rows normal hain agar wo edit hui (Created aur Updated). Agar bilkul same Txn ID aur same Updated at ki do rows hain, to ek hi time par do sync chali. Ek row delete kar do. Dobara aisa ho to mujhe batao. |
| "Service invoked too many times" ya quota error | Kam hi aata hai. Thodi der baad apne aap theek ho jaata hai. Sync ka gap badhana ho to `SYNC_MINUTES` ko 15 ya 30 kar do aur setup dobara chalao. |
| "Exceeded maximum execution time" | Pehli baar bahut zyada purani entries hon to ek run poora nahi hota. Koi baat nahi. Agle runs (10 minute baad) baaki uthaa lete hain. Ya **Sync now** baar baar dabao. |

**Band karna ho (stop):**
Apps Script > Triggers (⏰) > `syncLog` aur `refreshParties` ke saamne teen dots > **Delete trigger**. Sheet mein purana data jaisa hai waisa rahega.

**Naye sire se shuru karna ho (start fresh):**
1. **Log** tab ki sab rows (header chhodkar) delete karo.
2. Apps Script > **Project Settings (⚙️)** > neeche **Script Properties**.
3. `cursor` aur `seen` dono properties delete karo.
4. **Bluvia Backup > Sync now** dabao. Poori purani history dobara Log mein aa jaayegi.

---

## 9. Safety (zaroor padho)

- **Is sheet ya Apps Script ko kisi aur ko Editor access mat do.** Script aapki Google permissions se chalti hai. Jisko script ka edit milega wo aapka **poora Firebase database** padh sakta hai. Sheet sirf dekhne (view only) ke liye kisi ko share karna ho to sirf **Viewer** do, Editor nahi.
- **Sheet ek copy hai.** Asli data app mein hai. App hi source of truth hai.
- **Kuch bhi app mein wapas nahi likha jaata.** Sheet mein badlav karne se app par asar nahi padta.
- **Weekly app backup (JSON) lena jaari rakho.** Sheet uska replacement nahi hai.
- **Koi key ya password store nahi hai.** Na sheet mein, na GitHub mein, na app mein.
- Script sirf **padhti hai** Firestore se. Wo Firestore mein kuch likhti ya delete nahi karti.

**Free plan par kharcha:** har 10 minute mein ek chhota Firestore query (sirf naye ya badle docs) plus roz ek baar parties ki list. Roz ke lagbhag kuch sau reads. Free limit 50,000 reads roz hai. Aapke daily app use ke upar bahut bahut chhota hissa hai.

---

Dikkat aaye to error ka poora message (ya Status tab ka `Last error`) mujhe bhej do.
