import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

export default function EmptyState({ title, description, action, to = "/new", icon = "mail" }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h2>{title}</h2><p className="muted">{description}</p>{action && <Link className="button" to={to}><Icon name="plus" size={17} />{action}</Link>}</div>;
}
