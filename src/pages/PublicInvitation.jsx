import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatDateTime } from "../api";

export default function PublicInvitation() {
  const { slug } = useParams();
  const [invitation, setInvitation] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("yes");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    api(`/api/public/${slug}`)
      .then(setInvitation)
      .catch((err) => setLoadError(err.message));
  }, [slug]);

  async function handleSubmit(e) {
    e.preventDefault();
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
          <h2>{loadError}</h2>
        </div>
      </main>
    );
  }

  if (!invitation) {
    return (
      <main className="invite">
        <p>Loading your invitation...</p>
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
      <header className="invite-hero">
        <p className="invite-from">{invitation.host_name} invites you</p>
        <h1 className="invite-title">{invitation.title}</h1>
        <div className="invite-details">
          <p>{formatDateTime(invitation.event_date)}</p>
          {invitation.location && <p>{invitation.location}</p>}
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
            <h2 id="reply-heading">
              {sent.attending
                ? `Thanks, ${sent.name}. See you there!`
                : `Thanks for letting us know, ${sent.name}.`}
            </h2>
            <p>{invitation.host_name} has been notified.</p>
          </div>
        ) : (
          <>
            <h2 id="reply-heading">Will you be there?</h2>
            <form className="stack" onSubmit={handleSubmit} noValidate>
              <label className="field">
                <span>Your name</span>
                <input
                  type="text"
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
                      <span>{label}</span>
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
                Send my reply
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}