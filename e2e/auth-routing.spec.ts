import { expect, test } from "@playwright/test";
import { accountFor, signIn, type TestRole } from "./helpers/auth";

const routes: Array<{ role: TestRole; expectedPath: string }> = [
  { role: "ADMIN", expectedPath: "/portal/admin" },
  { role: "OFFICE", expectedPath: "/portal/office" },
  { role: "TEACHER", expectedPath: "/portal/teacher" },
  { role: "PARENT", expectedPath: "/portal/parent" },
  { role: "STUDENT", expectedPath: "/portal/student" },
];

for (const { role, expectedPath } of routes) {
  test.describe(`${role.toLowerCase()} routing`, () => {
    const account = accountFor(role);
    test.skip(!account, `Set E2E_${role}_EMAIL, E2E_${role}_PASSWORD and a base URL.`);

    test(`reaches ${expectedPath}`, async ({ page }) => {
      if (!account) return;
      await signIn(page, account, "/portal");
      await expect(page).toHaveURL((url) => url.pathname.startsWith(expectedPath), {
        timeout: 20_000,
      });
      await expect(page.locator("main")).toBeVisible();
    });
  });
}
