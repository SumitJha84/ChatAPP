import { useEffect, useState } from "react";
import { api } from "./api.js";
import Chat from "./Chat.jsx";

const TOKEN_KEY = "chatspace_token";
const SESSION_KEY = "chatspace_session";

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500 text-xl font-bold text-white shadow-sm">C</div>
      {!compact && <div><div className="text-lg font-bold tracking-tight text-slate-900">ChatSpace</div><div className="text-xs text-slate-500">A little closer, in real time.</div></div>}
    </div>
  );
}

function VisitorWelcome({ onLogin }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/api/auth/visitor", {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      });
      onLogin(result.token, result.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome-bg flex min-h-screen items-center justify-center p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
        <Brand />
        <div className="mt-9">
          <p className="text-sm font-semibold text-emerald-700">A private line to say hello</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Welcome to ChatSpace</h1>
          <p className="mt-3 leading-6 text-slate-500">Share your details once and start a private conversation with the admin.</p>
        </div>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="field-label">Full name<input required autoComplete="name" maxLength="100" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="field-input" /></label>
          <label className="field-label">Phone number<input required autoComplete="tel" maxLength="30" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" className="field-input" /></label>
          {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
          <button className="primary-button w-full" disabled={busy}>{busy ? "Starting your chat…" : "Continue to chat"}<span aria-hidden="true">→</span></button>
        </form>
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">Your conversation is private and only visible to you and the admin.</p>
        <a className="mt-5 block text-center text-sm font-medium text-slate-500 hover:text-emerald-700" href="/admin/login">Admin sign in</a>
      </section>
    </main>
  );
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/api/auth/admin", { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(result.token, result.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome-bg flex min-h-screen items-center justify-center p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
        <Brand />
        <h1 className="mt-9 text-3xl font-bold tracking-tight text-slate-900">Admin sign in</h1>
        <p className="mt-2 text-slate-500">Sign in to manage your conversations.</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="field-label">Email<input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" placeholder="you@example.com" /></label>
          <label className="field-label">Password<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" placeholder="Your password" /></label>
          {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
          <button className="primary-button w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span aria-hidden="true">→</span></button>
        </form>
        <a className="mt-5 block text-center text-sm font-medium text-slate-500 hover:text-emerald-700" href="/">← Back to ChatSpace</a>
      </section>
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const [checking, setChecking] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const adminPath = window.location.pathname.startsWith("/admin");

  function login(nextToken, nextSession) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setToken(nextToken);
    setSession(nextSession);
    window.history.replaceState({}, "", nextSession.role === "admin" ? "/admin" : "/");
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setToken(null);
    setSession(null);
    window.history.replaceState({}, "", adminPath ? "/admin/login" : "/");
  }

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    api("/api/auth/me", { token })
      .then((freshSession) => {
        setSession(freshSession);
        localStorage.setItem(SESSION_KEY, JSON.stringify(freshSession));
        if (freshSession.role === "admin" && window.location.pathname === "/admin/login") {
          window.history.replaceState({}, "", "/admin");
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setSession(null);
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading your secure chat…</div>;
  if (token && session?.role === "admin") return <Chat token={token} session={session} onLogout={logout} />;
  if (token && session?.role === "user" && !adminPath) return <Chat token={token} session={session} onLogout={logout} />;
  if (adminPath && window.location.pathname !== "/admin/login") {
    window.history.replaceState({}, "", "/admin/login");
  }
  return adminPath ? <AdminLogin onLogin={login} /> : <VisitorWelcome onLogin={login} />;
}
