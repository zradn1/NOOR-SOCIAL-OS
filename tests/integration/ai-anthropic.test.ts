import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiRequestSchema } from "@/lib/ai/tasks";
import { anthropicProvider } from "@/server/ai/anthropic";
import type { AppError } from "@/server/errors";

/**
 * Contract test: runs the real SDK against a local stand-in for the Messages
 * API to check the request we send and how responses and errors are handled.
 * The stand-in is test-only; it is never used by the app.
 */
type Captured = { headers: IncomingMessage["headers"]; body: Record<string, unknown> };
let server: Server;
let captured: Captured[] = [];
let reply: { status: number; body: unknown; headers?: Record<string, string> };
const previousBaseUrl = process.env.ANTHROPIC_BASE_URL;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      captured.push({ headers: req.headers, body: JSON.parse(raw || "{}") });
      res.writeHead(reply.status, { "content-type": "application/json", "request-id": "req_test", ...reply.headers });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (previousBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = previousBaseUrl;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  captured = [];
});

function message(content: unknown[], stop_reason = "end_turn", model = "claude-opus-5-5") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 80 },
  };
}

const output = { items: [{ title: null, body: "Autumn, poured by hand.", platform: "instagram", hashtags: ["candles"] }], notes: null };
const req = aiRequestSchema.parse({ task: "caption", brief: "Amber candle launch", platforms: ["instagram"], count: 1 });
const brand = { workspaceName: "Maison", description: null };
// Unique key per test so the provider builds a fresh client after the base URL is set.
const provider = (n: number) => anthropicProvider({ apiKey: `test-key-${n}`, model: "claude-opus-5-5", effort: "medium" });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected failure");
}

describe("Anthropic provider", () => {
  it("sends a structured-output request with fallbacks and parses the result", async () => {
    reply = { status: 200, body: message([{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: JSON.stringify(output) }]) };
    const result = await provider(1).generate(req, brand);
    expect(result).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", isDemoOutput: false, usage: { inputTokens: 120, outputTokens: 80 } });
    expect(result.output).toEqual(output);

    const [{ headers, body }] = captured;
    expect(headers.authorization).toBe("Bearer test-key-1");
    expect(String(headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16000, fallbacks: "default" });
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    const config = body.output_config as { effort: string; format: { type: string } };
    expect(config.effort).toBe("medium");
    expect(config.format.type).toBe("json_schema");
    expect(JSON.stringify(body.messages)).toContain("<brief>");
  });

  it("records the model that actually answered after a fallback", async () => {
    reply = { status: 200, body: message([{ type: "text", text: JSON.stringify(output) }], "end_turn", "claude-opus-4-8") };
    expect((await provider(2).generate(req, brand)).model).toBe("claude-opus-4-8");
  });

  it("turns a refusal into a user-facing validation error", async () => {
    reply = { status: 200, body: message([], "refusal") };
    const err = await failure(provider(3).generate(req, brand));
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toMatch(/declined/);
  });

  it("treats truncated output as incomplete", async () => {
    reply = { status: 200, body: message([{ type: "text", text: '{"items": [' }], "max_tokens") };
    expect((await failure(provider(4).generate(req, brand))).code).toBe("INTEGRATION_UNAVAILABLE");
  });

  it("maps authentication failures without leaking details", async () => {
    reply = { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } };
    const err = await failure(provider(5).generate(req, brand));
    expect(err.code).toBe("NOT_CONFIGURED");
    expect(err.message).not.toContain("x-api-key");
  });

  it("maps rate limits after the SDK's own retries", async () => {
    reply = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, headers: { "retry-after": "0" } };
    const err = await failure(provider(6).generate(req, brand));
    expect(err.code).toBe("RATE_LIMITED");
    expect(captured.length).toBe(3); // first attempt + 2 retries
  });
});
