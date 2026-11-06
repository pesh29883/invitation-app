import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import Brand from "../components/Brand.jsx";
import Icon from "../components/Icon.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import InvitationPreview from "../components/InvitationPreview.jsx";

export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const { user, login } = useAuth();
  const { theme, onToggleTheme } = useOutletContext();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [capsLock, setCapsLock] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const update = (field) => (e) => {
    setForm((current) => ({ ...current, [field]: e.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setError("");
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const nextErrors = {};
    if (isRegister && !form.name.trim()) nextErrors.name = "Let us know what to call you.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!form.password) nextErrors.password = "Enter your password.";
    else if (isRegister && form.password.length < 8) nextErrors.password = "Choose a password with at least 8 characters.";
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length) {
      formRef.current.elements.namedItem(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    setBusy(true);
    try {
      const data = await api(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", body: { ...form, name: form.name.trim(), email: form.email.trim().toLowerCase() },
      });
      login(data.token, data.user, remember);
      const destination = location.state?.from;
      navigate(typeof destination === "string" && destination.startsWith("/") && !destination.startsWith("//") ? destination : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand />
        <div className="auth-header-actions">
          <span className="auth-header-prompt">{isRegister ? "Already part of the party?" : "A little new around here?"}</span>
          <Link className="button small secondary" to={isRegister ? "/login" : "/register"} state={location.state}>{isRegister ? "Log in" : "Join us"}<Icon name="arrow" size={15} /></Link>
          <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button>
        </div>
      </header>
      <div className="auth-layout">
        <section className="auth-story" aria-label="Bring your people together">
          <p className="eyebrow"><span className="little-star">✳</span> Life is better together</p>
          <h2>Good times start<br />with <em>an invitation.</em></h2>
          <p className="auth-story-copy">Big milestones. Small get-togethers. Make a little space for the people who matter.</p>
          <div className="invite-scene">
            <span className="scene-orbit" aria-hidden="true" />
            <span className="scene-spark scene-spark-one" aria-hidden="true">✳</span>
            <span className="scene-spark scene-spark-two" aria-hidden="true">✧</span>
            <div className="scene-paper" aria-hidden="true" />
            <InvitationPreview demo />
            <div className="scene-note"><span><Icon name="link" size={18} /></span><div>One little link.<strong>Everyone, together.</strong></div><Icon name="heart" size={17} /></div>
            <span className="scene-caption">A little preview of your next good time</span>
          </div>
          <div className="auth-benefits"><span><Icon name="check" size={14} />Make it personal</span><span><Icon name="check" size={14} />Share it simply</span><span><Icon name="check" size={14} />See who's coming</span></div>
        </section>
        <section className="auth-form-panel" aria-labelledby="auth-heading">
          <div className="auth-form-content">
            <span className="auth-welcome-icon"><Icon name={isRegister ? "sparkle" : "mail"} size={26} /></span>
            <p className="eyebrow">{isRegister ? "Your next good time awaits" : "There's a place for you here"}</p>
            <h1 id="auth-heading">{isRegister ? "Let's get together." : "Welcome back."}</h1>
            <p className="auth-form-description">{isRegister ? "Create an account. Bring your people closer." : "Your people. Your plans. All in one happy place."}</p>
            <form ref={formRef} className="stack auth-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
              {isRegister && <div className="field"><label htmlFor="auth-name">Your name</label><div className="input-wrap"><Icon name="user" size={18} className="input-icon" /><input id="auth-name" name="name" type="text" autoComplete="name" placeholder="What should we call you?" value={form.name} onChange={update("name")} required maxLength={100} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} /></div>{errors.name && <span id="name-error" className="field-error" role="alert">{errors.name}</span>}</div>}
              <div className="field">
                <label htmlFor="auth-email">Email address</label>
                <div className="input-wrap"><Icon name="mail" size={18} className="input-icon" /><input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={form.email} onChange={update("email")} required aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} /></div>
                {errors.email && <span id="email-error" className="field-error" role="alert">{errors.email}</span>}
              </div>
              <div className="field">
                <label htmlFor="auth-password">Password</label>
                <PasswordInput id="auth-password" name="password" value={form.password} onChange={update("password")} placeholder={isRegister ? "Make it a good one" : "Enter your password"} autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 8 : undefined} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : isRegister ? "password-hint" : capsLock ? "caps-hint" : undefined} onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)} />
                {errors.password ? <span id="password-error" className="field-error" role="alert">{errors.password}</span> : isRegister && <span id="password-hint" className="hint">At least 8 characters. A little longer is even better.</span>}
                {capsLock && <span id="caps-hint" className="hint" role="status">Caps Lock is on.</span>}
              </div>
              <label className="checkbox-field"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Keep me signed in</label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="button auth-submit" disabled={busy}>{busy ? <><span className="spinner" />{isRegister ? "Making room for you…" : "Signing you in…"}</> : <>{isRegister ? "Create my account" : "Log in"}<Icon name="arrow" size={19} /></>}</button>
            </form>
            <p className="auth-switch">{isRegister ? "Already have an account?" : "Your first time here?"} <Link to={isRegister ? "/login" : "/register"} state={location.state}>{isRegister ? "Come on in" : "Create an account"}<Icon name="arrow" size={14} /></Link></p>
            <div className="auth-form-footnote"><Icon name="lock" size={14} /><span>Just you, your plans, and your favorite people.</span></div>
          </div>
        </section>
      </div>
      <footer className="auth-footer"><span>A little less planning. A little more together.</span><span>Made for the moments that matter<Icon name="heart" size={13} /></span></footer>
    </div>
  );
}
