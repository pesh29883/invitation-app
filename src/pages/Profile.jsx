import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth.jsx";

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

export default function Profile() {
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [detailsMessage, setDetailsMessage] = useState({ type: "", text: "" });
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordMessage, setPasswordMessage] = useState({ type: "", text: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your profile</h1>
          <p className="muted">Reply notifications are sent to your email address.</p>
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