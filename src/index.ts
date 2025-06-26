import { Segment } from "@segment/edge-sdk";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const segment = new Segment({
      routePrefix: "magic",
      writeKey: env.SEGMENT_WRITE_KEY,
    });

    const resp = await segment.handleEvent(request);
    return resp;
  },
};
