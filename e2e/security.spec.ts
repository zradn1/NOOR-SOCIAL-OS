import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, sql, uniqueEmail } from "./helpers";

function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test.describe("security", () => {
  test("pages send security headers and keep the session cookie away from scripts", async ({ page }) => {
    const response = await page.goto("/sign-in");
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();

    await signUpWithWorkspace(page, { name: "Cookie Check", email: uniqueEmail("cookie"), org: "Cookie Org" });
    const cookies = await page.context().cookies();
    const session = cookies.filter((c) => c.name.startsWith("sb-"));
    expect(session.length).toBeGreaterThan(0);
    expect(session.every((c) => c.httpOnly)).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
  });

  test("the admin area doesn't exist for regular users", async ({ page }) => {
    await signUpWithWorkspace(page, { name: "Not Admin", email: uniqueEmail("notadmin"), org: "Plain Org" });
    await page.goto("/admin");
    await expect(page.getByText("This page isn't here")).toBeVisible();
    await expect(page.getByText("Platform overview")).toHaveCount(0);
  });

  test("a suspended user is signed out on the next request", async ({ page }) => {
    const email = uniqueEmail("suspend");
    const slug = await signUpWithWorkspace(page, { name: "Soon Suspended", email, org: "Suspended Org" });
    await sql("update auth.users set banned_until = now() + interval '1 day' where email = $1", [email]);
    await page.goto(`/w/${slug}/dashboard`);
    await page.waitForURL("**/sign-in?error=suspended");
    await expect(page.getByText("This account is suspended")).toBeVisible();
    // The session cookies were cleared, not just hidden.
    expect((await page.context().cookies()).filter((c) => c.name.startsWith("sb-"))).toHaveLength(0);
  });

  test("the cron endpoint requires its secret", async ({ request }) => {
    expect((await request.post("/api/cron/publishing")).status()).toBe(401);
    expect((await request.post("/api/cron/publishing", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    const ok = await request.post("/api/cron/publishing", { headers: { authorization: "Bearer e2e-cron-secret" } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
  });

  test("billing webhooks need a valid, fresh Stripe signature and apply once", async ({ request, page }) => {
    const slug = await signUpWithWorkspace(page, { name: "Billing Check", email: uniqueEmail("billing"), org: "Billing Org" });
    const [{ organization_id }] = await sql<{ organization_id: string }>("select organization_id from workspaces where slug = $1", [slug]);
    const payload = JSON.stringify({
      id: `evt_e2e_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "cs_e2e", object: "checkout.session", mode: "subscription", client_reference_id: organization_id, customer: "cus_e2e", subscription: "sub_e2e", metadata: {} } },
    });
    const post = (signature?: string) =>
      request.post("/api/webhooks/stripe", { data: payload, headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) } });

    expect((await post()).status()).toBe(400);
    expect((await post(stripeSignature(payload, "whsec_wrong"))).status()).toBe(400);
    expect((await post(stripeSignature(payload, "whsec_e2e_secret", Math.floor(Date.now() / 1000) - 3600))).status()).toBe(400);

    const ok = await post(stripeSignature(payload, "whsec_e2e_secret"));
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ outcome: "applied" });
    const again = await post(stripeSignature(payload, "whsec_e2e_secret"));
    expect(await again.json()).toMatchObject({ outcome: "duplicate" });

    const [sub] = await sql<{ plan_id: string; provider_customer_id: string }>("select plan_id, provider_customer_id from subscriptions where organization_id = $1", [organization_id]);
    // Checkout links the customer; the plan only changes when a subscription event confirms payment.
    expect(sub).toEqual({ plan_id: "free", provider_customer_id: "cus_e2e" });
  });
});
