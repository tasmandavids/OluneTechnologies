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
