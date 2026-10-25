import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-42";

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@e2e.test`;
}

export async function signUp(page: Page, { name, email }: { name: string; email: string }) {
  await page.goto("/sign-up");
  await page.fill("#fullName", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL("**/onboarding"), page.click("button[type=submit]")]);
}

/** Signs up and completes onboarding; returns the new workspace slug. */
export async function signUpWithWorkspace(page: Page, { name, email, org }: { name: string; email: string; org: string }) {
  await signUp(page, { name, email });
  await page.fill("#organizationName", org);
  await page.fill("#workspaceName", `${org} Main`);
  await Promise.all([page.waitForURL("**/w/*/dashboard"), page.click("button[type=submit]")]);
  return new URL(page.url()).pathname.split("/")[2]!;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}

export async function signOut(page: Page) {
  await page.click('button[aria-label^="Account menu"]');
  await Promise.all([page.waitForURL("**/sign-in"), page.getByRole("menuitem", { name: "Sign out" }).click()]);
}

/** Latest link the auth emulator "emailed" to an address. */
export function lastEmailedLink(email: string) {
  const log = readFileSync(path.resolve(".local/auth-emulator-mail.log"), "utf8").trim().split("\n");
  const line = [...log].reverse().find((l) => l.split("\t")[1] === email);
  expect(line, `no email sent to ${email}`).toBeTruthy();
  return line!.split("\t")[3]!;
}

/** Direct database access for test setup and assertions (never used by the app under test). */
export async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/noor_e2e" });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Changes an organization's plan the way a platform admin would (test setup only). */
export async function setPlanForWorkspace(slug: string, planId: string) {
  await sql(
    `update subscriptions set plan_id = $2, provider = case when $2 = 'free' then 'none' else 'manual' end
      where organization_id = (select organization_id from workspaces where slug = $1)`,
    [slug, planId],
  );
}
