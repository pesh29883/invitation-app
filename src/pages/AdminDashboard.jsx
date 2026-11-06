import { useEffect, useRef, useState } from "react";
import { api, formatDateTime } from "../api.js";
import { useAuth } from "../auth.jsx";
import Icon from "../components/Icon.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

const dateLabel = (date) => date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not yet";

function AccountDialog({ account, mode, onClose, onSaved }) {
  const { user, logout, updateUser } = useAuth();
  const ref = useRef(null);
  const [form, setForm] = useState({ name: account.name, email: account.email, role: account.role, status: account.status, currentPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = mode === "reset";
  const self = String(account.id) === String(user.id);
  const update = (key) => (event) => { setForm((previous) => ({ ...previous, [key]: event.target.value })); setError(""); };

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/admin/users/${account.id}${reset ? "/reset-password" : ""}`, {
        method: reset ? "POST" : "PATCH", auth: true,
        body: reset ? { currentPassword: form.currentPassword } : form,
      });
      if (!reset && self) {
        if (result.email !== user.email) { logout(); return; }
        updateUser(result);
      }
      onSaved(reset ? result.message : `Changes to ${result.name}'s account are saved.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <dialog ref={ref} className="account-dialog" aria-labelledby="account-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><span className="auth-welcome-icon"><Icon name={reset ? "mail" : "shield"} size={24} /></span><button type="button" className="theme-toggle" aria-label="Close account dialog" onClick={onClose} disabled={busy}><Icon name="close" size={18} /></button></div>
    <h2 id="account-dialog-title">{reset ? "Help them get back in." : "Manage account."}</h2>
    <p className="muted small-text">{account.name} · {account.email}</p>
    <form className="stack" onSubmit={submit} aria-busy={busy}>
      {!reset && <>
        <div className="field"><label htmlFor="admin-name">Name</label><input id="admin-name" autoComplete="off" required maxLength={100} value={form.name} onChange={update("name")} /></div>
        <div className="field"><label htmlFor="admin-email">Email address</label><input id="admin-email" type="email" autoComplete="off" required maxLength={254} value={form.email} onChange={update("email")} /></div>
        <div className="admin-form-grid">
          <div className="field"><label htmlFor="admin-role">Role</label><select id="admin-role" value={form.role} onChange={update("role")} disabled={self}><option value="user">Member</option><option value="admin">Administrator</option></select></div>
          <div className="field"><label htmlFor="admin-status">Account status</label><select id="admin-status" value={form.status} onChange={update("status")} disabled={self}><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
        </div>
        <p className="hint">{self ? "Your administrator access is protected. Changing your email signs you out." : "Changing email, role, or status signs this member out. Suspension also hides their shared invitations and pauses replies; their data is kept."}</p>
        {form.role === "admin" && account.role !== "admin" && <p className="notice">Administrators can manage every account and view administration activity.</p>}
      </>}
      {reset && <p className="notice">A single-use reset link will be emailed to {account.email}. It expires in 30 minutes. Existing sessions end when they choose a new password.</p>}
      <div className="field"><label htmlFor="admin-confirm-password">Your administrator password</label><PasswordInput id="admin-confirm-password" autoComplete="current-password" required value={form.currentPassword} onChange={update("currentPassword")} /><span className="hint">Confirm it's you before making this change.</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row-actions"><button type="submit" className={`button ${form.status === "suspended" && !reset ? "danger" : ""}`} disabled={busy}>{busy ? "One moment…" : reset ? "Send reset email" : "Save account"}</button><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button></div>
    </form>
  </dialog>;
}

function activityDescription(entry) {
  if (entry.action === "admin.bootstrapped") return "Enabled administrator access";
  if (entry.action === "password.reset_requested") return "Sent password reset email";
  const before = entry.details?.before || {};
  const after = entry.details?.after || {};
  const labels = { name: "name", email: "email", role: "role", status: "status" };
  const changed = Object.keys(labels).filter((key) => before[key] !== after[key]);
  return changed.length ? `Updated ${changed.map((key) => labels[key]).join(", ")}` : "Saved account details";
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ search: "", role: "", status: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");
  const requestKey = JSON.stringify({ ...filters, revision });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(filters);
    const options = { auth: true, signal: controller.signal };
    Promise.all([api("/api/admin/overview", options), api(`/api/admin/users?${query}`, options), api("/api/admin/activity", options)])
      .then(([overview, accounts, activity]) => { if (!controller.signal.aborted) setData({ key: requestKey, overview, accounts, activity }); })
      .catch((err) => { if (!controller.signal.aborted) setFailure({ key: requestKey, message: err.status === 403 ? "Your administrator access changed. Refresh or sign in again." : err.message }); });
    return () => controller.abort();
  }, [filters, requestKey]);

  const loading = data?.key !== requestKey && failure?.key !== requestKey;
  const error = failure?.key === requestKey ? failure.message : "";
  const applyFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  function saved(message) { setDialog(null); setNotice(message); setRevision((current) => current + 1); }

  return <>
    <div className="page-head"><div><p className="eyebrow"><Icon name="shield" size={16} />Administration</p><h1>A little care behind the scenes.</h1><p className="muted">Manage your community, keep accounts in good hands.</p></div><button type="button" className="button secondary" onClick={() => setRevision((current) => current + 1)} disabled={loading}>Refresh</button></div>
    {notice && <p className="notice admin-notice" role="status">{notice}</p>}
    {error && <div className="form-error" role="alert">{error} <button type="button" className="link-button" onClick={() => setRevision((current) => current + 1)}>Try again</button></div>}
    <div className="admin-stat-row" aria-label="Account overview" aria-busy={loading}>
      {[["total", "Total accounts", "user"], ["active", "Active accounts", "check"], ["admins", "Active administrators", "shield"], ["suspended", "Suspended accounts", "lock"]].map(([key, label, icon]) => <div className="card admin-stat" key={key}><span className="stat-icon"><Icon name={icon} size={18} /></span><p className="stat-value">{data?.overview[key] ?? "—"}</p><p className="stat-label">{label}</p></div>)}
    </div>
    {data && !data.overview.recoveryAvailable && <p className="form-error" role="status">Password recovery email needs setup. Configure SMTP and a sender address on the API server to enable reset emails.</p>}
    <section className="card admin-accounts" aria-labelledby="accounts-heading">
      <div className="table-head"><div><h2 id="accounts-heading">Your community</h2><p className="muted small-text">Find an account, update access, or help someone sign back in.</p></div><span className="badge yes">{data?.accounts.total ?? "—"} accounts</span></div>
      <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); applyFilter("search", search.trim()); }}>
        <div className="admin-search"><label className="search-box"><span className="sr-only">Search accounts by name or email</span><Icon name="search" size={18} /><input className="search-input" type="search" placeholder="Search name or email…" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} /></label><button type="submit" className="button secondary small">Search</button></div>
        <label className="field"><span className="sr-only">Filter by role</span><select className="list-select" value={filters.role} onChange={(event) => applyFilter("role", event.target.value)}><option value="">All roles</option><option value="user">Members</option><option value="admin">Administrators</option></select></label>
        <label className="field"><span className="sr-only">Filter by status</span><select className="list-select" value={filters.status} onChange={(event) => applyFilter("status", event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
      </form>
      <div className="table-wrap" aria-busy={loading}>
        <table className="table admin-table"><caption className="sr-only">Registered accounts and administration actions</caption><thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Invitations</th><th scope="col">Joined</th><th scope="col">Last sign-in</th><th scope="col">Actions</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={7}><p className="admin-empty" role="status">Loading your community…</p></td></tr> : error ? <tr><td colSpan={7}><p className="admin-empty">Accounts could not be loaded. Try again above.</p></td></tr> : data?.accounts.users.length ? data.accounts.users.map((account) => <tr key={account.id}>
            <td><div className="admin-member"><span className="nav-avatar">{account.name.charAt(0).toUpperCase()}</span><div><strong>{account.name}</strong>{String(account.id) === String(user.id) && <span className="admin-you">You</span>}<span className="admin-email">{account.email}</span></div></div></td>
            <td><span className={`badge ${account.role === "admin" ? "admin-badge" : ""}`}>{account.role === "admin" ? "Administrator" : "Member"}</span></td>
            <td><span className={`badge ${account.status === "active" ? "yes" : "no"}`}>{account.status === "active" ? "Active" : "Suspended"}</span></td>
            <td>{account.invitation_count}</td><td>{dateLabel(account.created_at)}</td><td>{dateLabel(account.last_login_at)}</td>
            <td><div className="row-actions"><button type="button" className="button small secondary" onClick={() => setDialog({ account, mode: "edit" })} aria-label={`Manage ${account.name}`}>Manage</button><button type="button" className="button small secondary" onClick={() => setDialog({ account, mode: "reset" })} disabled={account.status !== "active" || !data.overview.recoveryAvailable} aria-label={`Send password reset to ${account.name}`}>Reset password</button></div></td>
          </tr>) : <tr><td colSpan={7}><div className="admin-empty"><Icon name="search" size={26} /><p>No accounts match these filters.</p><button type="button" className="link-button" onClick={() => { setSearch(""); setFilters({ search: "", role: "", status: "", page: 1 }); }}>Clear filters</button></div></td></tr>}</tbody>
        </table>
      </div>
      <div className="admin-pagination"><span className="hint">Page {filters.page} of {Math.max(1, Math.ceil((data?.accounts.total || 0) / 20))}</span><div className="row-actions"><button type="button" className="button small secondary" disabled={loading || filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><button type="button" className="button small secondary" disabled={loading || filters.page * 20 >= (data?.accounts.total || 0)} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div></div>
    </section>
    <section className="card admin-activity" aria-labelledby="activity-heading"><div className="table-head"><div><h2 id="activity-heading">Administration activity</h2><p className="muted small-text">A record of account changes and recovery emails. Latest 50 actions.</p></div><Icon name="shield" size={22} /></div>
      {loading ? <p className="hint" role="status">Loading activity…</p> : error ? <p className="hint">Activity could not be loaded.</p> : data?.activity.length ? <ol className="admin-activity-list">{data.activity.map((entry) => <li key={entry.id}><span className="admin-activity-dot" /><div><p><strong>{activityDescription(entry)}</strong> <span className="muted">for {entry.target_email}</span></p><p className="hint">By {entry.actor_email}</p></div><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></li>)}</ol> : <p className="admin-empty">No administration activity yet. Account changes will appear here.</p>}
    </section>
    {dialog && <AccountDialog key={`${dialog.account.id}-${dialog.mode}`} {...dialog} onClose={() => setDialog(null)} onSaved={saved} />}
  </>;
}
