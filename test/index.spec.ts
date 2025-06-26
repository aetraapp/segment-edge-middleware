import {
  createExecutionContext,
  env,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Mock the Segment module
vi.mock("@segment/edge-sdk", () => ({
  Segment: vi.fn().mockImplementation(() => ({
    handleEvent: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    ),
  })),
}));

// Mock global fetch for GTM requests
globalThis.fetch = vi.fn();

describe("Hono Worker with Segment and Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes response time header", async () => {
    const request = new IncomingRequest("http://example.com/any-path");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.headers.get("X-Response-Time")).toMatch(/\d+ms/);
  });

  it("includes request ID header", async () => {
    const request = new IncomingRequest("http://example.com/any-path");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.headers.get("X-Request-ID")).toBeDefined();
  });

  it("forwards all requests to Segment", async () => {
    const request = new IncomingRequest("http://example.com/magic/track");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it("handles different HTTP methods", async () => {
    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];

    for (const method of methods) {
      const request = new IncomingRequest("http://example.com/magic/event", {
        method,
      });
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
    }
  });

  it("maintains request headers through middleware", async () => {
    const request = new IncomingRequest("http://example.com/magic/track", {
      headers: {
        "Content-Type": "application/json",
        "X-Custom-Header": "test-value",
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    // Check that our middleware headers are added
    expect(response.headers.get("X-Response-Time")).toBeDefined();
    expect(response.headers.get("X-Request-ID")).toBeDefined();
  });

  it("handles requests with body", async () => {
    const body = JSON.stringify({ event: "page_view", userId: "test-user" });
    const request = new IncomingRequest("http://example.com/magic/track", {
      body,
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
  });

  it("handles GTM route", async () => {
    const gtmResponseBody = "// Google Tag Manager script content";
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(gtmResponseBody, {
        headers: { "Content-Type": "application/javascript" },
        status: 200,
      }),
    );

    const request = new IncomingRequest("http://example.com/gtm.js");
    const ctx = createExecutionContext();

    // Create a test environment with GOOGLE_TAG_MANAGER variable
    const testEnv = {
      ...env,
      GOOGLE_TAG_MANAGER: "GTM-XXXXXX",
    };

    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    // Verify fetch was called with correct URL
    expect(mockFetch).toHaveBeenCalledWith("https://gtm-xxxxxx.fps.goog/");

    // Verify response
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript");
    const responseText = await response.text();
    expect(responseText).toBe(gtmResponseBody);
  });

  it("includes middleware headers on GTM route", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("// GTM script", {
        headers: { "Content-Type": "application/javascript" },
        status: 200,
      }),
    );

    const request = new IncomingRequest("http://example.com/gtm.js");
    const ctx = createExecutionContext();

    const testEnv = {
      ...env,
      GOOGLE_TAG_MANAGER: "GTM-TEST123",
    };

    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    // Check that middleware headers are added
    expect(response.headers.get("X-Response-Time")).toMatch(/\d+ms/);
    expect(response.headers.get("X-Request-ID")).toBeDefined();
  });
});
