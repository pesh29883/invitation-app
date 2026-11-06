import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Brand from "../components/Brand.jsx";
import Icon from "../components/Icon.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

export default function PasswordRecovery({ reset = false }) {
  const { theme, onToggleTheme } = useOutletContext();
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") || "");
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (reset && password !== confirm) {
      setError("The passwords don't match.");
      formRef.current.elements.namedItem("confirm")?.focus();
      return;
    }
    setBusy(true);
    try {
      const data = await api(reset ? "/api/auth/reset-password" : "/api/auth/forgot-password", {
        method: "POST", body: reset ? { token, password } : { email: email.trim().toLowerCase() },
      });
      if (reset) {
        logout();
        navigate("/login", { replace: true, state: { passwordReset: true } });
      } else setMessage(data.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="auth-page recovery-page">
    <header className="auth-header"><Brand /><button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button></header>
    <section className="card recovery-card" aria-labelledby="recovery-heading">
      <span className="auth-welcome-icon"><Icon name={message ? "mail" : "lock"} size={26} /></span>
      <p className="eyebrow">A little help getting back in</p>
      <h1 id="recovery-heading">{message ? "Check your inbox." : reset ? "A fresh start." : "Forgot your password?"}</h1>
      <p className="muted">{reset ? "Choose a new password to get back to your people and plans." : "Enter your account email and we'll send you a link to reset your password."}</p>
      {message ? <div className="stack"><p className="notice" role="status">{message}</p><p className="hint">Links expire in 30 minutes. Wait a minute before requesting another email.</p><button type="button" className="button secondary" onClick={() => { setMessage(""); setError(""); }}>Try another email or resend</button></div> : reset && !validToken ? <p className="form-error" role="alert">This reset link is missing or invalid. Request a new link below.</p> : <form ref={formRef} className="stack" onSubmit={submit} aria-busy={busy}>
        {reset ? <>
          <div className="field"><label htmlFor="recovery-password">New password</label><PasswordInput id="recovery-password" name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /><span className="hint">At least 8 characters. Long, unique passwords work best.</span></div>
          <div className="field"><label htmlFor="recovery-confirm">Confirm new password</label><PasswordInput id="recovery-confirm" name="confirm" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <p className="hint">For your security, resetting your password signs out all existing sessions.</p>
        </> : <div className="field"><label htmlFor="recovery-email">Email address</label><div className="input-wrap"><Icon name="mail" size={18} className="input-icon" /><input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button auth-submit" disabled={busy}>{busy ? "One moment…" : reset ? "Save new password" : "Send reset link"}<Icon name="arrow" size={18} /></button>
      </form>}
      {reset && <Link to="/forgot-password">Request a new reset link</Link>}
      <Link className="recovery-back" to="/login"><Icon name="back" size={16} />Back to log in</Link>
    </section>
    <footer className="auth-footer"><span>A little less planning. A little more together.</span><span>Your next good time is waiting.<Icon name="heart" size={13} /></span></footer>
  </div>;
}
