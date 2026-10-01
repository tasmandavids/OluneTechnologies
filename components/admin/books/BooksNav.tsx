"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS = [
  { href: "/portal/admin/books", key: "dashboard", exact: true },
  { href: "/portal/admin/books/journals", key: "journals" },
  { href: "/portal/admin/books/bills", key: "bills" },
  { href: "/portal/admin/books/bank", key: "bank" },
  { href: "/portal/admin/books/tax", key: "tax" },
  { href: "/portal/admin/books/reports", key: "reports" },
  { href: "/portal/admin/books/accounts", key: "accounts" },
  { href: "/portal/admin/books/settings", key: "settings" },
] as const;

export function BooksNav() {
  const t = useTranslations("books.nav");
  const pathname = usePathname();
  if (pathname.startsWith("/portal/admin/books/setup")) return null;
  return (
    <nav
      aria-label={t("label")}
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-[14px] border p-1.5"
      style={{
        background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
        borderColor: "var(--edge)",
        backdropFilter: "blur(var(--blur)) saturate(1.85)",
        WebkitBackdropFilter: "blur(var(--blur))",
      }}
    >
      {ITEMS.map((item) => {
        const active = "exact" in item && item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-[10px] px-4 py-1.5 text-xs font-semibold transition-all"
            aria-current={active ? "page" : undefined}
            style={{
              color: active ? "var(--ink, var(--text))" : "var(--muted)",
              background: active ? "var(--t3)" : "transparent",
              border: active ? "1px solid var(--tb)" : "1px solid transparent",
            }}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
