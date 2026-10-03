import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import StatCard, { dailyCounts } from "../StatCard.jsx";

const TABS = [
  ["all", "All"],
  ["yes", "Coming"],
  ["no", "Can't make it"],
];

function Message({ message }) {
  if (!message.text) return null;
  return message.type === "error" ? (
    <p className="form-error" role="alert">
      {message.text}
    </p>
  ) : (
    <p className="notice" role="status">
      {message.text}
    </p>
  );
}

function initialsOf(name) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();

  const [invitations, setInvitations] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [tab, setTab] = useState("all");

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [detailsMessage, setDetailsMessage] = useState({ type: "", text: "" });
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordMessage, setPasswordMessage] = useState({ type: "", text: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    api("/api/invitations", { auth: true })
      .then(setInvitations)
      .catch((err) => {
        if (err.status === 401) logout();
        else setStatsError(true);
      });
  }, [logout]);

  const emailChanged = email.trim().toLowerCase() !== user.email;

  async function saveDetails(e) {
    e.preventDefault();
    setDetailsMessage({ type: "", text: "" });
    setDetailsBusy(true);
    try {
      const updated = await api("/api/me", {
        method: "PATCH",
        auth: true,
        body: { name, email, currentPassword: emailPassword },
      });
      updateUser(updated);
      setName(updated.name);
      setEmail(updated.email);
      setEmailPassword("");
      setDetailsMessage({ type: "ok", text: "Your profile is saved." });
    } catch (err) {
      setDetailsMessage({ type: "error", text: err.message });
    } finally {
      setDetailsBusy(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPasswordMessage({ type: "", text: "" });
    if (passwords.next !== passwords.confirm) {
      setPasswordMessage({ type: "error", text: "The new passwords don't match." });
      return;
    }
    setPasswordBusy(true);
    try {
      await api("/api/me/password", {
        method: "PATCH",
        auth: true,
        body: { currentPassword: passwords.current, newPassword: passwords.next },
      });
      setPasswords({ current: "", next: "", confirm: "" });
      setPasswordMessage({ type: "ok", text: "Your password has been changed." });
    } catch (err) {
      setPasswordMessage({ type: "error", text: err.message });
    } finally {
      setPasswordBusy(false);
    }
  }

  const setPassword = (field) => (e) =>
    setPasswords((p) => ({ ...p, [field]: e.target.value }));

  // Numbers for the stat cards and the recent replies list
  const loading = invitations === null && !statsError;
  const list = invitations ?? [];
  const replies = list
    .flatMap((inv) => inv.rsvps.map((r) => ({ ...r, title: inv.title })))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const coming = replies.filter((r) => r.attending);
  const declined = replies.filter((r) => !r.attending);
  const pct = (n) => (replies.length ? Math.round((n / replies.length) * 100) : 0);
  const openCount = list.filter((i) => i.is_open).length;
  const shown = (tab === "yes" ? coming : tab === "no" ? declined : replies).slice(0, 8);
  const dash = (value) => (loading || statsError ? "-" : value);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your profile</h1>
          <p className="muted">Reply notifications are sent to your email address.</p>
        </div>
      </div>

      <div className="profile-layout">
        <section className="card profile-card">
          <div className="avatar" aria-hidden="true">
            {initialsOf(user.name)}
          </div>
          <h2>{user.name}</h2>
          <span className="tag">Host</span>
          <div>
            <Link to="/new" className="button">
              Create invitation
            </Link>
          </div>

          <dl className="info-list">
            <div className="info-box">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="info-box">
              <dt>Invitations</dt>
              <dd>{loading || statsError ? "-" : `${list.length} total, ${openCount} open`}</dd>
            </div>
            <div className="info-box">
              <dt>Notifications</dt>
              <dd>Replies are emailed to you</dd>
            </div>
          </dl>
        </section>

        <div className="profile-main">
          <div className="stat-row">
            <StatCard
              label="All replies"
              value={dash(replies.length)}
              chip={statsError ? "Couldn't load your stats." : `across ${list.length} invitations`}
              series={dailyCounts(replies)}
            />
            <StatCard
              tone="good"
              label="Coming"
              value={dash(coming.length)}
              chip={`${pct(coming.length)}% of replies`}
              series={dailyCounts(replies, (r) => r.attending)}
            />
            <StatCard
              tone="danger"
              label="Can't make it"
              value={dash(declined.length)}
              chip={`${pct(declined.length)}% of replies`}
              series={dailyCounts(replies, (r) => !r.attending)}
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
                  {label}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="muted" style={{ marginTop: "1rem" }}>
                {loading
                  ? "Loading your replies..."
                  : replies.length === 0
                    ? "No replies yet. Share an invitation link to get started."
                    : "No replies in this tab."}
              </p>
            ) : (
              <ul className="rows">
                {shown.map((r) => {
                  const date = new Date(r.createdAt);
                  return (
                    <li className="reply-row" key={`${r.id}-${r.createdAt}`}>
                      <div className="row-date">
                        <strong>{date.getDate()}</strong>
                        <span>{date.toLocaleDateString("en-US", { month: "short" })}</span>
                      </div>
                      <div className="row-main">
                        <h2>{r.guestName}</h2>
                        <p>{r.title}</p>
                      </div>
                      <span className={`badge ${r.attending ? "yes" : "no"}`}>
                        {r.attending ? "Coming" : "Can't make it"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="profile-grid">
        <section className="card">
          <h2>Your details</h2>
          <form className="stack" onSubmit={saveDetails} noValidate>
            <label className="field">
              <span>Name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>

            {emailChanged && (
              <label className="field">
                <span>Current password</span>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                />
                <span className="hint">Needed to confirm it's you before changing your email.</span>
              </label>
            )}

            <Message message={detailsMessage} />

            <button type="submit" className="button" disabled={detailsBusy}>
              Save changes
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Change password</h2>
          <form className="stack" onSubmit={savePassword} noValidate>
            <label className="field">
              <span>Current password</span>
              <input
                type="password"
                value={passwords.current}
                onChange={setPassword("current")}
              />
            </label>

            <label className="field">
              <span>New password</span>
              <input type="password" value={passwords.next} onChange={setPassword("next")} />
              <span className="hint">At least 8 characters.</span>
            </label>

            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={passwords.confirm}
                onChange={setPassword("confirm")}
              />
            </label>

            <Message message={passwordMessage} />

            <button type="submit" className="button" disabled={passwordBusy}>
              Change password
            </button>
          </form>
        </section>
      </div>
    </>
  );
}