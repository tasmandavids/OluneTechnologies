import type { ReactNode } from "react";

function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <path
        d="M20 13.2A8.2 8.2 0 1 1 10.8 4a6.6 6.6 0 0 0 9.2 9.2Z"
        stroke="var(--brand)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * First-run / no-results state: icon, one-line explanation, optional CTA.
 * Server-safe — pass an interactive element via `action` from a client parent.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-14 text-center ${className}`}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]">
        {icon ?? <DefaultIcon />}
      </span>
      <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
