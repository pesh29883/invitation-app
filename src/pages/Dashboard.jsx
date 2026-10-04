import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDateTime } from "../api";
import { useAuth } from "../auth.jsx";

const REFRESH_MS = 5000;

const FILTERS = [
  ["all", "All"],
  ["yes", "Coming"],
  ["no", "Can't make it"],
];

function lastSevenDays(rsvps) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toDateString(),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      coming: 0,
      declined: 0,
    });
  }
  for (const r of rsvps) {
    const day = days.find((d) => d.key === new Date(r.createdAt).toDateString());
    if (!day) continue;
    if (r.attending) day.coming++;
    else day.declined++;
  }
  return days;
}

// For each kind of invitation, how many replies said coming vs can't make it.
function repliesByKind(invitations) {
  const stats = {};
  for (const inv of invitations) {
    if (!stats[inv.kind]) stats[inv.kind] = { invitations: 0, coming: 0, declined: 0 };
    stats[inv.kind].invitations += 1;
    for (const r of inv.rsvps) {
      if (r.attending) stats[inv.kind].coming += 1;
      else stats[inv.kind].declined += 1;
    }
  }
  const replies = (k) => stats[k].coming + stats[k].declined;
  return Object.entries(stats).sort(
    (a, b) => replies(b[0]) - replies(a[0]) || b[1].invitations - a[1].invitations
  );
}

export default function Dashboard() {
  const { logout } = useAuth();
  const [invitations, setInvitations] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [updatedAt, setUpdatedAt] = useState(null);

  // Load once, then quietly refresh in the background so new replies appear by themselves.
  useEffect(() => {
    let stopped = false;
    let inFlight = false;

    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api("/api/invitations", { auth: true });
        if (stopped) return;
        setInvitations(data);
        setError("");
        setUpdatedAt(new Date());
      } catch (err) {
        if (stopped) return;
        if (err.status === 401) logout();
        else setError(err.message);
      } finally {
        inFlight = false;
      }
    }

    function refreshIfVisible() {
      if (document.visibilityState === "visible") load();
    }

    load();
    const timer = setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [logout]);

  const selected =
    invitations?.find((inv) => inv.id === selectedId) ?? invitations?.[0];

  async function copyLink() {
    const url = `${window.location.origin}/i/${selected.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function toggleOpen() {
    try {
      const result = await api(`/api/invitations/${selected.id}`, {
        method: "PATCH",
        auth: true,
        body: { isOpen: !selected.is_open },
      });
      setInvitations((list) =>
        list.map((inv) =>
          inv.id === result.id ? { ...inv, is_open: result.is_open } : inv
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeInvitation() {
    const ok = window.confirm(
      `Delete "${selected.title}" and all of its replies? This can't be undone.`
    );
    if (!ok) return;
    try {
      await api(`/api/invitations/${selected.id}`, { method: "DELETE", auth: true });
      setInvitations((list) => list.filter((inv) => inv.id !== selected.id));
      setSelectedId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const rsvps = selected?.rsvps ?? [];
  const hasPin = selected?.latitude != null && selected?.longitude != null;
  const mapQuery = hasPin
    ? `${selected.latitude},${selected.longitude}`
    : (selected?.location ?? "");
  // Show the first two parts as the place name; the rest of the address goes underneath, smaller.
  const placeParts = (selected?.location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const placeName = placeParts.slice(0, 2).join(", ") || "Pinned location";
  const placeDetail = placeParts.slice(2).join(", ");
  const coming = rsvps.filter((r) => r.attending).length;
  const declined = rsvps.length - coming;
  const comingPct = rsvps.length ? Math.round((coming / rsvps.length) * 100) : 0;
  const days = lastSevenDays(rsvps);
  const peak = Math.max(1, ...days.map((d) => d.coming + d.declined));
  const kinds = repliesByKind(invitations ?? []);
  const shown = rsvps
    .filter((r) => filter === "all" || (filter === "yes") === r.attending)
    .reverse();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            {updatedAt
              ? `Live. Last updated ${updatedAt.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "See who's coming and where it's happening."}
          </p>
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

      {selected && (
        <>
          <div className="tabs" aria-label="Your invitations">
            {invitations.map((inv) => (
              <button
                key={inv.id}
                type="button"
                className="tab"
                aria-pressed={inv.id === selected.id}
                onClick={() => {
                  setSelectedId(inv.id);
                  setFilter("all");
                }}
              >
                {inv.title}
              </button>
            ))}
          </div>

          <section className="card summary">
            <div>
              <h2>
                {selected.title}{" "}
                <span className={`badge ${selected.is_open ? "yes" : "no"}`}>
                  {selected.is_open ? "Open" : "Closed"}
                </span>
              </h2>
              <p className="meta">
                {selected.kind} on {formatDateTime(selected.event_date)}
              </p>
            </div>
            <div className="link-row">
              <code>{`${window.location.origin}/i/${selected.slug}`}</code>
              <button type="button" className="button small" onClick={copyLink}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="pills">
              <button type="button" className="tab" onClick={toggleOpen}>
                {selected.is_open ? "Close invitation" : "Reopen invitation"}
              </button>
              <button
                type="button"
                className="tab"
                style={{ color: "var(--danger)" }}
                onClick={removeInvitation}
              >
                Delete
              </button>
            </div>
          </section>

          <div className="dash">
            <div className="dash-side">
              <section className="card">
                <h2>Reply progress</h2>
                <p className="big-number">
                  {comingPct}
                  <small>% coming</small>
                </p>
                <div
                  className="split-bar"
                  role="img"
                  aria-label={`${coming} coming, ${declined} can't make it`}
                >
                  <span className="split-coming" style={{ width: `${comingPct}%` }} />
                  <span
                    className="split-declined"
                    style={{ width: rsvps.length ? `${100 - comingPct}%` : 0 }}
                  />
                </div>
                <div className="legend">
                  <span>
                    <i className="dot dot-coming" />
                    {coming} coming
                  </span>
                  <span>
                    <i className="dot dot-declined" />
                    {declined} can't make it
                  </span>
                </div>
                <p className="muted small-text">
                  {rsvps.length} {rsvps.length === 1 ? "reply" : "replies"} so far
                </p>
              </section>

              <section className="card">
                <h2>Replies, last 7 days</h2>
                <div className="chart">
                  {days.map((d) => (
                    <div
                      className="chart-col"
                      key={d.key}
                      title={`${d.label}: ${d.coming} coming, ${d.declined} can't make it`}
                    >
                      <div className="chart-bars">
                        <span
                          className="bar-declined"
                          style={{ height: `${(d.declined / peak) * 100}%` }}
                        />
                        <span
                          className="bar-coming"
                          style={{ height: `${(d.coming / peak) * 100}%` }}
                        />
                      </div>
                      <span className="chart-label">{d.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <h2>Replies by kind</h2>
                <div className="legend legend-blue">
                  <span>
                    <i className="dot dot-coming" />
                    Coming
                  </span>
                  <span>
                    <i className="dot dot-declined" />
                    Can't make it
                  </span>
                </div>
                <div className="dist">
                  {kinds.map(([kind, stat]) => {
                    const total = stat.coming + stat.declined;
                    const comingPct = total ? Math.round((stat.coming / total) * 100) : 0;
                    const declinedPct = total ? 100 - comingPct : 0;
                    return (
                      <div className="dist-row" key={kind}>
                        <span>{kind}</span>
                        <span
                          className="track"
                          role="img"
                          aria-label={
                            total
                              ? `${comingPct}% coming, ${declinedPct}% can't make it`
                              : "No replies yet"
                          }
                        >
                          <span className="fill fill-coming" style={{ width: `${comingPct}%` }} />
                          <span className="fill fill-declined" style={{ width: `${declinedPct}%` }} />
                        </span>
                        {total ? (
                          <span className="dist-pct">
                            <b className="pct-coming">{comingPct}%</b>
                            <b className="pct-declined">{declinedPct}%</b>
                          </span>
                        ) : (
                          <span className="muted">No replies</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="dash-main">
              <section className="card map-card">
                {mapQuery ? (
                  <>
                    <div className="map-head">
                      <div className="map-place">
                        <p className="map-place-name">{placeName}</p>
                        {placeDetail && (
                          <p className="map-place-detail" title={selected.location}>
                            {placeDetail}
                          </p>
                        )}
                      </div>
                      <a
                        className="map-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
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
                  </>
                ) : (
                  <p className="map-empty muted">This invitation has no location set.</p>
                )}
              </section>

              <section className="card">
                <div className="table-head">
                  <h2>Guest replies</h2>
                  <div className="pills">
                    {FILTERS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className="tab"
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {shown.length === 0 ? (
                  <p className="muted">
                    {rsvps.length === 0
                      ? "No replies yet. Share the link to get started."
                      : "No replies match this filter."}
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Guest</th>
                          <th>Answer</th>
                          <th>Replied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.id}>
                            <td>{r.guestName}</td>
                            <td>
                              <span className={`badge ${r.attending ? "yes" : "no"}`}>
                                {r.attending ? "Coming" : "Can't make it"}
                              </span>
                            </td>
                            <td className="muted">
                              {new Date(r.createdAt).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}