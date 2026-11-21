/** Shared by proxy.ts (no server-only imports there) and the session module. */
export const SESSION_COOKIE = "mb_session";

/**
 * Paths that work without signing in. Everything else redirects to /login (pages) or returns
 * 401 (APIs). /admin has its own password.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/",
  "/api/events",
  "/admin",
  "/api/admin/",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
