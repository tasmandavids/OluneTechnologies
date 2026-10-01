import "server-only";

import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal/session";
import { loadBooksContext, type BooksContext } from "./data";

export const BOOKS_PATH = "/portal/admin/books";

/** Books is bookkeeping: studio admins only, same as Money. */
export async function requireBooksAdmin() {
  const session = await requirePortalSession();
  if (session.role !== "admin") redirect("/portal/admin");
  return session;
}

/** For pages that need Books switched on. Sends everyone else to setup. */
export async function requireBooks(): Promise<{ session: Awaited<ReturnType<typeof requireBooksAdmin>>; ctx: BooksContext }> {
  const session = await requireBooksAdmin();
  const ctx = await loadBooksContext(session.supabase, session.studioId);
  if (!ctx) redirect(`${BOOKS_PATH}/setup`);
  return { session, ctx };
}
