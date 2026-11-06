import { useEffect, useLayoutEffect, useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "./App.css";
import { useAuth } from "./auth.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateInvitation from "./pages/CreateInvitation.jsx";
import MyInvitations from "./pages/MyInvitations.jsx";
import Profile from "./pages/Profile.jsx";
import PublicInvitation from "./pages/PublicInvitation.jsx";
import Brand from "./components/Brand.jsx";
import Icon from "./components/Icon.jsx";
import EmptyState from "./components/EmptyState.jsx";

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
      <Icon name={dark ? "sun" : "moon"} size={18} />
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

  if (!user) return <main id="main-content" className="auth-shell"><Outlet context={{ theme, onToggleTheme }} /></main>;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          {user && (
            <nav className="topbar-user" aria-label="Main">
              <NavLink to="/dashboard" aria-label="Overview"><Icon name="grid" size={17} /><span>Overview</span></NavLink>
              <NavLink to="/invitations" aria-label="Invitations"><Icon name="mail" size={17} /><span>Invitations</span></NavLink>
              <NavLink to="/profile" className="profile-nav" aria-label="Your profile"><span className="nav-avatar">{user.name.charAt(0).toUpperCase()}</span><span className="nav-name">{user.name.split(" ")[0]}</span></NavLink>
            </nav>
          )}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="theme-toggle logout-button" onClick={handleLogout} aria-label="Log out" title="Log out"><Icon name="logout" size={18} /></button>
        </div>
      </header>
      <main id="main-content" className="shell">
        <Outlet context={{ theme, onToggleTheme }} />
      </main>
      <footer className="app-footer"><span>Good company. Great memories.</span><span>Made for getting together<Icon name="heart" size={13} /></span></footer>
    </>
  );
}

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

export default function App() {
  const { user } = useAuth();
  const { pref, theme, choose } = useTheme();
  const location = useLocation();

  useEffect(() => {
    const titles = { "/login": "Welcome back", "/register": "Join the get-together", "/dashboard": "Your overview", "/invitations": "Your invitations", "/profile": "Your profile", "/new": "Create an invitation" };
    document.title = `${titles[location.pathname] || (location.pathname.startsWith("/i/") ? "You're invited" : "A little more together")} · Invitations`;
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <Routes>
      {/* Guests see this page without the app header */}
      <Route path="/i/:slug" element={<PublicInvitation key={location.pathname} />} />

      <Route
        element={<Layout theme={theme} onToggleTheme={() => choose(theme === "dark" ? "light" : "dark")} />}
      >
        <Route
          path="/"
          element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
        />
        <Route path="/login" element={<AuthPage key="login" mode="login" />} />
        <Route path="/register" element={<AuthPage key="register" mode="register" />} />
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
              <CreateInvitation key={location.pathname} />
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
              <CreateInvitation key={location.pathname} />
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
        <Route path="*" element={<section className="card"><EmptyState title="Looks like a little detour." description="This page isn't here, but your next good time is just around the corner." action="Back to the beginning" to="/" icon="pin" /></section>} />
      </Route>
    </Routes>
  );
}
