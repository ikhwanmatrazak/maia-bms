import Cookies from "js-cookie";

const ACCESS_TOKEN_KEY = "maia_access_token";
const REFRESH_TOKEN_KEY = "maia_refresh_token";
const USER_KEY = "maia_user";

export function setTokens(accessToken: string, refreshToken: string) {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, { expires: 1 / 96 }); // 15 min
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, { expires: 7 });
}

export function getAccessToken(): string | null {
  return Cookies.get(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return Cookies.get(REFRESH_TOKEN_KEY) ?? null;
}

export function setUser(user: object) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuth() {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!(getAccessToken() || getRefreshToken());
}
