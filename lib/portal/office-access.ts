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

export function isOfficeAllowedPath(pathname: string): boolean {
  return OFFICE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function canAccessPortalPath(role: Role, pathname: string): boolean {
  if (role === "admin") return pathname.startsWith("/portal/admin");
  if (role === "office") return isOfficeAllowedPath(pathname);
  if (role === "teacher") return pathname.startsWith("/portal/teacher");
  if (role === "parent") return pathname.startsWith("/portal/parent");
  if (role === "student") return pathname.startsWith("/portal/student");
  return false;
}
