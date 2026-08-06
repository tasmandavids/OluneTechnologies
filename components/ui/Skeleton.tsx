// Layout-matching loading placeholders. Server-safe (no client JS) — each
// route's loading.tsx composes these so navigation shows the shape of the
// destination instead of an anonymous spinner.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--text)_7%,transparent)] motion-reduce:animate-none ${className}`}
    />
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="box rounded-2xl p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonToolbar() {
  return (
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-10 w-64 rounded-xl" />
      <Skeleton className="h-10 w-32 rounded-xl" />
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="box overflow-hidden rounded-2xl">
      <div className="border-b border-[--hair] px-5 py-3">
        <Skeleton className="h-4 w-2/3 max-w-md" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="hidden h-4 w-1/6 sm:block" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="box rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTabs({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2 border-b border-[--hair] pb-px">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-9 w-28 rounded-t-xl" />
      ))}
    </div>
  );
}

export function SkeletonTwoPane() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="box space-y-2 rounded-2xl p-3">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <div className="box hidden rounded-2xl p-6 lg:flex lg:flex-col lg:gap-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <div className="mt-auto space-y-3">
          <Skeleton className="ml-auto h-14 w-3/5 rounded-2xl" />
          <Skeleton className="h-14 w-3/5 rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCalendar() {
  return (
    <div className="box overflow-hidden rounded-2xl">
      <div className="grid grid-cols-7 gap-px border-b border-[--hair] p-3">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="mx-auto h-4 w-10" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 p-3">
        {Array.from({ length: 21 }, (_, i) => (
          <Skeleton key={i} className={`h-16 rounded-xl ${i % 3 === 0 ? "opacity-60" : i % 4 === 0 ? "opacity-30" : ""}`} />
        ))}
      </div>
    </div>
  );
}
