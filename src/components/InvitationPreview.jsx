import Icon from "./Icon.jsx";

export default function InvitationPreview({ title = "A little dinner party", kind = "Just because", date, location = "Somewhere lovely", message, host, demo = false }) {
  const dateLabel = date && !Number.isNaN(new Date(date).getTime())
    ? new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : demo ? "Saturday, November 14" : "A date to look forward to";
  return (
    <div className={`invitation-preview ${demo ? "is-demo" : ""}`}>
      <div className="preview-border">
        <span className="preview-kicker">{kind || "A special occasion"}</span>
        <svg className="flower-art" viewBox="0 0 160 115" fill="none" aria-hidden="true">
          <path d="M78 110c5-30 5-56 1-77m1 47c-22 3-32-6-34-21 18-1 28 6 34 21Zm1 15c21-1 31-12 32-27-19 3-27 12-32 27Z" stroke="#597963" strokeWidth="2" fill="#dce4cb" />
          <g fill="#e6b873" stroke="#b98139" strokeWidth="1"><ellipse cx="80" cy="21" rx="12" ry="17" /><ellipse cx="80" cy="51" rx="12" ry="17" /><ellipse cx="65" cy="36" rx="17" ry="12" /><ellipse cx="95" cy="36" rx="17" ry="12" /><ellipse cx="69" cy="25" rx="11" ry="15" transform="rotate(-45 69 25)" /><ellipse cx="91" cy="47" rx="11" ry="15" transform="rotate(-45 91 47)" /><ellipse cx="91" cy="25" rx="11" ry="15" transform="rotate(45 91 25)" /><ellipse cx="69" cy="47" rx="11" ry="15" transform="rotate(45 69 47)" /></g>
          <circle cx="80" cy="36" r="11" fill="#6e7850" /><circle cx="77" cy="33" r="2" fill="#e9d5a4" /><circle cx="84" cy="38" r="2" fill="#e9d5a4" />
          <path d="m30 32 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm98 17 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#d0a76a" />
        </svg>
        <p className="preview-eyebrow">You're invited to</p>
        <h2>{title || "Your lovely get-together"}</h2>
        <div className="preview-rule"><span /><Icon name="sparkle" size={14} /><span /></div>
        <p className="preview-date">{dateLabel}</p>
        <p className="preview-place"><Icon name="pin" size={13} />{location || "Somewhere lovely"}</p>
        {message && <p className="preview-message">{message}</p>}
        <p className="preview-signoff">{host ? `With love, ${host}` : "Good food. Great company. You."}</p>
      </div>
    </div>
  );
}
