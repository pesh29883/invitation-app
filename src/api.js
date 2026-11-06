import { getToken, SESSION_EXPIRED } from "./session.js";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";
export async function api(path, { method = "GET", body, auth = false, signal } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const token = auth ? getToken() : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.name === "TimeoutError") throw new Error("The server took too long to respond. Please try again.", { cause: error });
    throw new Error("Can't reach the server. Check that it's running.", { cause: error });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A response for an old token must not sign out a newly rotated or replaced session.
    if (auth && res.status === 401 && getToken() === token) window.dispatchEvent(new Event(SESSION_EXPIRED));
    const err = new Error(data.error || "Something went wrong. Try again.");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
