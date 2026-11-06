import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import StatCard, { dailyCounts } from "../StatCard.jsx";
import Icon from "../components/Icon.jsx";
import EmptyState from "../components/EmptyState.jsx";

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
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api("/api/invitations", { auth: true, signal: controller.signal })
      .then((data) => { setInvitations(data); setError(""); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err.status === 401) logout();
        else setError(err.message);
      });
    return () => controller.abort();
  }, [logout, refreshKey]);

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
  const shown = (tab === "open" ? open : tab === "closed" ? closed : list).filter((inv) => `${inv.title} ${inv.kind} ${inv.location}`.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = { all: list.length, open: open.length, closed: closed.length };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><Icon name="mail" size={15} />A little something to look forward to</p>
          <h1>Your invitations.</h1>
          <p className="muted">All your get-togethers, beautifully in one place.</p>
        </div>
        <Link to="/new" className="button">
          <Icon name="plus" size={18} />
          Create invitation
        </Link>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}{" "}<button className="link-button" onClick={() => setRefreshKey((key) => key + 1)}>Try again</button>
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
        <div className="list-toolbar">
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
        <div className="search-box"><Icon name="search" size={17} /><input type="search" className="search-input" placeholder="Find an invitation…" aria-label="Search invitations" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        </div>

        {loading && <p className="muted" style={{ marginTop: "1rem" }}>Loading your invitations...</p>}

        {invitations && shown.length === 0 && (
          <EmptyState title={list.length === 0 ? "Your next good time starts here." : "No invitations found."} description={list.length === 0 ? "Make an invitation, share a link, and leave the rest to good company." : "Try a different search or switch to another tab."} action={list.length === 0 ? "Create your first invitation" : undefined} icon={list.length === 0 ? "mail" : "search"} />
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
                    <Icon name={copiedId === inv.id ? "check" : "link"} size={14} /><span role="status">{copiedId === inv.id ? "Copied!" : "Copy link"}</span>
                  </button>
                  <Link className="button small secondary" to={`/i/${inv.slug}`} target="_blank" rel="noreferrer">Preview</Link>
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
