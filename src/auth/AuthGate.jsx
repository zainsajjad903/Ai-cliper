import React, { useEffect, useState } from "react";
import {
  initFirebase,
  observeAuth,
  signInEmailPassword,
  signUpEmailPassword,
} from "./firebase";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    initFirebase();
    const unsub = observeAuth(async (u) => {
      setUser(u || null);
      setLoading(false);
      try {
        await chrome.storage.local.set({
          authUser: u ? { uid: u.uid, email: u.email } : null,
        });
      } catch {}
    });
    return () => unsub && unsub();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      if (mode === "login") {
        await signInEmailPassword(email.trim(), password);
      } else {
        await signUpEmailPassword(email.trim(), password);
      }
    } catch (e) {
      setErr(e?.message || "Authentication failed");
    }
  }

  if (loading) {
    return (
      <div className="p-5 w-[430px] min-h-screen flex items-center justify-center text-sm">
        <div className="opacity-70">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-5 w-[430px] text-sm bg-gradient-to-br from-gray-50 to-white min-h-screen rounded-2xl shadow-xl border border-gray-200">
        <h2 className="text-2xl font-bold mb-4">AI Clipper</h2>

        <div className="mb-3 flex gap-2">
          <button
            className={`rounded-2xl border px-3 py-2 ${
              mode === "login" ? "bg-gray-100" : ""
            }`}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={`rounded-2xl border px-3 py-2 ${
              mode === "signup" ? "bg-gray-100" : ""
            }`}
            onClick={() => setMode("signup")}
            type="button"
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            type="email"
            required
            className="w-full rounded-2xl border px-3 py-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className="w-full rounded-2xl border px-3 py-2"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <div className="text-red-600 text-xs">{err}</div>}

          <button type="submit" className="w-full rounded-2xl border px-3 py-2">
            {mode === "login" ? "Login" : "Create account"}
          </button>
        </form>

        <p className="text-xs opacity-70 mt-3">
          Auth sirf sign-in ke liye hai. Clips/Projects{" "}
          <b>sirf Chrome local storage</b> me rehte hain — Firebase database me
          kuch save nahi hota.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
