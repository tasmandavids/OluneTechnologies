import type { Role } from "@/lib/types";
import { PortalShellClient } from "./PortalShellClient";
import type { NavItem, NavSection } from "@/lib/portal/nav-config";
import type { ThemeBase } from "@/lib/types";

export function PortalShell({
  role,
  studioName,
  logoUrl = null,
  userName,
  showAffiliations = false,
  selfManagedStudent = false,
  portalTheme = "light",
  adminNav,
  officeNav,
  roleNav,
  children,
}: {
  role: Role;
  studioName: string;
  logoUrl?: string | null;
  userName: string | null;
  showAffiliations?: boolean;
  selfManagedStudent?: boolean;
  portalTheme?: ThemeBase;
  /** Entitlement-filtered nav, resolved server-side. Omit to show everything. */
  adminNav?: NavSection[];
  officeNav?: NavSection[];
  roleNav?: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <PortalShellClient
      role={role}
      studioName={studioName}
      logoUrl={logoUrl}
      userName={userName}
      showAffiliations={showAffiliations}
      selfManagedStudent={selfManagedStudent}
      portalTheme={portalTheme}
      adminNav={adminNav}
      officeNav={officeNav}
      roleNav={roleNav}
    >
      {children}
    </PortalShellClient>
  );
}
