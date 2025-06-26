import { Segment } from "@segment/edge-sdk";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "./middleware";

// Define context variables type
type Variables = {
  requestId: string;
};

// Create a new Hono app
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware - Request ID
app.use("*", requestId());

// Global middleware - Logger
app.use("*", logger());

// Example custom middleware - Request timing
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  c.header("X-Response-Time", `${ms}ms`);
});

// Google Tag Manager route
app.use("/gtm.js", async (c) => {
  const resp = await fetch(
    `https://${c.env.GOOGLE_TAG_MANAGER.toLowerCase()}.fps.goog/`,
  );
  return resp;
});

// Segment route with the original functionality
app.all("*", async (c) => {
  const segment = new Segment({
    routePrefix: "magic",
    writeKey: c.env.SEGMENT_WRITE_KEY,
  });

  // Pass the raw request to Segment
  const resp = await segment.handleEvent(c.req.raw);
  return resp;
});

// Export for Cloudflare Workers
export default app;
