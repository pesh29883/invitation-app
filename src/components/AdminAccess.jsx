import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { getToken } from "../session.js";
import Icon from "./Icon.jsx";

export default function AdminAccess({ children }) {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const userId = String(user.id);
  const token = getToken();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api("/api/me", { auth: true, signal: controller.signal })
      .then((nextUser) => {
        if (controller.signal.aborted || token !== getToken()) return;
        if (String(nextUser.id) !== userId || !["admin", "user"].includes(nextUser.role))
          throw new Error("We couldn't verify your account. Please sign in again.");
        updateUser(nextUser);
        setResult({ attempt, token, userId, allowed: nextUser.role === "admin" });
      })
      .catch((error) => {
        if (!controller.signal.aborted && token === getToken()) setResult({ attempt, token, userId, error: error.message });
      });
    return () => controller.abort();
  }, [attempt, token, userId, updateUser]);

  if (result?.attempt !== attempt || result.token !== token || result.userId !== userId)
    return <p className="muted" role="status">Checking administrator access…</p>;
  if (result.allowed) return children;

  function signInAgain() {
    logout();
    navigate("/login", { replace: true, state: { from: "/admin" } });
  }

  return <section className="card" aria-labelledby="admin-access-heading">
    <div className="empty-state">
      <span className="empty-icon"><Icon name="shield" size={30} /></span>
      <h1 id="admin-access-heading">{result.error ? "We couldn't check your access." : "Administrator access required."}</h1>
      <p className="muted">You're signed in as <strong>{user.email}</strong>.</p>
      {result.error ? <p className="form-error" role="alert">{result.error}</p> : <p className="muted">This account doesn't have administrator access on this site. If your access just changed, check again or sign in with your administrator account.</p>}
      <div className="row-actions"><button type="button" className="button" onClick={() => setAttempt((current) => current + 1)}>Check access again</button><button type="button" className="button secondary" onClick={signInAgain}>Sign in again</button></div>
      <Link to="/dashboard">Back to your dashboard</Link>
    </div>
  </section>;
}
