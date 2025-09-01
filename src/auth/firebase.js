// ================= Firebase Config =================
const firebaseConfig = {
  apiKey: "AIzaSyBDMCgjta6lwwBMc-9hfr7jEFZ1Gi3_vTo",
  authDomain: "crome-extention-47da2.firebaseapp.com",
  projectId: "crome-extention-47da2",
  storageBucket: "crome-extention-47da2.appspot.com",
  messagingSenderId: "1077997612340",
  appId: "1:1077997612340:web:de9d745c01f46dc8430961",
};

const PROJECT_ID = firebaseConfig.projectId;

// ================= Firestore Save Clip (REST API) =================
export async function saveClipToFirestore(clip) {
  const { authUser } = await chrome.storage.local.get("authUser");
  if (!authUser?.idToken) {
    console.warn("[AI Clipper] Not logged in, skipping Firestore save");
    return;
  }

  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/clips_test`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authUser.idToken}`,
        },
        body: JSON.stringify({
          fields: {
            id: { stringValue: clip.id },
            url: { stringValue: clip.url },
            selectedText: { stringValue: clip.selectedText },
            summary: { stringValue: clip.summary || "" },
            projectId: { stringValue: clip.projectId || "" },
            ownerUid: { stringValue: clip.ownerUid || "" },
            ownerEmail: { stringValue: clip.ownerEmail || "" },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    console.log("[AI Clipper] Clip saved (REST)", data);
  } catch (err) {
    console.error("[AI Clipper] Firestore save failed:", err);
  }
}

// ================= Auth Helpers (REST Only) =================
export async function signUpEmailPassword(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await res.json();
  if (data.error) {
    console.error("Signup error:", data.error);
    throw new Error(data.error.message);
  }

  const authUser = {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
  };
  await chrome.storage.local.set({ authUser });
  return authUser;
}

export async function signInEmailPassword(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await res.json();
  if (data.error) {
    console.error("Signin error:", data.error);
    throw new Error(data.error.message);
  }

  const authUser = {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
  };
  await chrome.storage.local.set({ authUser });
  return authUser;
}

export async function signOutUser() {
  await chrome.storage.local.set({ authUser: null });
}

// ================= Observe Auth =================
export async function observeAuth(cb) {
  const { authUser } = await chrome.storage.local.get("authUser");
  cb(authUser || null);
}

// ================= Google Sign-in (Chrome Extension Safe, REST Exchange) =================
export async function signInWithGoogle() {
  const clientId =
    "1077997612340-et8a5u4k06t2o8r3b31kekdm2b37lbg9.apps.googleusercontent.com";
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`; // used for WebAuthFlow
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=email%20profile`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!redirectUrl) return reject("No redirect URL");

        const params = new URL(redirectUrl).hash.substring(1);
        const accessToken = new URLSearchParams(params).get("access_token");
        if (!accessToken) return reject("No access token");

        try {
          const res = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                postBody: `access_token=${accessToken}&providerId=google.com`,
                // ⚠️ Must be a valid HTTPS URL for Firebase — use dummy if needed
                requestUri: "http://localhost",
                returnIdpCredential: true,
                returnSecureToken: true,
              }),
            }
          );

          const data = await res.json();
          if (data.error) {
            console.error("Google login error:", data.error);
            throw new Error(data.error.message);
          }

          const authUser = {
            uid: data.localId,
            email: data.email,
            idToken: data.idToken,
          };
          await chrome.storage.local.set({ authUser });
          resolve(authUser);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}
