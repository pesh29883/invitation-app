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

export default function StatCard({ label, value, chip, tone = "accent", series }) {
  const peak = Math.max(1, ...series);

  return (
    <div className={`card stat-card tone-${tone}`}>
      <div className="stat-top">
        <div>
          <p className="stat-value">{value}</p>
          <p className="stat-label">{label}</p>
        </div>
        <div
          className="stat-bars"
          role="img"
          aria-label={`${label}, last 7 days: ${series.join(", ")}`}
        >
          {series.map((n, i) => (
            <span key={i} style={{ height: `${Math.max(10, (n / peak) * 100)}%` }} />
          ))}
        </div>
      </div>
      {chip && <p className="stat-chip">{chip}</p>}
    </div>
  );
}