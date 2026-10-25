import { expect, test, type Browser } from "@playwright/test";
import { setPlanForWorkspace, signOut, signUp, signUpWithWorkspace, sql, uniqueEmail } from "./helpers";

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test.describe("product flows", () => {
  test("a demo workspace is labelled everywhere and schedules posts without publishing", async ({ page }) => {
    const slug = await signUpWithWorkspace(page, { name: "Demo Tester", email: uniqueEmail("demo"), org: "Demo Org" });
    await page.goto(`/w/${slug}/dashboard`);
    await Promise.all([page.waitForURL(/\/w\/[a-z0-9-]+-demo-[a-z0-9]+\/dashboard/), page.getByRole("button", { name: "Explore a demo workspace" }).click()]);
    const demo = new URL(page.url()).pathname.split("/")[2]!;
    await expect(page.getByText("Demo workspace", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Demo data").first()).toBeVisible();

    await page.goto(`/w/${demo}/content/new`);
    await page.fill("#caption", "Autumn notes, poured by hand. #E2E");
    await page.locator("label", { hasText: "· X" }).locator("input[type=checkbox]").check();
    await Promise.all([page.waitForURL(/\/content\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Save draft" }).click()]);
    await page.getByRole("button", { name: "Schedule" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
    await expect(page.getByText("Delivery")).toBeVisible();

    const [post] = await sql<{ status: string; is_demo: boolean }>(
      "select p.status::text, p.is_demo from content_posts p join workspaces w on w.id = p.workspace_id where w.slug = $1 and p.caption like 'Autumn notes%'",
      [demo],
    );
    expect(post).toEqual({ status: "scheduled", is_demo: true });
    // Nothing in a demo workspace can ever be marked published.
    const published = await sql("select 1 from post_platform_targets t join workspaces w on w.id = t.workspace_id where w.slug = $1 and t.status = 'published'", [demo]);
    expect(published).toHaveLength(0);
  });

  test("analytics import is plan-gated, then imports and labels the numbers", async ({ page }) => {
    const slug = await signUpWithWorkspace(page, { name: "Import Tester", email: uniqueEmail("import"), org: "Import Org" });
    await page.goto(`/w/${slug}/accounts`);
    await page.getByRole("button", { name: "Track manually" }).first().click();
    await page.fill("#manual-name-instagram", "Our Instagram");
    await page.getByRole("button", { name: "Add for manual tracking" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto(`/w/${slug}/analytics/import`);
    await expect(page.getByText("Metric imports are part of the Starter plan and above")).toBeVisible();

    await setPlanForWorkspace(slug, "starter");
    await page.reload();
    const csv = ["date,followers,reach,likes", "2026-10-01,1200,5400,210", "2026-10-02,1210,,190", "2026-10-03,1225,5600,230"].join("\n");
    await page.setInputFiles("#import-file", { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "Import 3 days" }).click();
    await expect(page.getByText("Imported 3 days").first()).toBeVisible();

    const rows = await sql<{ data_source: string; reach: number | null }>(
      "select s.data_source::text, s.reach from analytics_snapshots s join workspaces w on w.id = s.workspace_id where w.slug = $1 order by s.metric_date",
      [slug],
    );
    expect(rows.map((r) => r.data_source)).toEqual(["manual_import", "manual_import", "manual_import"]);
    expect(rows[1]!.reach).toBeNull();
    await page.goto(`/w/${slug}/analytics`);
    await expect(page.getByText("Imported").first()).toBeVisible();
  });

  test("the AI assistant runs in labelled demo mode and drafts a post", async ({ page }) => {
    const slug = await signUpWithWorkspace(page, { name: "AI Tester", email: uniqueEmail("ai"), org: "AI Org" });
    await page.goto(`/w/${slug}/assistant`);
    await expect(page.getByText("Demo mode · no AI model")).toBeVisible();
    await page.fill("#ai-brief", "Launch of a hand-poured amber candle for autumn.");
    await page.getByRole("button", { name: "Generate demo output" }).click();
    await expect(page.getByText("No AI model produced this text.")).toBeVisible();
    await page.getByRole("link", { name: "Start a post" }).first().click();
    await expect(page.getByText("Started from demo output")).toBeVisible();
    expect((await page.inputValue("#caption")).length).toBeGreaterThan(10);
  });

  test("client guests only ever see their own client workspace", async ({ browser }) => {
    const owner = await newPage(browser);
    const home = await signUpWithWorkspace(owner, { name: "Agency Owner", email: uniqueEmail("agency"), org: "Agency Co" });
    await setPlanForWorkspace(home, "agency");

    await owner.goto(`/w/${home}/clients`);
    await owner.getByRole("button", { name: "New workspace" }).click();
    await owner.fill("#ws-name", "Riad Client");
    await Promise.all([owner.waitForURL(/\/w\/riad-client-[a-z0-9]+\/dashboard/), owner.getByRole("button", { name: "Create workspace" }).click()]);
    const client = new URL(owner.url()).pathname.split("/")[2]!;

    const guestEmail = uniqueEmail("guest");
    await owner.goto(`/w/${client}/settings/members`);
    await owner.getByRole("button", { name: "Invite guest" }).click();
    await owner.fill("#guest-email", guestEmail);
    await owner.getByRole("button", { name: "Create invitation link" }).click();
    const link = await owner.inputValue('input[aria-label="Invitation link"]');
    await owner.getByRole("button", { name: "Done" }).click();
    await signOut(owner);

    const guest = await newPage(browser);
    await signUp(guest, { name: "Brand Lead", email: guestEmail });
    await guest.goto(link);
    await Promise.all([guest.waitForURL(`**/w/${client}/dashboard`), guest.getByRole("button", { name: "Accept invitation" }).click()]);
    await expect(guest.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
    const nav = await guest.locator("nav[aria-label=Main] a").allTextContents();
    expect(nav).not.toContain("Clients");
    expect(nav).not.toContain("Billing");

    await guest.goto(`/w/${home}/dashboard`);
    await expect(guest.getByText("This page isn't here")).toBeVisible();
    await expect(guest.getByText("Agency Co")).toHaveCount(0);

    const [membership] = await sql<{ is_client_guest: boolean; role: string }>(
      "select m.is_client_guest, m.role::text from organization_members m join profiles p on p.id = m.user_id where p.email = $1",
      [guestEmail],
    );
    expect(membership).toEqual({ is_client_guest: true, role: "viewer" });
  });
});
