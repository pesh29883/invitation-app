import { useEffect, useLayoutEffect, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import "./App.css";
import { useAuth } from "./auth.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateInvitation from "./pages/CreateInvitation.jsx";
import MyInvitations from "./pages/MyInvitations.jsx";
import Profile from "./pages/Profile.jsx";
import PublicInvitation from "./pages/PublicInvitation.jsx";

const THEME_KEY = "invitations-theme"; // saved as "light" or "dark"; absent means "match my device"

function readThemePref() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

// Keeps track of the chosen theme (light, dark, or match the device) and applies it to the page.
function useTheme() {
  const [pref, setPref] = useState(readThemePref);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const theme = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function choose(next) {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage unavailable: the choice still works until the page is closed.
    }
  }

  return { pref, theme, choose };
}

function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="theme-toggle" onClick={onToggle} aria-label={label} title={label}>
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}

function Layout({ theme, onToggleTheme }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" className="brand-logo" />
          Invitations
        </Link>
        <div className="topbar-actions">
          {user && (
            <nav className="topbar-user" aria-label="Main">
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/invitations">Invitations</NavLink>
              <NavLink to="/profile">{user.name}</NavLink>
              <button type="button" className="link-button" onClick={handleLogout}>
                Log out
              </button>
            </nav>
          )}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>
      <main className="shell">
        <Outlet />
      </main>
    </>
  );
}

function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();
  const { pref, theme, choose } = useTheme();

  return (
    <Routes>
      {/* Guests see this page without the app header */}
      <Route path="/i/:slug" element={<PublicInvitation />} />

      <Route
        element={<Layout theme={theme} onToggleTheme={() => choose(theme === "dark" ? "light" : "dark")} />}
      >
        <Route
          path="/"
          element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
        />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/new"
          element={
            <Protected>
              <CreateInvitation />
            </Protected>
          }
        />
        <Route
          path="/invitations"
          element={
            <Protected>
              <MyInvitations />
            </Protected>
          }
        />
        <Route
          path="/invitations/:id/edit"
          element={
            <Protected>
              <CreateInvitation />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile themePref={pref} onThemePref={choose} />
            </Protected>
          }
        />
      </Route>
    </Routes>
  );
}