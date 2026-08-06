import type { Role } from "@/lib/types";

/** Admin routes office staff may access (client ops + messages + read-only classes). */
export const OFFICE_ALLOWED_PREFIXES = [
  "/portal/office",
  "/portal/admin/people",
  "/portal/admin/parents",
  "/portal/admin/students",
  "/portal/admin/leads",
  "/portal/admin/messages",
  "/portal/admin/classes",
] as const;

/**
 * Portal routes that belong to no single role. A studio policy can land on a
 * teacher, a parent and an adult student at once, so the screen where it gets
 * signed can't live under one role's prefix.
 */
export const SHARED_PORTAL_PREFIXES = ["/portal/forms"] as const;

export function isOfficeAllowedPath(pathname: string): boolean {
  return OFFICE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function isSharedPortalPath(pathname: string): boolean {
  return SHARED_PORTAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function canAccessPortalPath(role: Role, pathname: string): boolean {
  if (isSharedPortalPath(pathname)) return true;
  if (role === "admin") return pathname.startsWith("/portal/admin");
  if (role === "office") return isOfficeAllowedPath(pathname);
  if (role === "teacher") return pathname.startsWith("/portal/teacher");
  if (role === "parent") return pathname.startsWith("/portal/parent");
  if (role === "student") return pathname.startsWith("/portal/student");
  return false;
}
