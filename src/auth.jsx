import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearSession, readSession, saveSession, SESSION_EXPIRED, updateSessionUser } from "./session.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSession()?.user || null);

  const login = useCallback((token, nextUser, remember = true) => {
    saveSession(token, nextUser, remember);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((nextUser) => {
    updateSessionUser(nextUser);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED, logout);
    return () => window.removeEventListener(SESSION_EXPIRED, logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
