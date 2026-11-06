const TOKEN_KEY = "invitations-token";
const USER_KEY = "invitations-user";
let memorySession = null;

export const SESSION_EXPIRED = "invitations-session-expired";

function storage(name) {
  try { return window[name]; } catch { return null; }
}

export function clearSession() {
  memorySession = null;
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      storage(name)?.removeItem(TOKEN_KEY);
      storage(name)?.removeItem(USER_KEY);
    } catch { /* The in-memory session still works when storage is unavailable. */ }
  }
}

export function readSession() {
  let session = memorySession;
  for (const name of ["sessionStorage", "localStorage"]) {
    try {
      const token = storage(name)?.getItem(TOKEN_KEY);
      const user = JSON.parse(storage(name)?.getItem(USER_KEY) || "null");
      if (token && user?.id && typeof user.name === "string" && typeof user.email === "string") {
        session = { token, user };
        break;
      }
    } catch { /* Try the next available store. */ }
  }
  if (!session) return null;
  try {
    const payload = JSON.parse(atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
  } catch {
    clearSession();
    return null;
  }
  return session;
}

export function saveSession(token, user, remember = true) {
  clearSession();
  memorySession = { token, user };
  try {
    const store = storage(remember ? "localStorage" : "sessionStorage");
    store?.setItem(TOKEN_KEY, token);
    store?.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* Keep the session in memory if the browser blocks storage. */ }
}

export function updateSessionUser(user) {
  const session = readSession();
  if (!session) return;
  memorySession = { ...session, user };
  for (const name of ["sessionStorage", "localStorage"]) {
    try {
      const store = storage(name);
      if (store?.getItem(TOKEN_KEY)) store.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* The in-memory user has already been updated. */ }
  }
}

export const getToken = () => readSession()?.token;
