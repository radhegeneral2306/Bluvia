# Staff login: step by step (Hinglish guide for the owner)

Is guide mein sab kuch click-by-click hai. Koi coding nahi chahiye.

Zaroori baat: free Firebase plan mein app ke andar se login account nahi ban sakta. Isliye login Firebase console mein hath se banta hai, phir uska UID app mein jodte hain.

---

## Pehle ye karo: rules aur app ka sahi order - Easy

Staff login naye security rules ke saath aata hai. Order galat hua to aapko khud "Access denied" dikh sakta hai.

1. **Pehle rules publish karo.** Firebase console, Firestore Database, Rules mein naya `firestore.rules` paste karo. Usme `OWNER_UID` ki jagah apna asli UID likhna zaroori hai (quotes mat hatana). Phir **Publish**.
2. **Phir naya app version aane do** (Cloudflare apne aap deploy karta hai). App mein "Naya version available hai" aaye to **Update karo** dabao.
3. **Aap ek baar naye app mein login karo, internet chalu rakhke.** Isse aapka owner record apne aap ban jata hai.
4. Uske baad hi More, Staff se staff jodo.

---

## A. Staff ka login banao (Firebase console) - Easy

1. Browser mein https://console.firebase.google.com kholo aur apne Google account se login karo.
2. Apna Bluvia project kholo.
3. Left menu mein **Build** par click karo, phir **Authentication**.
4. Upar **Users** tab kholo.
5. **Add user** button dabao.
6. **Email** mein staff ka email likho. Agar staff ke paas email nahi hai, to koi bhi banaya hua email likho, jaise `ramesh@bluvia.app`. Yeh asli email hona zaroori nahi.
7. **Password** likho (kam se kam 6 akshar, jaise `Ramesh@2468`).
8. **Add user** dabao.
9. Email aur password ek copy mein likh lo. Baad mein yeh dobara nahi dikhta.

## B. UID copy karo - Easy

1. Authentication, Users list mein naya user dikhega.
2. Uski row mein **User UID** naam ka column hai. Lamba code hota hai, jaise `k3J9aXb2...` (20 se 40 akshar).
3. UID par mouse le jao, ya double click karke poora select karo, aur copy karo.
4. Dhyan rakho: space ya aadha UID copy na ho.

## C. App mein staff jodo - Easy

1. Bluvia app kholo (owner login se).
2. Neeche **More** dabao.
3. **Staff** kholo.
4. **Staff jodo** dabao.
5. **Naam** mein staff ka naam likho.
6. **UID** mein copy kiya hua UID paste karo.
7. **Jodo** dabao. List mein staff "Active" dikhega.

Agar "UID sahi nahi" aaye, to UID dobara copy karo, shuru ya end mein space nahi hona chahiye.

## D. Staff ko app dena - Easy

1. Staff ko 3 cheezein do: app ka link, email, password.
2. Staff apne phone ke browser mein link kholega aur email + password se login karega.
3. Phone par app jaisa chalane ke liye: Android Chrome mein teen dots, phir **Add to Home screen**. iPhone Safari mein Share button, phir **Add to Home Screen**.
4. Pehli baar login ke baad staff ko sirf apna kaam dikhega.

## E. Password bhool gaya ya badalna hai - Medium

Free plan mein app se password reset nahi hota. Console mein hath se karo:

1. Firebase console, Authentication, Users kholo.
2. Staff ki row ke end mein **teen dots** dabao.
3. **Reset password** chuno. Agar staff ka asli email hai to usse reset link jayega.
4. Agar email asli nahi hai (jaise `ramesh@bluvia.app`), to doosra tareeka: teen dots se **Delete account** karo, phir A se dobara naya login banao (naya password), naya UID copy karo.
5. Naya UID aaya hai to app mein purane staff ko **Block** karo aur naye UID se **Staff jodo** karo. Purani entries purane naam se hi rehti hain.

## F. Staff ko hatana ya phone kho gaya - Medium

Do taale lagao, dono zaroori hain:

1. App mein: **More, Staff**, us staff ki row par **Block** dabao, confirm karo. Us staff ko "Account band hai" screen dikhegi (agle action ya app dobara kholne par) aur woh kuch dekh ya likh nahi payega.
2. Firebase console mein: **Authentication, Users**, staff ki row ke teen dots, **Disable account**. Yeh doosra taala hai, taaki login hi na chale.

Wapas chalu karna ho to dono jagah ulta karo: app mein **Unblock**, console mein **Enable account**.

## G. Staff kya kar sakta hai, kya nahi

Kar sakta hai:
- Naye bill banana
- Receipt (paisa mila) likhna
- Jar entry likhna
- Apna banaya hua bill pehle 1 ghante ke andar edit karna

Nahi kar sakta:
- Receipt edit karna
- Doosre ka bill edit karna, ya 1 ghante ke baad edit karna
- Settings, Backup, Deleted, Staff screen dekhna
- Staff jodna ya hatana

## H. Sach batayein: kya limit hai

- Rules yeh rokte hain ki phone kya likh sakta hai (jaise staff settings nahi badal sakta). Lekin rules yeh **sabit nahi kar sakte ki likhe gaye number sahi hain**. Staff galat amount daal sakta hai.
- Isliye har hafte ek baar:
  1. **Changes** screen dekho: kisne kya badla.
  2. **Recalculate** chalao: sab balance dobara jod kar check hota hai.
- Kisi par shak ho to us staff ko turant Block karo (F dekho).
