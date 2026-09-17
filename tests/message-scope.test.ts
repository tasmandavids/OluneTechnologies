import { describe, expect, it } from "vitest";
import { scopedMessageConfig } from "@/lib/i18n/message-scope";

describe("scopedMessageConfig", () => {
  it("preserves the locale while merging layout-owned messages", () => {
    expect(
      scopedMessageConfig(
        "en",
        { common: { save: "Save" } },
        { admin: { title: "Dashboard" } },
      ),
    ).toEqual({
      locale: "en",
      messages: {
        common: { save: "Save" },
        admin: { title: "Dashboard" },
      },
    });
  });
});
