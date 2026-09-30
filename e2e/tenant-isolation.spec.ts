import { expect, test } from "@playwright/test";
import { accountFor, signIn } from "./helpers/auth";

const account = accountFor("ADMIN");
const foreignBaseUrl = process.env.E2E_FOREIGN_STUDIO_BASE_URL?.trim();
const foreignMarker = process.env.E2E_FOREIGN_STUDIO_MARKER?.trim();

test.describe("tenant host isolation", () => {
  test.skip(
    !account || !foreignBaseUrl || !foreignMarker,
    "Set E2E_ADMIN_* plus E2E_FOREIGN_STUDIO_BASE_URL and E2E_FOREIGN_STUDIO_MARKER.",
  );

  test("rejects a different studio host as a portal", async ({ page }) => {
    if (!account || !foreignBaseUrl || !foreignMarker) return;
    await signIn(page, account, "/portal/admin");
    await page.goto(new URL("/portal/admin/people", foreignBaseUrl).toString());

    await expect(page.locator("body")).not.toContainText(foreignMarker);
    expect(new URL(page.url()).pathname).not.toMatch(/^\/portal(?:\/|$)/);
  });
});
