// ============================================================================
//  Small inline icon set for the dashboard attention/quick-action components.
//  1.5px stroke, round caps — matches the app's existing icon language
//  (see EmptyState's DefaultIcon) without adding an icon-library dependency.
// ============================================================================

import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function IconAlertCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.1" />
    </svg>
  );
}

export function IconUserPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="9.5" cy="8.5" r="3.25" />
      <path d="M3.5 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M18.5 8.5v5M16 11h5" />
    </svg>
  );
}

export function IconCalendarPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M12 12.5v4M10 14.5h4" />
    </svg>
  );
}

export function IconReceipt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5l-2-1.6z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
    </svg>
  );
}

export function IconMegaphone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 10v4a1.5 1.5 0 0 0 1.5 1.5h1l1.2 4h2l-1-4H11l7 3.5v-13l-7 3.5H5A1.5 1.5 0 0 0 3.5 10Z" />
    </svg>
  );
}

export function IconCheckCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.4 2.4 5.2-5.2" />
    </svg>
  );
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

export function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 19.5c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M15.5 6.2a3 3 0 0 1 0 5.8M18.7 19c-.2-2.4-1.6-4.1-3.7-4.8" />
    </svg>
  );
}

/** Staff lanyard — the Team space. Deliberately unlike IconUsers, which is the
 *  People space: one is who you employ, the other is who you teach. */
export function IconLanyard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="7" width="16" height="13.5" rx="2.5" />
      <path d="M9.5 7V5.6a2.5 2.5 0 0 1 5 0V7" />
      <circle cx="12" cy="12.6" r="1.9" />
      <path d="M8.7 17.6c.4-1.5 1.7-2.5 3.3-2.5s2.9 1 3.3 2.5" />
    </svg>
  );
}

export function IconCalendarDays(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13h1.5M11.25 13h1.5M15 13h1.5M7.5 16.5h1.5M11.25 16.5h1.5" />
    </svg>
  );
}

export function IconWallet(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="M14.5 13a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
      <path d="M4 9.5h13.5" />
    </svg>
  );
}

export function IconInbox(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 12.5 6.2 5h11.6L20 12.5" />
      <path d="M4 12.5v5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-5h-5l-1.2 2.5H10.2L9 12.5H4Z" />
    </svg>
  );
}

export function IconGlobe(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.7 5.6 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.6-3.7-9S9.6 5.5 12 3Z" />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </svg>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m19.5 19.5-4.35-4.35" />
    </svg>
  );
}

export function IconX(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m5.5 8.5 6.5 7 6.5-7" />
    </svg>
  );
}

export function IconTrendingUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 16 9 10.5l3.5 3.5L20.5 6" />
      <path d="M14.5 6h6v6" />
    </svg>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCreditCard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.25" />
      <path d="M3 9.5h18" />
      <path d="M6.5 14.5h4" />
    </svg>
  );
}

export function IconQrCode(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h3v3h3v3h-6v-3h-3v-3z" />
      <path d="M17.5 17.5v.01" />
    </svg>
  );
}

export function IconLayoutGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function IconGrip(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
