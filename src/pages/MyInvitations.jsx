import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import StatCard, { dailyCounts } from "../StatCard.jsx";

const TABS = [
  ["all", "All"],
  ["open", "Open"],
  ["closed", "Closed"],
];

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
  const [tab, setTab] = useState("all");

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

  const loading = invitations === null && !error;
  const list = invitations ?? [];
  const open = list.filter((i) => i.is_open);
  const closed = list.filter((i) => !i.is_open);
  const repliesOf = (items) => items.flatMap((i) => i.rsvps);
  const pct = (n) => (list.length ? Math.round((n / list.length) * 100) : 0);
  const shown = tab === "open" ? open : tab === "closed" ? closed : list;
  const counts = { all: list.length, open: open.length, closed: closed.length };

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

      <div className="stat-row" style={{ marginBottom: "1rem" }}>
        <StatCard
          label="All invitations"
          value={loading ? "-" : list.length}
          chip={`${repliesOf(list).length} replies in total`}
          series={dailyCounts(repliesOf(list))}
        />
        <StatCard
          tone="good"
          label="Open"
          value={loading ? "-" : open.length}
          chip={`${pct(open.length)}% of your invitations`}
          series={dailyCounts(repliesOf(open))}
        />
        <StatCard
          tone="danger"
          label="Closed"
          value={loading ? "-" : closed.length}
          chip={`${pct(closed.length)}% of your invitations`}
          series={dailyCounts(repliesOf(closed))}
        />
      </div>

      <section className="card list-card">
        <div className="tabs-line">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="tab-line"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label} ({counts[value]})
            </button>
          ))}
        </div>

        {loading && <p className="muted" style={{ marginTop: "1rem" }}>Loading your invitations...</p>}

        {invitations && shown.length === 0 && (
          <p className="muted" style={{ marginTop: "1rem" }}>
            {list.length === 0
              ? "No invitations yet. Create one and share its link to start collecting replies."
              : "No invitations in this tab."}
          </p>
        )}

        <ul className="rows">
          {shown.map((inv) => {
            const date = new Date(inv.event_date);
            return (
              <li className="invite-row" key={inv.id}>
                <div className="row-date">
                  <strong>{date.getDate()}</strong>
                  <span>{date.toLocaleDateString("en-US", { month: "short" })}</span>
                </div>

                <div className="row-main">
                  <h2>{inv.title}</h2>
                  <p title={inv.location}>
                    {inv.kind} at{" "}
                    {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    {inv.location ? `, ${inv.location}` : ""}
                  </p>
                  <p>{replySummary(inv.rsvps)}</p>
                </div>

                <span className={`badge ${inv.is_open ? "yes" : "no"}`}>
                  {inv.is_open ? "Open" : "Closed"}
                </span>

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
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}