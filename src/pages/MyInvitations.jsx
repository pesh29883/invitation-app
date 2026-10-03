import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDateTime } from "../api";
import { useAuth } from "../auth.jsx";

function replySummary(rsvps) {
  if (rsvps.length === 0) return "No replies yet.";
  const coming = rsvps.filter((r) => r.attending).length;
  return `${coming} coming, ${rsvps.length - coming} can't make it.`;
}

export default function MyInvitations() {
  const { logout } = useAuth();
  const [invitations, setInvitations] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    api("/api/invitations", { auth: true })
      .then(setInvitations)
      .catch((err) => {
        if (err.status === 401) logout();
        else setError(err.message);
      });
  }, [logout]);

  async function copyLink(inv) {
    const url = `${window.location.origin}/i/${inv.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function toggleOpen(inv) {
    setBusyId(inv.id);
    setError("");
    try {
      await api(`/api/invitations/${inv.id}`, {
        method: "PATCH",
        auth: true,
        body: { isOpen: !inv.is_open },
      });
      setInvitations((list) =>
        list.map((i) => (i.id === inv.id ? { ...i, is_open: !inv.is_open } : i))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(inv) {
    setBusyId(inv.id);
    setError("");
    try {
      await api(`/api/invitations/${inv.id}`, { method: "DELETE", auth: true });
      setInvitations((list) => list.filter((i) => i.id !== inv.id));
      setConfirmId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your invitations</h1>
          <p className="muted">Edit, close, or delete the invitations you've made.</p>
        </div>
        <Link to="/new" className="button">
          Create invitation
        </Link>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!invitations && !error && <p className="muted">Loading your invitations...</p>}

      {invitations && invitations.length === 0 && (
        <div className="card">
          <h2>No invitations yet</h2>
          <p className="muted">Create one and share its link to start collecting replies.</p>
        </div>
      )}

      <div className="manage-list">
        {invitations?.map((inv) => (
          <article className="card manage-item" key={inv.id}>
            <div className="manage-head">
              <div>
                <h2>{inv.title}</h2>
                <p className="meta">
                  {inv.kind} on {formatDateTime(inv.event_date)}
                </p>
              </div>
              <span className={`badge ${inv.is_open ? "yes" : "no"}`}>
                {inv.is_open ? "Open" : "Closed"}
              </span>
            </div>

            <p className="muted">{replySummary(inv.rsvps)}</p>

            <div className="row-actions">
              <button type="button" className="button small" onClick={() => copyLink(inv)}>
                {copiedId === inv.id ? "Copied" : "Copy link"}
              </button>
              <Link className="button small secondary" to={`/invitations/${inv.id}/edit`}>
                Edit
              </Link>
              <button
                type="button"
                className="button small secondary"
                disabled={busyId === inv.id}
                onClick={() => toggleOpen(inv)}
              >
                {inv.is_open ? "Close invitation" : "Reopen invitation"}
              </button>

              {confirmId === inv.id ? (
                <span className="confirm">
                  <span className="muted">Delete this invitation and its replies?</span>
                  <button
                    type="button"
                    className="button small danger"
                    disabled={busyId === inv.id}
                    onClick={() => remove(inv)}
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="button small secondary danger-text"
                  onClick={() => setConfirmId(inv.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}