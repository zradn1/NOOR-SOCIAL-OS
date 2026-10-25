import { expect, test } from "@playwright/test";
import { lastEmailedLink, PASSWORD, signIn, signOut, signUp, signUpWithWorkspace, uniqueEmail } from "./helpers";

test.describe("authentication", () => {
  test("redirects anonymous visitors from protected routes and preserves the destination", async ({ page }) => {
    await page.goto("/w/some-workspace/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fw%2Fsome-workspace%2Fdashboard$/);
    for (const path of ["/onboarding", "/admin", "/app"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });

  test("validates sign-up input without losing what was typed", async ({ page }) => {
    await page.goto("/sign-up");
    await page.fill("#fullName", "Validation Person");
    await page.fill("#email", "not-an-email");
    await page.fill("#password", "short");
    await page.click("button[type=submit]");
    await expect(page.locator("#email-error")).toHaveText("Enter a valid email address.");
    await expect(page.locator("#password-error")).toHaveText("Use at least 10 characters.");
    await expect(page.locator("#fullName")).toHaveValue("Validation Person");
  });

  test("signs up, onboards, signs out, and signs back in", async ({ page }) => {
    const email = uniqueEmail("owner");
    const slug = await signUpWithWorkspace(page, { name: "Olivia Owner", email, org: "Atelier" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Atelier Main");
    await signOut(page);
    await page.goto(`/w/${slug}/dashboard`);
    await expect(page).toHaveURL(/\/sign-in/);

    await signIn(page, email, "wrong-password-1");
    await expect(page.locator("form [role=alert]")).toHaveText("That email and password combination didn't work.");

    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/dashboard$`));
  });

  test("honours a safe ?next= destination and ignores external ones", async ({ page }) => {
    const email = uniqueEmail("next");
    const slug = await signUpWithWorkspace(page, { name: "Nadia Next", email, org: "Nextco" });
    await signOut(page);
    await page.goto(`/sign-in?next=${encodeURIComponent(`/w/${slug}/settings/profile`)}`);
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/settings/profile$`));
    await signOut(page);

    await page.goto(`/sign-in?next=${encodeURIComponent("https://evil.example/")}`);
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/dashboard$`));
  });

  test("resets a forgotten password through the emailed link", async ({ page }) => {
    const email = uniqueEmail("reset");
    await signUp(page, { name: "Riya Reset", email });
    await page.goto("/sign-in");
    await page.goto("/forgot-password");
    await page.fill("#email", email);
    await page.click("button[type=submit]");
    await expect(page.getByText(/we've emailed a link/)).toBeVisible();

    const link = lastEmailedLink(email);
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.fill("#password", "brand-new-pass-7");
    await page.fill("#confirmPassword", "brand-new-pass-7");
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.context().clearCookies();
    await signIn(page, email, "brand-new-pass-7");
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("does not reveal whether an email has an account", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.fill("#email", uniqueEmail("nobody"));
    await page.click("button[type=submit]");
    await expect(page.getByText(/If an account exists/)).toBeVisible();
  });
});
