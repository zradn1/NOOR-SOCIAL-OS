import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiRequestSchema } from "@/lib/ai/tasks";
import { demoProvider } from "@/server/ai/demo";
import type { AiProvider } from "@/server/ai/provider";
import type { DB } from "@/server/db/schema.generated";
import type { AppError } from "@/server/errors";
import { generateWithAssistant, getGenerationItem, listGenerations } from "@/server/services/ai";
import { addMember, assignWorkspace, createAuthUser, createOrganization, createTestDb, type OrgFixture, type TestDb } from "../support/db";
import { contextFor, kyselyFor } from "../support/services";

let db: TestDb;
let k: Kysely<DB>;
let owner: string;
let analyst: string;
let viewer: string;
let outsider: string;
let org: OrgFixture;
let otherOrg: OrgFixture;
let calls = 0;

// Test-only stand-in for a model provider.
const fakeModel: AiProvider = {
  id: "anthropic",
  async generate() {
    calls++;
    return {
      output: { items: [{ title: "Hook", body: "Autumn, poured by hand.", platform: "instagram", hashtags: ["#candles", "bad tag"] }], notes: null },
      provider: "anthropic",
      model: "claude-opus-5-5",
      isDemoOutput: false,
      usage: { inputTokens: 10, outputTokens: 10 },
    };
  },
};

const request = aiRequestSchema.parse({ task: "caption", brief: "Amber candle launch", platforms: ["instagram"], count: 1 });

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected the call to fail");
}

beforeAll(async () => {
  db = await createTestDb();
  k = kyselyFor(db);
  owner = await createAuthUser(db.sys, "owner@ai.test");
  analyst = await createAuthUser(db.sys, "analyst@ai.test");
  viewer = await createAuthUser(db.sys, "viewer@ai.test");
  outsider = await createAuthUser(db.sys, "outsider@ai.test");
  org = await createOrganization(db, owner, "AI Co");
  otherOrg = await createOrganization(db, outsider, "Other Co");
  for (const [user, role] of [
    [analyst, "analyst"],
    [viewer, "viewer"],
  ] as const) {
    await addMember(db, org.organizationId, user, role);
    await assignWorkspace(db, org.workspaceId, org.organizationId, user, role);
  }
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

describe("AI assistant service", () => {
  it("requires the analyst role", async () => {
    const ctx = await contextFor(db, viewer, org.workspaceId);
    expect((await errorOf(generateWithAssistant(ctx, request, { provider: fakeModel, db: k }))).code).toBe("FORBIDDEN");
    expect(calls).toBe(0);
  });

  it("refuses when no provider is configured", async () => {
    const ctx = await contextFor(db, analyst, org.workspaceId);
    expect((await errorOf(generateWithAssistant(ctx, request, { provider: null, db: k }))).code).toBe("NOT_CONFIGURED");
  });

  it("requires platforms for adaptation", async () => {
    const ctx = await contextFor(db, analyst, org.workspaceId);
    const adapt = aiRequestSchema.parse({ task: "adapt", brief: "Original caption" });
    expect((await errorOf(generateWithAssistant(ctx, adapt, { provider: fakeModel, db: k }))).code).toBe("VALIDATION");
  });

  it("stores model output sanitized and meters it", async () => {
    const ctx = await contextFor(db, analyst, org.workspaceId);
    const g = await generateWithAssistant(ctx, request, { provider: fakeModel, db: k });
    expect(g).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", isDemoOutput: false });
    expect(g.output.items[0]!.hashtags).toEqual(["candles"]);
    const usage = await db.sys.query("select count(*)::int as n from usage_records where organization_id = $1 and metric = 'ai_generation'", [org.organizationId]);
    expect(usage.rows[0].n).toBe(1);
  });

  it("does not meter demo output", async () => {
    const ctx = await contextFor(db, analyst, org.workspaceId);
    const g = await generateWithAssistant(ctx, request, { provider: demoProvider, db: k });
    expect(g).toMatchObject({ provider: "demo", model: null, isDemoOutput: true });
    const usage = await db.sys.query("select count(*)::int as n from usage_records where organization_id = $1 and metric = 'ai_generation'", [org.organizationId]);
    expect(usage.rows[0].n).toBe(1);
  });

  it("refuses model calls once the monthly quota is used, before calling the model", async () => {
    // Free plan: 20 generations a month; 1 is already used.
    await db.sys.query(
      `insert into usage_records (organization_id, workspace_id, user_id, metric, quantity) values ($1, $2, $3, 'ai_generation', 19)`,
      [org.organizationId, org.workspaceId, analyst],
    );
    const ctx = await contextFor(db, analyst, org.workspaceId);
    const before = calls;
    expect((await errorOf(generateWithAssistant(ctx, request, { provider: fakeModel, db: k }))).code).toBe("LIMIT_EXCEEDED");
    expect(calls).toBe(before);
    // Demo output stays available.
    await expect(generateWithAssistant(ctx, request, { provider: demoProvider, db: k })).resolves.toMatchObject({ isDemoOutput: true });
  });

  it("history is visible to members who can use the assistant", async () => {
    const mine = await listGenerations(await contextFor(db, analyst, org.workspaceId), 20, k);
    expect(mine.length).toBe(3);
    // Viewers can't use the assistant, and RLS hides its history from them too.
    expect(await listGenerations(await contextFor(db, viewer, org.workspaceId), 20, k)).toEqual([]);
    const forged = await contextFor(db, owner, org.workspaceId);
    forged.identity = { userId: outsider, email: "outsider@ai.test", sessionId: null };
    expect(await listGenerations(forged, 20, k)).toEqual([]);
    expect(await getGenerationItem(forged, mine[0]!.id, 0, k)).toBeNull();
  });

  it("an item can't be read through another workspace", async () => {
    const [g] = await listGenerations(await contextFor(db, owner, org.workspaceId), 1, k);
    const other = await contextFor(db, outsider, otherOrg.workspaceId);
    expect(await getGenerationItem(other, g!.id, 0, k)).toBeNull();
    expect(await getGenerationItem(await contextFor(db, owner, org.workspaceId), g!.id, 0, k)).toMatchObject({ body: expect.any(String) });
  });
});
