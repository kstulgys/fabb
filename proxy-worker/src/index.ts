/**
 * fabb pool relay — a thin forwarding proxy for the Fabijoniškės pool.
 *
 * Why it exists: the pool is behind Cloudflare, whose bot challenge 403s the
 * Convex deployment's datacenter IP for the schedule + booking endpoints. A
 * Cloudflare Worker egresses from Cloudflare's own network, which the pool does
 * NOT challenge — so the fabb backend sends every pool request through here.
 *
 * It is a DUMB transport: the caller (the `PoolGateway` in `convex/pool/`) still
 * owns the cookie jar, the 4-step booking flow, and response parsing. This Worker
 * only forwards one request and returns the pool's response verbatim.
 *
 * Locked down so it is not an open proxy:
 *  - requires the shared `X-Fabb-Secret` (a Worker secret `RELAY_SECRET`);
 *  - only forwards to https://www.fabijoniskiubaseinas.lt.
 *
 * Protocol: the caller sends the real request to this Worker with two control
 * headers — `X-Fabb-Target` (the absolute pool URL) and `X-Fabb-Secret` — and
 * its normal method/body/headers (User-Agent, Referer, Cookie, Content-Type).
 * The Worker forwards them and returns the pool's status, body, content-type and
 * Set-Cookie headers unchanged.
 */
interface Env {
  RELAY_SECRET: string;
}

const ALLOWED_HOST = "www.fabijoniskiubaseinas.lt";
// Control + hop-by-hop headers that must not be forwarded to the pool.
const STRIP = new Set(["host", "content-length", "x-fabb-target", "x-fabb-secret"]);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!env.RELAY_SECRET || req.headers.get("x-fabb-secret") !== env.RELAY_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const target = req.headers.get("x-fabb-target");
    if (!target) return new Response("missing x-fabb-target", { status: 400 });
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return new Response("bad x-fabb-target", { status: 400 });
    }
    if (u.protocol !== "https:" || u.hostname !== ALLOWED_HOST) {
      return new Response("target host not allowed", { status: 403 });
    }

    const fwd = new Headers();
    for (const [k, v] of req.headers) {
      if (!STRIP.has(k.toLowerCase())) fwd.set(k, v);
    }
    const isBodyless = req.method === "GET" || req.method === "HEAD";
    const poolRes = await fetch(target, {
      method: req.method,
      headers: fwd,
      body: isBodyless ? undefined : await req.text(),
    });

    const out = new Headers();
    const ct = poolRes.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    const setCookies =
      (poolRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of setCookies) out.append("set-cookie", c);
    return new Response(await poolRes.text(), { status: poolRes.status, headers: out });
  },
};
