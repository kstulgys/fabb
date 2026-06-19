# Pool I/O routed through a Cloudflare Worker relay

The Fabijoniškės pool is behind Cloudflare, whose bot challenge returns a 403
"Just a moment" page to the Convex deployment's datacenter IP for the schedule
and booking endpoints — so booking from Convex failed ("no spot reserved") even
with spots free, while the identical flow from a residential IP succeeded. Every
pool request is therefore routed through `proxy-worker/` (the `fabb-pool-proxy`
Cloudflare Worker), which forwards to the pool from Cloudflare's own network —
which the pool does not challenge. The Worker is a dumb transport: the
`PoolGateway` still owns the cookie jar, the four-step booking flow, and the
parsing; the Worker is locked to the pool host and a shared `RELAY_SECRET`.

Routing is gated on `POOL_RELAY_URL` + `POOL_RELAY_SECRET` (Convex env): unset
means go direct (fine from a residential IP, e.g. local dev). **Both must be set
on every deployment that books, including production** — otherwise prod silently
falls back to direct and is blocked again. A paid residential proxy and an
off-Convex always-on relay were the considered alternatives; the Worker won
because it is free, needs no new always-on infrastructure, and
Cloudflare-to-Cloudflare traffic clears the challenge.
