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
- **Status** tab: last sync kab hua, aur **Sync health** (OK ya STALE).
- Koi password ya key kahin store nahi hoti. Script aapke apne Google login se chalti hai.
- Rows 1000 ke upar bhi chalti hain: script khud rows aur columns badha leti hai. Ek Google Sheet mein lagbhag 10 million cells aate hain, jo saalon ke liye kaafi hai.

**NAHI deta (seedhi baat):**
- Sirf **ek taraf**: app se sheet. Sheet mein kuch badloge to app mein kuch nahi badlega. Kabhi nahi.
- **Lagbhag 10 minute ki delay.** Entry banate hi sheet mein nahi aati. Turant chahiye to menu se "Sync now".
- **Edit ya delete karne par purani row nahi badalti.** Nayi row judti hai: Event column mein `Created`, `Updated` ya `Deleted` likha hota hai. Purani row jaisi thi waisi rehti hai (isse history bachti hai).
- **Parties aur Daily tab roz sirf ek baar** (raat 2 baje) puri tarah naye sire se bante hain. Beech mein chahiye to menu se "Refresh parties and daily summary".
- `Created` tab likha jaata hai jab entry ka banne ka aur badalne ka time bilkul ek jaisa ho. Koi bhi edit, ek second baad bhi, `Updated` likhega.
- Jo entries **backup file se restore** hui hain, unka purana timestamp wapas aata hai. Isliye wo Log mein dobara nahi aati (wo pehle hi Log mein aa chuki thi).
- Ye sheet ek **copy** hai. Asli data app mein hai. Weekly app ka JSON backup lena band mat karna.

---

## 1. Pehle ye check karo (zaroori)

Script aapke Google account se Firebase database padhegi. To **jis Google account se aap sheet kholte ho, wahi account Firebase project mein bhi hona chahiye.**

1. https://console.firebase.google.com kholo. Project `bluvia-0027` chuno.
2. Upar left mein **gear icon > Project settings > Users and permissions** par jao.
3. Dekho ki aapka email list mein hai ya nahi, aur role **Owner** ya **Editor** ya **Viewer** hai.
4. Agar aap Firebase aur sheet **dono ke liye ek hi Gmail** use karte ho, to kuch karna nahi hai. Agla step.
5. Agar sheet wala Gmail alag hai: **Add member** dabao, wo email daalo aur role kam se kam **Viewer** do (Google Cloud mein ye "Cloud Datastore Viewer" jaisa kaam karta hai). Phir **Add member**.

Kya galat ho sakta hai: email alag hai aur add nahi kiya. Tab baad mein "403" error aayega.

---

## 2. Script sheet mein paste karo

1. Sheet kholo (upar wala link).
2. Menu: **File > Settings**. **Time zone** mein **(GMT+05:30) India Standard Time** chuno aur **Save and reload** dabao. Isse dates kabhi ek din aage peeche nahi hongi.
3. Menu: **Extensions > Apps Script**. Ek naya tab khulega.
4. Left mein `Code.gs` file dikhegi. Uska poora purana text **select all** karke delete kar do.
5. Repo ki file `integrations/google-sheet/Code.gs` kholo (GitHub par), poora text copy karo, aur Apps Script mein paste karo.
6. Upar **Save** icon dabao ya `Ctrl + S`.
7. Left mein neeche **Project Settings (gear icon)** dabao.
8. **"Show 'appsscript.json' manifest file in editor"** ke saamne tick lagao.
9. Left mein wapas **Editor (`< >` icon)** par aao. Ab `appsscript.json` naam ki file dikhegi. Use kholo.
10. Uska poora purana text delete karke repo ki file `integrations/google-sheet/appsscript.json` ka text paste karo. Save karo.

Kya galat ho sakta hai: purana text poora delete nahi kiya aur do script mil gayi. Save karte waqt "syntax error" aayega. Phir se poora delete karke paste karo.

---

## 3. Setup chalao (pehle seedha, bina Google Cloud ke)

Script pehle Firebase project `bluvia-0027` ko seedha call karti hai. Zyadatar cases mein **Google Cloud project jodne ki zaroorat nahi padti**. Isliye pehle seedha setup chalao.

1. Apni Google Sheet wale tab par jao aur **page reload** karo (`F5`).
2. 5 se 10 second baad menu bar mein ek naya menu **Bluvia Backup** aayega.
3. **Bluvia Backup > 1. Setup (first time)** dabao.
4. Google permissions maangega. Ye normal hai:
   - **Authorization required** aaye to **Continue** dabao. Apna Gmail chuno.
   - Screen aayegi **"Google hasn't verified this app"**. Ghabrao mat. Ye script aapne khud banai hai (aap hi ki hai), isliye Google ne use verify nahi kiya. Ye warning isi wajah se aati hai.
   - **Advanced** dabao. Phir **Go to Untitled project (unsafe)** (ya project ka naam) dabao.
   - Jo permissions dikhengi unhe **Allow** karo (sheet padhna/likhna, Firestore data padhna, trigger banana).
5. Allow ke baad kabhi kabhi setup apne aap nahi chalta. Aisa ho to dobara **Bluvia Backup > 1. Setup (first time)** dabao.
6. Thodi der baad ek alert aayega: **"Connection OK. Business: ..."**, phir **"Setup complete. Auto sync runs every 10 minutes. See the Status tab."**

Alert aa gaya? **Section 4 skip karo** aur seedha section 5 par jao.

Error aaya? Agar message mein **Firestore API**, **403**, **SERVICE_DISABLED** ya **"Firestore ne mana kar diya"** likha hai, to section 4 karo. Koi aur error ho to section 7 dekho.

---

## 4. FALLBACK: Script ko Firebase ke Google Cloud project se jodo

**Ye step sirf tab karo jab section 3 mein 403 / Firestore API / SERVICE_DISABLED / "Firestore ne mana kar diya" error aaya.** Warna isko chhod do.

**4a. Project number nikalo**
1. Firebase console mein **Project settings > General** par jao.
2. **Project number** (sirf numbers, jaise `123456789012`) copy karo. Ye **Project ID** (`bluvia-0027`) se alag hai.

**4b. Apps Script mein lagao**
1. Apps Script tab mein **Project Settings (gear)** kholo.
2. Neeche **Google Cloud Platform (GCP) Project** section dhundo.
3. **Change project** dabao.
4. Project number paste karo aur **Set project** dabao.

**4c. Agar Google OAuth consent screen maange** (pehli baar aksar maangta hai)
1. https://console.cloud.google.com kholo. Upar project selector mein `bluvia-0027` chuno.
2. Left menu: **APIs and Services > OAuth consent screen**.
3. **Get started** ya **Configure** dabao. App name `Bluvia Backup` likho. Support email apna daalo.
4. **Audience / User type: External** chuno. Developer contact email apna daalo. Save karo.
5. **Audience** (ya **Test users**) mein jao. **Add users** dabao aur **apna Gmail** daalo. Save karo.
6. **Zaroori:** wahin **Publishing status** ko **In production** karo (**Publish app** dabao). Unverified app ek hi user (aap) ke liye theek hai. **Testing** status mein rakha to Google **7 din baad permission cancel kar deta hai** aur sync chupchaap ruk jaata hai.
7. Wapas Apps Script mein jao aur 4b dobara karo (**Change project**, number paste, **Set project**).

**4d. Firestore API check karo**
App Firestore use karti hai, isliye ye pehle se ON hona chahiye. Phir bhi: Google Cloud console > **APIs and Services > Enabled APIs**. Wahan **Cloud Firestore API** dikhni chahiye. Nahi dikhe to **Enable APIs and Services** dabao, "Cloud Firestore API" search karo aur **Enable** karo.

Phir wapas section 3 ka step 3 karo (**1. Setup (first time)**).

---

## 5. Check karo ki sab bana ya nahi

Sheet ke neeche 4 tabs dikhne chahiye:

| Tab | Kya hona chahiye |
|---|---|
| **Log** | Upar header row, neeche aapki puri purani entries (pehli baar sab ek saath aati hain) |
| **Parties** | Har party ek row: naam, phone, baaki, deposit, jars |
| **Daily** | Roz ki sales, collection, bills |
| **Status** | `Last result` = **OK**, `Last log sync` mein abhi ka time, `Sync health` = **OK** |

**Log tab ke money columns (rupees mein):**
- **Billed (Rs):** bill ka total.
- **Received (Rs):** receipt ka amount.
- **Adjustment (Rs):** manual adjustment entry (plus ya minus). Deposit se dues kaatne wali entry bhi yahin **minus** mein dikhti hai.
- **Deposit change (Rs):** deposit liya to plus. Deposit wapas diya ya dues mein adjust kiya to minus.
- **Discount (Rs)** aur **Extra charge (Rs)** bills ke liye alag columns mein hain.

**Sync health:** Status tab ki ye line **OK** dikhaye to sab theek. **STALE (sync stopped)** dikhaye to sync ruk gaya hai (section 7 dekho). **Hafte mein ek baar Status tab zaroor kholo.**

**Triggers aur failure alert:**
1. Apps Script mein left mein **Triggers (clock icon)** kholo. Do triggers dikhne chahiye: `syncLog` (har 10 minute) aur `refreshParties` (roz raat 2 se 3 ke beech).
2. `syncLog` ke saamne teen dots (ya pencil) dabao, **Edit trigger** kholo.
3. **Failure notification settings** mein **Notify me immediately** chuno aur **Save** karo. Ab sync fail hua to Google aapko email bhej dega.

**Pehle sync ke baad ye check karo:**
1. Status mein `Last result` = **OK** hai.
2. Log mein app ki **har entry ke liye ek row** hai.
3. **Parties** tab ka baaki, deposit aur jars app ki Parties screen se milte hain (2 se 3 parties khol kar dekho).
4. **Daily** tab mein aaj ki sales aur collection app ke Dashboard se milti hain.

---

## 6. Asli test karo (5 minute)

1. App mein ek test receipt banao (chhota amount, note mein "test").
2. Sheet mein **Bluvia Backup > Sync now** dabao (ya 10 minute ruko).
3. **Log** tab ke neeche nayi row aani chahiye: Type `Receipt`, Event `Created`.
4. Kam se kam 5 second ruko. App mein wahi receipt **edit** karo (amount badlo). Sync karo. Nayi row aayegi, Event `Updated`.
5. App mein wo receipt **delete** karo. Sync karo. Nayi row aayegi, Event `Deleted`, Deleted column mein `YES`.
6. Test receipt ko app se **Deleted entries** ke through restore kar sakte ho, ya wahin rehne do.

Teeno rows Log mein dikhni chahiye. Purani rows badli nahi honi chahiye.

---

## 7. Dikkat aaye to

| Problem | Matlab / kya karein |
|---|---|
| **403** wala message ("Firestore ne mana kar diya") | Teen mein se ek galat hai: (1) section 4 ka Google Cloud project link nahi hua, (2) is Gmail ko Firebase project mein access nahi (section 1), (3) OAuth consent screen mein test user ya publishing status galat hai (section 4c). Teeno dobara check karo. |
| **"Cloud Firestore API has not been used in project ..."** / **SERVICE_DISABLED** | Script abhi bhi apne default project par chal rahi hai. **Section 4 (4a, 4b)** karo. Phir setup dobara chalao. |
| Sync kuch din tak chala, phir ruk gaya. `Sync health` = **STALE** | Zyadatar wajah: OAuth consent screen **Testing** status mein hai aur 7 din baad permission cancel ho gayi. Section 4c ka step 6 karo (**In production**), phir **1. Setup (first time)** dobara chalao aur permission dobara **Allow** karo. |
| **"Authorization required"** ya 401 | Permissions poori nahi di. **Setup** dobara chalao, Advanced se Allow karo. Ek hi Gmail se login rakho (browser mein do Gmail mix na ho). |
| **404** (project ya database nahi mila) | `CONFIG.PROJECT_ID` galat hai. Code.gs mein upar `PROJECT_ID: 'bluvia-0027'` hona chahiye. Firebase ke Project ID se match karo. |
| Koi nayi row nahi aa rahi | Triggers (clock icon) mein `syncLog` hai ya nahi dekho. Nahi hai to **1. Setup** dobara chalao. Status tab mein `Last error` bhi padho. Phir **Sync now** dabao. |
| Menu "Bluvia Backup" dikhta hi nahi | Sheet reload karo. Phir bhi nahi to Apps Script mein `onOpen` function ek baar Run karo. |
| Duplicate rows dikh rahi hain | Ek hi entry ki do rows normal hain agar wo edit hui (Created aur Updated). Agar bilkul same Txn ID aur same Updated at ki do rows hain, to ek hi time par do sync chali. Ek row delete kar do. Dobara aisa ho to mujhe batao. |
| "Service invoked too many times" ya quota error | Kam hi aata hai. Thodi der baad apne aap theek ho jaata hai. Sync ka gap badhana ho to `SYNC_MINUTES` ko 15 ya 30 kar do aur setup dobara chalao. |
| "Exceeded maximum execution time" | Pehli baar bahut zyada purani entries hon to ek run poora nahi hota. Koi baat nahi. Agle runs (10 minute baad) baaki uthaa lete hain. Ya **Sync now** baar baar dabao. |

**Band karna ho (stop):**
Apps Script > Triggers (clock icon) > `syncLog` aur `refreshParties` ke saamne teen dots > **Delete trigger**. Sheet mein purana data jaisa hai waisa rahega.

**Naye sire se shuru karna ho (start fresh):**
1. **Log** tab ki sab rows (header chhodkar) delete karo.
2. Apps Script > **Project Settings (gear)** > neeche **Script Properties**.
3. `cursor` aur `seen` dono properties delete karo.
4. **Bluvia Backup > Sync now** dabao. Poori purani history dobara Log mein aa jaayegi.

---

## 8. Safety (zaroor padho)

- **Is sheet ya Apps Script ko kisi aur ko Editor access mat do.** Script aapki Google permissions se chalti hai. Jisko script ka edit milega wo aapka **poora Firebase database** padh sakta hai. Sheet sirf dekhne ke liye kisi ko share karna ho to sirf **Viewer** do, Editor nahi.
- **Sheet ek copy hai.** Asli data app mein hai. App hi source of truth hai.
- **Kuch bhi app mein wapas nahi likha jaata.** Sheet mein badlav karne se app par asar nahi padta.
- **Weekly app backup (JSON) lena jaari rakho.** Sheet uska replacement nahi hai.
- **Koi key ya password store nahi hai.** Na sheet mein, na GitHub mein, na app mein.
- Script sirf **padhti hai** Firestore se. Wo Firestore mein kuch likhti ya delete nahi karti.

**Free plan par kharcha:** har 10 minute mein ek chhota Firestore query (sirf naye ya badle docs) plus roz ek baar parties ki list. Roz ke lagbhag kuch sau reads. Free limit 50,000 reads roz hai. Aapke daily app use ke upar bahut bahut chhota hissa hai.

---

Dikkat aaye to error ka poora message (ya Status tab ka `Last error`) mujhe bhej do.

## 9. Naya: Area column (Area tag ke baad)

App mein ab party ko **Area** diya ja sakta hai. Sheet mein bhi ye dikhega, lekin uske liye script ka naya version chahiye.

1. **Area column naya hai; Code.gs naya version paste karna padega:** Sheet mein Extensions, phir Apps Script kholo. Purane `Code.gs` ka **poora text hata kar** naya `Code.gs` paste karo, **Save** dabao, phir sheet ke menu se **Bluvia Backup, phir Sync now** dabao. `appsscript.json` badalna nahi hai.
2. **Parties tab:** `Address` ke baad `Area` column aayega (Refresh parties and daily summary dabane par, ya raat 2 baje).
3. **Log tab:** `Area` naya column hai jo sheet ke **dahine (right) side** mein jud jaata hai. **Purani rows mein Area khali rahega** (unhe badla nahi jaata, kyunki Log sirf aage badhta hai). Nayi rows mein party ka area likha aayega. Entry mein area store nahi hota, isliye ye us waqt ka area hai jab entry sheet mein likhi gayi.
4. Area ki jaankari ke liye script har 10 minute mein parties ki list dobara nahi padhti. Sirf tab padhti hai jab koi nayi entry likhni ho aur pichhle 10 minute mein list padhi na gayi ho, to free limit par asar bahut kam hai.
5. Party ka area badalne par Log ki purani rows nahi badalti. Naya area agli nayi entry se dikhega.
