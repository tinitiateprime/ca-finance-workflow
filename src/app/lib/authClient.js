const KEY = "ca_finance_user";

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(user) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

// ✅ For role-based pages
export function requireRole(router, allowedRoles) {
  const u = getSession();
  if (!u) {
    router.replace("/login");
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(u.role)) {
    // if logged in but wrong role, send them to their own home
    return u;
  }
  return u;
}