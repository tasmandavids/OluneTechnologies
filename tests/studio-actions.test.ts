import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/lib/builder/document";
import { saveBuilderDocument } from "@/app/portal/admin/site/studio/actions";

const mocks = vi.hoisted(() => ({
  builderUpsert: vi.fn(),
  sitePageMaybeSingle: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "admin-user" } } })),
    },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { studio_id: "studio-a", role: "admin" },
              })),
            })),
          })),
        };
      }

      if (table === "site_pages") {
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: mocks.sitePageMaybeSingle,
        };
        return {
          select: vi.fn(() => query),
        };
      }

      if (table === "site_builder_documents") {
        return {
          upsert: mocks.builderUpsert,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

describe("Studio builder actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.builderUpsert.mockResolvedValue({ error: null });
  });

  it("does not save a builder document for a page outside the admin studio", async () => {
    mocks.sitePageMaybeSingle.mockResolvedValue({ data: null, error: null });
    const doc = createEmptyDocument({ title: "Hijacked", slug: "home" });

    const result = await saveBuilderDocument("victim-page", doc);

    expect(result).toEqual({ ok: false, error: "Page not found." });
    expect(mocks.builderUpsert).not.toHaveBeenCalled();
  });
});
