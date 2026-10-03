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

function Layout() {
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

  return (
    <Routes>
      {/* Guests see this page without the app header */}
      <Route path="/i/:slug" element={<PublicInvitation />} />

      <Route element={<Layout />}>
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
              <Profile />
            </Protected>
          }
        />
      </Route>
    </Routes>
  );
}