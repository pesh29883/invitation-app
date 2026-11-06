import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearSession, getToken, readSession, saveSession, SESSION_EXPIRED, updateSessionToken, updateSessionUser } from "./session.js";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSession()?.user || null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  const login = useCallback((token, nextUser, remember = true) => {
    saveSession(token, nextUser, remember);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((nextUser, token) => {
    if (token) updateSessionToken(token);
    updateSessionUser(nextUser);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (!getToken()) { setLoading(false); return; }
      const token = getToken();
      try {
        const nextUser = await api("/api/me", { auth: true, signal: controller.signal });
        if (!controller.signal.aborted && getToken() === token) updateUser(nextUser);
      } catch { /* The API expiry event handles revoked credentials; offline sessions can retry. */ }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, [updateUser]);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED, logout);
    return () => window.removeEventListener(SESSION_EXPIRED, logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
