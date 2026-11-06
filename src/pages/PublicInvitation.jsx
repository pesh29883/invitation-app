import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatDateTime } from "../api";
import Brand from "../components/Brand.jsx";
import Icon from "../components/Icon.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function PublicInvitation() {
  const { slug } = useParams();
  const [invitation, setInvitation] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("yes");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api(`/api/public/${slug}`, { signal: controller.signal })
      .then(setInvitation)
      .catch((err) => { if (!controller.signal.aborted) setLoadError(err.message); });
    return () => controller.abort();
  }, [slug, refreshKey]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!name.trim()) {
      setError("Enter your name so the host knows who replied.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/public/${slug}/rsvp`, {
        method: "POST",
        body: { guestName: name.trim(), attending: answer === "yes" },
      });
      setSent({ name: name.trim(), attending: answer === "yes" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="invite">
        <div className="card">
          <EmptyState title="A little trouble opening this one." description={loadError} icon="mail" />
          <div className="actions"><button className="button secondary" onClick={() => { setLoadError(""); setRefreshKey((key) => key + 1); }}>Try again</button><Brand /></div>
        </div>
      </main>
    );
  }

  if (!invitation) {
    return (
      <main className="invite">
        <div className="card" role="status"><p className="muted">Something lovely is on its way…</p><div className="skeleton" /><div className="skeleton" style={{ width: "60%" }} /></div>
      </main>
    );
  }

  // Use the exact pin when the host placed one, otherwise fall back to the typed location.
  const hasPin = invitation.latitude != null && invitation.longitude != null;
  const mapQuery = hasPin
    ? `${invitation.latitude},${invitation.longitude}`
    : (invitation.location ?? "");

  return (
    <main className="invite">
      <div className="invite-brand"><Brand /></div>
      <header className="invite-hero">
        <span className="invite-flower" aria-hidden="true">✳</span>
        <p className="invite-from">{invitation.host_name} invites you</p>
        <h1 className="invite-title">{invitation.title}</h1>
        <div className="invite-details">
          <p><Icon name="calendar" size={17} />{formatDateTime(invitation.event_date)}</p>
          {invitation.location && <p><Icon name="pin" size={17} />{invitation.location}</p>}
        </div>
      </header>

      {invitation.message && <p className="invite-message">{invitation.message}</p>}

      {mapQuery && (
        <section
          className="card map-card"
          style={{ marginTop: "1.5rem" }}
          aria-label="Map of the event location"
        >
          <div className="map-label">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                mapQuery
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Maps
            </a>
          </div>
          <iframe
            className="map-frame"
            title="Map of the event location"
            loading="lazy"
            src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
          />
        </section>
      )}

      <section className="card invite-reply" aria-labelledby="reply-heading">
        {invitation.is_open === false ? (
          <div role="status">
            <h2 id="reply-heading">Replies are closed</h2>
            <p className="muted">
              {invitation.host_name} isn't taking replies for this invitation anymore.
            </p>
          </div>
        ) : sent ? (
          <div role="status">
            <span className="success-icon"><Icon name="check" size={25} /></span>
            <h2 id="reply-heading">
              {sent.attending
                ? `Thanks, ${sent.name}. See you there!`
                : `Thanks for letting us know, ${sent.name}.`}
            </h2>
            <p className="muted">Your reply is saved for {invitation.host_name}. Thanks for being part of the plan.</p>
          </div>
        ) : (
          <>
            <h2 id="reply-heading">Will you be there?</h2>
            <p className="muted">A little yes or no helps {invitation.host_name.split(" ")[0]} get everything ready.</p>
            <form className="stack" onSubmit={handleSubmit} aria-busy={busy}>
              <label className="field">
                <span>Your name</span>
                <input
                  type="text"
                  name="guestName"
                  autoComplete="name"
                  placeholder="The name your host knows you by"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <fieldset className="field">
                <legend>Your answer</legend>
                <div className="choices">
                  {[
                    ["yes", "I'll be there"],
                    ["no", "Can't make it"],
                  ].map(([value, label]) => (
                    <label className="choice" key={value}>
                      <input
                        type="radio"
                        name="answer"
                        value={value}
                        checked={answer === value}
                        onChange={() => setAnswer(value)}
                      />
                      <span><Icon name={value === "yes" ? "check" : "close"} size={16} />{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="button" disabled={busy}>
                {busy ? <><span className="spinner" />Sending your reply…</> : <>Send my reply<Icon name="arrow" size={17} /></>}
              </button>
            </form>
          </>
        )}
      </section>
      <footer className="invite-footer">A little invitation. A lovely reason to get together.</footer>
    </main>
  );
}
