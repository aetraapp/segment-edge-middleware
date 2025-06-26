import type { Context, Next } from "hono";

// Request ID middleware
export const requestId = () => {
  return async (c: Context, next: Next) => {
    const id = crypto.randomUUID();
    c.set("requestId", id);
    c.header("X-Request-ID", id);

    await next();
  };
};
