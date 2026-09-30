import { expect, type Page } from "@playwright/test";

export type TestRole = "ADMIN" | "OFFICE" | "TEACHER" | "PARENT" | "STUDENT";

export type TestAccount = {
  role: TestRole;
  email: string;
  password: string;
  baseUrl: string;
};

function isProductionHost(hostname: string): boolean {
  return hostname === "olune.co.nz" || hostname.endsWith(".olune.co.nz");
}

function assertSafeTarget(baseUrl: string): void {
  const url = new URL(baseUrl);
  if (isProductionHost(url.hostname) && process.env.E2E_ALLOW_PRODUCTION_READONLY !== "1") {
    throw new Error(
      `Refusing to run authenticated browser tests against ${url.hostname}. ` +
        "Use an isolated staging/preview target, or explicitly set " +
        "E2E_ALLOW_PRODUCTION_READONLY=1 for the read-only suite.",
    );
  }
}

export function accountFor(role: TestRole): TestAccount | null {
  const email = process.env[`E2E_${role}_EMAIL`]?.trim();
  const password = process.env[`E2E_${role}_PASSWORD`];
  const baseUrl =
    process.env[`E2E_${role}_BASE_URL`]?.trim() || process.env.E2E_BASE_URL?.trim();
  if (!email || !password || !baseUrl) return null;
  assertSafeTarget(baseUrl);
  return { role, email, password, baseUrl };
}

export function absoluteUrl(account: TestAccount, path: string): string {
  return new URL(path, account.baseUrl).toString();
}

export async function signIn(page: Page, account: TestAccount, nextPath: string): Promise<void> {
  const loginUrl = new URL("/login", account.baseUrl);
  loginUrl.searchParams.set("next", nextPath);
  await page.goto(loginUrl.toString());
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').first().click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
}
