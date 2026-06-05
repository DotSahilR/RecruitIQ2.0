export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TOKEN_KEY = "recruitiq_token";
const USER_KEY = "recruitiq_user";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveAuth(token: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function authHeaders(extra: HeadersInit = {}) {
  const token = getToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function authFetch(input: string, init: RequestInit = {}) {
  const headers = authHeaders(init.headers || {});
  const response = await fetch(input, { ...init, headers });

  if (response.status === 401 && typeof window !== "undefined") {
    clearAuth();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
}

export async function loginOrRegister(mode: "login" | "register", payload: Record<string, string>) {
  const response = await fetch(`${API_URL}/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Authentication failed.");
  }

  saveAuth(data.token, data.user);
  return data.user as AuthUser;
}
