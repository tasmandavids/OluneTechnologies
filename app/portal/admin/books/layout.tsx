// ============================================================================
//  /portal/admin/books — Olune Books, the built-in ledger.
//
//  Owns the `books` message namespace (kept out of the shared bundle by the
//  root layout, like `admin`) and the sub-navigation. Each page does its own
//  access check through lib/ledger/server/guard.ts.
// ============================================================================

import type { ReactNode } from "react";
import { getMessages } from "next-intl/server";
import { MessageScope } from "@/components/i18n/MessageScope";
import { BooksNav } from "@/components/admin/books/BooksNav";
import { requireBooksAdmin } from "@/lib/ledger/server/guard";

export default async function BooksLayout({ children }: { children: ReactNode }) {
  await requireBooksAdmin();
  const messages = await getMessages();
  return (
    <MessageScope messages={{ books: messages.books }}>
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <BooksNav />
      </div>
      {children}
    </MessageScope>
  );
}
