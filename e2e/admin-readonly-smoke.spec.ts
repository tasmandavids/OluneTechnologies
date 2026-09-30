import { expect, test } from "@playwright/test";
import { absoluteUrl, accountFor, signIn } from "./helpers/auth";

const adminRoutes = [
  "/portal/admin",
  "/portal/admin/people",
  "/portal/admin/classes",
  "/portal/admin/money",
] as const;

const account = accountFor("ADMIN");

test.describe("admin operational smoke", () => {
  test.skip(!account, "Set the E2E_ADMIN_* credentials and base URL.");

  test("opens the highest-risk operational screens", async ({ page }) => {
    if (!account) return;
    await signIn(page, account, "/portal/admin");
    for (const route of adminRoutes) {
      await page.goto(absoluteUrl(account, route));
      await expect(page).toHaveURL((url) => url.pathname.startsWith(route));
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });
});
