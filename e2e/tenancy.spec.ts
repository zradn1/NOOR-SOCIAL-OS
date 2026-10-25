import { expect, test, type Browser } from "@playwright/test";
import { signUp, signUpWithWorkspace, uniqueEmail } from "./helpers";

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test.describe("workspace isolation and roles", () => {
  test("invited editors see only assigned workspaces and no admin sections", async ({ browser }) => {
    const owner = await newPage(browser);
    const slug = await signUpWithWorkspace(owner, { name: "Owner One", email: uniqueEmail("own"), org: "Studio One" });

    const editorEmail = uniqueEmail("editor");
    await owner.goto(`/w/${slug}/settings/organization`);
    await owner.getByRole("button", { name: "Invite" }).click();
    await owner.fill("#invite-email", editorEmail);
    await owner.selectOption("#invite-role", "editor");
    await owner.locator("input[name=workspaceIds]").first().check();
    await owner.getByRole("button", { name: "Create invitation link" }).click();
    const link = await owner.inputValue('input[aria-label="Invitation link"]');
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);

    const editor = await newPage(browser);
    await signUp(editor, { name: "Eddie Editor", email: editorEmail });
    await editor.goto(link);
    await Promise.all([editor.waitForURL(`**/w/${slug}/dashboard`), editor.getByRole("button", { name: "Accept invitation" }).click()]);

    // The shell streams in behind Suspense; wait for it before reading.
    await expect(editor.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
    const nav = await editor.locator("nav[aria-label=Main] a").allTextContents();
    expect(nav).toContain("Content Studio");
    expect(nav).not.toContain("Clients");
    expect(nav).not.toContain("Billing");
    await editor.goto(`/w/${slug}/settings/organization`);
    await expect(editor.getByText("You don't have access")).toBeVisible();

    // The link is single-use.
    const reuse = await newPage(browser);
    await signUp(reuse, { name: "Late Comer", email: uniqueEmail("late") });
    await reuse.goto(link);
    await expect(reuse.getByText("This invitation is no longer valid")).toBeVisible();
  });

  test("a different tenant cannot open another tenant's workspace", async ({ browser }) => {
    const owner = await newPage(browser);
    const slug = await signUpWithWorkspace(owner, { name: "Owner Two", email: uniqueEmail("own2"), org: "Private Co" });

    const outsider = await newPage(browser);
    await signUpWithWorkspace(outsider, { name: "Outsider", email: uniqueEmail("out"), org: "Elsewhere" });
    for (const path of ["dashboard", "settings", "settings/organization"]) {
      await outsider.goto(`/w/${slug}/${path}`);
      await expect(outsider.getByText("This page isn't here")).toBeVisible();
      await expect(outsider.getByText("Private Co")).toHaveCount(0);
    }
  });

  test("an invitation for one email cannot be accepted by another account", async ({ browser }) => {
    const owner = await newPage(browser);
    const slug = await signUpWithWorkspace(owner, { name: "Owner Three", email: uniqueEmail("own3"), org: "Guarded" });
    await owner.goto(`/w/${slug}/settings/organization`);
    await owner.getByRole("button", { name: "Invite" }).click();
    await owner.fill("#invite-email", uniqueEmail("intended"));
    await owner.selectOption("#invite-role", "viewer");
    await owner.getByRole("button", { name: "Create invitation link" }).click();
    const link = await owner.inputValue('input[aria-label="Invitation link"]');

    const intruder = await newPage(browser);
    await signUp(intruder, { name: "Intruder", email: uniqueEmail("intruder") });
    await intruder.goto(link);
    await expect(intruder.getByText("Signed in with a different email")).toBeVisible();
    await expect(intruder.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  });
});
