import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBDMCgjta6lwwBMc-9hfr7jEFZ1Gi3_vTo",
  authDomain: "crome-extention-47da2.firebaseapp.com",
  projectId: "crome-extention-47da2",
  storageBucket: "crome-extention-47da2.firebasestorage.app",
  messagingSenderId: "1077997612340",
  appId: "1:1077997612340:web:de9d745c01f46dc8430961",
  measurementId: "G-V10L7B7WS5",
};

let _auth;

export function initFirebase() {
  if (!getApps().length) initializeApp(firebaseConfig);
  const auth = getAuth();
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  _auth = auth;
  return auth;
}

export function getFirebaseAuth() {
  return _auth || initFirebase();
}

export function observeAuth(cb) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, (user) => cb(user));
}

export async function signUpEmailPassword(email, password) {
  const auth = getFirebaseAuth();
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  return user;
}
export async function signInEmailPassword(email, password) {
  const auth = getFirebaseAuth();
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
}
export async function signOutUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}
