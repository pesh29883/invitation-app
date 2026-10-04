import { useEffect, useState } from "react";

// Counts replies for each of the last 7 days (oldest first), optionally only those matching `matches`.
// eslint-disable-next-line react-refresh/only-export-components
export function dailyCounts(replies, matches = () => true) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ key: d.toDateString(), count: 0 });
  }
  for (const reply of replies) {
    if (!matches(reply)) continue;
    const day = days.find((d) => d.key === new Date(reply.createdAt).toDateString());
    if (day) day.count++;
  }
  return days.map((d) => d.count);
}

const ICONS = {
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 21 12z" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16.5 9.5" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
};

// Counts up to the number instead of jumping to it (skipped if the person prefers less motion).
function useCountUp(target) {
  const [animated, setAnimated] = useState(0);
  const skip =
    typeof target !== "number" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (skip) return;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 700);
      setAnimated(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, skip]);

  return skip ? target : animated;
}

export default function StatCard({ label, value, chip, tone = "accent", series, icon }) {
  const peak = Math.max(1, ...series);
  const shown = useCountUp(value);

  return (
    <div className={`card stat-card tone-${tone}`}>
      {icon && ICONS[icon] && (
        <span className="stat-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[icon]}
          </svg>
        </span>
      )}
      <div className="stat-top">
        <div>
          <p className="stat-value">{shown}</p>
          <p className="stat-label">{label}</p>
        </div>
        <div
          className="stat-bars"
          role="img"
          aria-label={`${label}, last 7 days: ${series.join(", ")}`}
        >
          {series.map((n, i) => (
            <span
              key={i}
              style={{ height: `${Math.max(10, (n / peak) * 100)}%`, animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      </div>
      {chip && <p className="stat-chip">{chip}</p>}
    </div>
  );
}