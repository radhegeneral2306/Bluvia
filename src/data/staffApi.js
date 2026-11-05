// Staff records live in users/{uid}. Only the owner may write them (see firestore.rules). Nothing is deleted:
// "removing" a staff member means active=false.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { addReads } from '../lib/reads.js';
import { validateStaff, normalizeName, NAME_MAX } from '../lib/staffForm.js';

export async function listStaff() {
  const s = await getDocs(collection(db, 'users'));
  addReads(Math.max(1, s.size));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addStaff({ uid, name }) {
  const v = validateStaff({ uid, name });
  if (!v.ok) throw new Error(v.errors.uid || v.errors.name);
  const ref = doc(db, 'users', v.value.uid);
  const snap = await getDoc(ref);
  addReads(1);
  if (snap.exists()) throw new Error('Yeh UID pehle se list mein hai.');
  await setDoc(ref, { name: v.value.name, role: 'staff', active: true, lang: 'hi', createdAt: serverTimestamp() });
}

export async function renameStaff(uid, name) {
  const n = normalizeName(name);
  if (!n) throw new Error('Naam likho.');
  if (n.length > NAME_MAX) throw new Error(`Naam ${NAME_MAX} akshar se chhota rakho.`);
  await updateDoc(doc(db, 'users', uid), { name: n });
}

export async function setStaffActive(uid, active) {
  await updateDoc(doc(db, 'users', uid), { active: !!active });
}
