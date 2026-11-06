import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

export default function Brand() {
  return <Link to="/" className="brand" aria-label="Invitations home"><img src={logo} alt="" className="brand-logo" /><span>invitations<span className="brand-period">.</span></span></Link>;
}
