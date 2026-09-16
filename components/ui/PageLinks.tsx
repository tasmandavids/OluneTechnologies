import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { PAGE_SIZE } from "@/lib/pagination";

export async function PageLinks({ page, total, baseHref }: { page: number; total: number; baseHref: string }) {
  const t = await getTranslations("common.pagination");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (value: number) => `${baseHref}${baseHref.includes("?") ? "&" : "?"}page=${value}`;
  return <nav aria-label={t("label")} className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 text-sm">
    {page > 1 ? <Link href={href(page - 1)} scroll={false}>{t("previous")}</Link> : <span />}
    <span>{t("page", { page, pages, total })}</span>
    {page < pages ? <Link href={href(page + 1)} scroll={false}>{t("next")}</Link> : <span />}
  </nav>;
}
