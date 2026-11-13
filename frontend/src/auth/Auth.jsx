import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, AUTH_URL, clearSession, getCachedUser, getToken, saveSession } from "../lib/api.js";
import "./Auth.css";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCachedUser);

  useEffect(() => {
    if (!getToken()) return;
    api(AUTH_URL, "/me").then((r) => { saveSession(r.user); setUser(r.user); }).catch(() => {});
  }, []);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener("bmv:logout", out);
    return () => window.removeEventListener("bmv:logout", out);
  }, []);

  const start = (r) => { saveSession(r.user, r.accessToken); setUser(r.user); };
  const register = useCallback(async (email, password, fullName) =>
    start(await api(AUTH_URL, "/signup", { method: "POST", body: { email, password, fullName }, auth: false })), []);
  const login = useCallback(async (email, password) =>
    start(await api(AUTH_URL, "/login", { method: "POST", body: { email, password }, auth: false })), []);
  const logout = useCallback(() => {
    api(AUTH_URL, "/logout", { method: "POST" }).catch(() => {});
    clearSession();
    setUser(null);
  }, []);
  const updateProfile = useCallback(async (mobile, nationality) => {
    const r = await api(AUTH_URL, "/me", { method: "PUT", body: { mobile, nationality } });
    saveSession(r.user);
    setUser(r.user);
  }, []);

  const value = useMemo(() => ({ user, register, login, logout, updateProfile }), [user, register, login, logout, updateProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const stops = ["Choose a destination", "Pick a visa type", "Find a free slot", "Book the appointment", "Get your reminder"];

export function AuthForm({ mode }) {
  const { register, login } = useAuth();
  const isRegister = mode === "register";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim();
    const password = String(f.get("password") || "");
    if (isRegister) {
      if (password !== f.get("confirm")) return setError("The two passwords do not match.");
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError("Password needs at least one letter and one digit.");
    }
    setBusy(true);
    try {
      if (isRegister) await register(email, password, String(f.get("fullName") || "").trim());
      else await login(email, password);
      window.location.hash = "#/home";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main id="main" tabIndex={-1} className="auth">
      <aside className="auth-side">
        <h2>{isRegister ? "Find and book a visa slot in a few clicks" : "Pick up where you left off"}</h2>
        <p>{isRegister ? "See the free slots for your country and visa type, book one and get an email." : "Your details and bookings are saved and waiting."}</p>
        <ol className="route-art" aria-hidden="true">{stops.map((s) => <li key={s}>{s}</li>)}</ol>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <h1>{isRegister ? "Create your account" : "Log in"}</h1>
          <form onSubmit={onSubmit}>
            {isRegister && (
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" required maxLength={100} autoComplete="name" />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="pw">
                <input id="password" name="password" type={showPw ? "text" : "password"} required
                  minLength={isRegister ? 8 : undefined} autoComplete={isRegister ? "new-password" : "current-password"} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? "Hide" : "Show"}</button>
              </div>
              {isRegister && <small>At least 8 characters, with a letter and a digit.</small>}
            </div>
            {isRegister && (
              <div className="field">
                <label htmlFor="confirm">Confirm password</label>
                <input id="confirm" name="confirm" type={showPw ? "text" : "password"} required minLength={8} autoComplete="new-password" />
              </div>
            )}
            <p className="status error" role="alert">{error}</p>
            <button className="btn wide-btn" disabled={busy}>
              {busy ? (isRegister ? "Creating account…" : "Logging in…") : isRegister ? "Create account" : "Log in"}
            </button>
          </form>
          <p className="auth-switch">
            {isRegister ? <>Already have an account? <a href="#/login">Log in</a></> : <>New here? <a href="#/register">Create an account</a></>}
          </p>
        </div>
      </section>
    </main>
  );
}