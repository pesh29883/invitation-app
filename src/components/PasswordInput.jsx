import { useState } from "react";
import Icon from "./Icon.jsx";

export default function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap password-wrap">
      <Icon name="lock" size={18} className="input-icon" />
      <input {...props} id={id} type={visible ? "text" : "password"} />
      <button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls={id}><Icon name={visible ? "eyeOff" : "eye"} size={19} /></button>
    </div>
  );
}
