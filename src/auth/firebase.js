import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";

// Firestore imports
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// 🔧 Tumhara Firebase config
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
let _db;

export function initFirebase() {
  if (!getApps().length) initializeApp(firebaseConfig);
  const auth = getAuth();
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  _auth = auth;

  // Init Firestore
  _db = getFirestore();
  return auth;
}

export function getFirebaseAuth() {
  return _auth || initFirebase();
}

export function getFirestoreDb() {
  if (!_db) initFirebase();
  return _db;
}

// ================= Firestore test save =================
export async function saveClipToFirestore(clip) {
  try {
    initFirebase();
    const db = getFirestoreDb();
    await addDoc(collection(db, "clips_test"), {
      ...clip,
      createdAt: serverTimestamp(),
    });
    console.log("[AI Clipper] Clip saved to Firestore (test)");
  } catch (err) {
    console.error("[AI Clipper] Firestore save failed:", err);
  }
}

// ================= Auth helpers =================
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

// ================= Google Sign-in (Chrome Extension Safe) =================
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle() {
  const clientId =
    "1077997612340-et8a5u4k06t2o8r3b31kekdm2b37lbg9.apps.googleusercontent.com";

  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=email%20profile`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          console.error("Auth error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        if (redirectUrl) {
          const params = new URL(redirectUrl).hash.substring(1);
          const accessToken = new URLSearchParams(params).get("access_token");

          if (accessToken) {
            try {
              const credential = GoogleAuthProvider.credential(
                null,
                accessToken
              );
              const userCred = await signInWithCredential(
                getFirebaseAuth(),
                credential
              );
              resolve(userCred.user);
            } catch (e) {
              console.error("Firebase sign-in error:", e);
              reject(e);
            }
          } else {
            reject("No access token found");
          }
        } else {
          reject("No redirect URL");
        }
      }
    );
  });
}
