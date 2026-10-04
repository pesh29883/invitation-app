import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDateTime } from "../api";
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

// A playful title that grows with how many invitations you've made.
function hostTitle(count) {
  if (count >= 5) return "Event pro";
  if (count >= 3) return "Event planner";
  if (count >= 1) return "Party starter";
  return "New host";
}

function untilText(date) {
  const ms = date - new Date();
  const days = Math.floor(ms / 86400000);
  if (days >= 2) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `in ${hours} hours`;
  return "starting soon";
}

export default function Profile({ themePref, onThemePref }) {
  const { user, updateUser, logout } = useAuth();

  const [invitations, setInvitations] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [tab, setTab] = useState("all");
  const [invitationFilter, setInvitationFilter] = useState("all");

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
    .flatMap((inv) => inv.rsvps.map((r) => ({ ...r, title: inv.title, invitationId: inv.id })))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const coming = replies.filter((r) => r.attending);
  const declined = replies.filter((r) => !r.attending);
  const pct = (n) => (replies.length ? Math.round((n / replies.length) * 100) : 0);
  const openCount = list.filter((i) => i.is_open).length;
  // The list can be narrowed to one invitation; the stat cards above always cover all of them.
  const inScope =
    invitationFilter === "all"
      ? replies
      : replies.filter((r) => String(r.invitationId) === invitationFilter);
  const scoped =
    tab === "yes"
      ? inScope.filter((r) => r.attending)
      : tab === "no"
        ? inScope.filter((r) => !r.attending)
        : inScope;
  const shown = scoped.slice(0, 8);
  const dash = (value) => (loading || statsError ? "-" : value);

  // The soonest event that hasn't happened yet
  const now = new Date();
  const upcoming = list
    .filter((i) => new Date(i.event_date) > now)
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))[0];
  const upcomingComing = upcoming ? upcoming.rsvps.filter((r) => r.attending).length : 0;

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
          <div className="profile-cover" aria-hidden="true">
            <img className="cover-mascot" src="/logo.png" alt="" />
          </div>
          <div className="avatar" aria-hidden="true">
            {initialsOf(user.name)}
          </div>
          <h2>{user.name}</h2>
          <span className="tag">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {loading || statsError ? "Host" : hostTitle(list.length)}
          </span>
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
          <section className="card next-up" aria-label="Your next event">
            <div className="next-up-text">
              <p className="next-up-kicker">Next up</p>
              {loading ? (
                <h2>Checking your calendar...</h2>
              ) : statsError ? (
                <h2>Couldn't load your events.</h2>
              ) : upcoming ? (
                <>
                  <h2>{upcoming.title}</h2>
                  <p className="next-up-meta">
                    {formatDateTime(upcoming.event_date)}, {untilText(new Date(upcoming.event_date))}
                  </p>
                  <p className="next-up-meta">
                    {upcomingComing} coming so far{upcoming.is_open ? "" : " (replies closed)"}
                  </p>
                </>
              ) : (
                <>
                  <h2>Nothing coming up yet</h2>
                  <p className="next-up-meta">Plan your next get-together and share the link.</p>
                </>
              )}
              <Link to={upcoming ? "/invitations" : "/new"} className="button light">
                {upcoming ? "Manage invitations" : "Create invitation"}
              </Link>
            </div>
            <img className="next-up-mascot" src="/logo.png" alt="" />
          </section>

          <div className="stat-row">
            <StatCard
              icon="chat"
              label="All replies"
              value={dash(replies.length)}
              chip={statsError ? "Couldn't load your stats." : `across ${list.length} invitations`}
              series={dailyCounts(replies)}
            />
            <StatCard
              tone="good"
              icon="check"
              label="Coming"
              value={dash(coming.length)}
              chip={`${pct(coming.length)}% of replies`}
              series={dailyCounts(replies, (r) => r.attending)}
            />
            <StatCard
              tone="danger"
              icon="x"
              label="Can't make it"
              value={dash(declined.length)}
              chip={`${pct(declined.length)}% of replies`}
              series={dailyCounts(replies, (r) => !r.attending)}
            />
          </div>

          <section className="card list-card">
            <div className="list-head">
              <h2>Recent replies</h2>
              <select
                className="list-select"
                aria-label="Show replies from"
                value={invitationFilter}
                onChange={(e) => setInvitationFilter(e.target.value)}
              >
                <option value="all">All invitations</option>
                {list.map((inv) => (
                  <option key={inv.id} value={String(inv.id)}>
                    {inv.title}
                  </option>
                ))}
              </select>
            </div>

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
                    : "No replies match this view."}
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

            {scoped.length > shown.length && (
              <p className="muted small-text">
                Showing the {shown.length} most recent of {scoped.length} replies.
              </p>
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

        <section className="card">
          <h2>Appearance</h2>
          <fieldset className="field">
            <legend>Theme</legend>
            <div className="choices">
              {[
                ["light", "Light"],
                ["dark", "Dark"],
                ["system", "Match my device"],
              ].map(([value, label]) => (
                <label className="choice" key={value}>
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={themePref === value}
                    onChange={() => onThemePref(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <span className="hint">The moon and sun button in the top bar switches it quickly too.</span>
          </fieldset>
        </section>
      </div>
    </>
  );
}