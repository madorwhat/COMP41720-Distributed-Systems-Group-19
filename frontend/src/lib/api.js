const env = import.meta.env || {};
export const AUTH_URL = env.VITE_AUTH_URL || "http://localhost:4000";
export const BOOKING_URL = env.VITE_BOOKING_URL || "http://localhost:4001";
export const NOTIFICATION_URL = env.VITE_NOTIFICATION_URL || "http://localhost:4003";
export const AI_URL = env.VITE_AI_URL || "http://localhost:4004";

const TOKEN_KEY = "accessToken";
const USER_KEY = "currentUser";

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export function getCachedUser() {
  try { return getToken() ? JSON.parse(localStorage.getItem(USER_KEY)) : null; } catch { return null; }
}
export function saveSession(user, token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const FIELDS = {
  mobile: "Mobile number", nationality: "Nationality", email: "Email", password: "Password",
  fullName: "Full name", day: "Day", slotTime: "Time", country: "Country", visaType: "Visa type", bookingId: "Slot",
};

function friendly(code, message) {
  switch (code) {
    case "UNAUTHENTICATED": return "Your session has expired. Please log out and log in again.";
    case "RATE_LIMITED": return "Too many attempts. Please wait a few minutes and try again.";
    case "EMAIL_TAKEN": return "That email is already registered. Try logging in instead.";
    case "DUPLICATE_SLOT": return "That slot has already been added.";
    case "PLAN_NOT_FOUND": return "This plan has expired. Please suggest a new one.";
    case "FORBIDDEN": return message === "Admins only" ? "Only admins can do that." : message;
    case "VALIDATION_ERROR": {
      const [field, ...rest] = message.split(": ");
      const text = rest.join(": ");
      const label = FIELDS[field];
      if (!label || !text) return message;
      return text.toLowerCase().includes(label.toLowerCase()) ? text : `${label}: ${text}`;
    }
    default: return message;
  }
}

export async function api(base, path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  let res;
  try {
    res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check that the services are running.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth && base === AUTH_URL) {
      clearSession();
      window.dispatchEvent(new Event("bmv:logout"));
    }
    const code = data.error?.code;
    throw new ApiError(res.status, code, friendly(code, data.error?.message || "Something went wrong."));
  }
  return data;
}