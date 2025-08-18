import React, { useEffect, useState } from "react";
import {
  initFirebase,
  observeAuth,
  signInEmailPassword,
  signUpEmailPassword,
  signInWithGoogle,
} from "./firebase";
import { FaGoogle } from "react-icons/fa";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [redirecting, setRedirecting] = useState(false);

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

  async function handleGoogleLogin() {
    setRedirecting(true);
    try {
      const u = await signInWithGoogle();
      if (u) {
        setUser(u);
        await chrome.storage.local.set({
          authUser: { uid: u.uid, email: u.email },
        });
      }
    } catch (e) {
      console.error("Google login failed:", e);
      setErr("Google login failed");
    } finally {
      setRedirecting(false);
    }
  }

  if (loading || redirecting) {
    return (
      <div className="w-[430px] min-h-screen flex items-center justify-center text-sm bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
        <div className="opacity-80 animate-pulse">
          {redirecting ? "Completing Google sign-in…" : "Loading…"}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-[430px] min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 p-6">
        <div className="w-full backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-8">
          {/* Title */}
          <h2 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
            AI Clipper
          </h2>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white text-gray-800 font-semibold shadow-lg hover:scale-[1.02] hover:shadow-gray-400/50 transition transform"
          >
            <FaGoogle className="text-red-500 text-lg" />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-grow h-px bg-white/20"></div>
            <span className="px-3 text-gray-400 text-sm">OR</span>
            <div className="flex-grow h-px bg-white/20"></div>
          </div>

          {/* Tabs */}
          <div className="flex gap-3 mb-6 justify-center">
            <button
              className={`px-4 py-2 rounded-xl font-medium transition ${
                mode === "login"
                  ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={`px-4 py-2 rounded-xl font-medium transition ${
                mode === "signup"
                  ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
              onClick={() => setMode("signup")}
              type="button"
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-400 shadow-sm transition"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-400 shadow-sm transition"
            />

            {err && <div className="text-red-400 text-sm">{err}</div>}

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-pink-500 to-purple-500 shadow-lg hover:scale-[1.02] hover:shadow-pink-500/50 transition transform"
            >
              {mode === "login" ? "Login" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
