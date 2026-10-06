# fabb

Auto-booking for gym and group classes at the Fabijoniškės sports centre (Vilnius) — **[fabbin.app](https://fabbin.app)**

Browse the rolling two-week timetable, set standing AutoBook rules ("every Tuesday 18:00, HIIT"),
and a day-before cron grabs the spot. Bookings, attendance history, and calories in one place.

## Stack

Next.js (App Router) · Convex (data, auth, crons) · Tailwind CSS · Vitest

## Develop

```bash
bun install
bunx convex dev   # backend
bun run dev       # app on http://localhost:3000
bun run test
```

## Deploy previews

Every pull request deploys a preview to Cloudflare Workers (`fabb-pr-<number>`), and pushes to
`main` deploy `fabb-preview` and `fabb`; see `.github/workflows/web-*.yml`. The Workers build uses
[vinext](https://vinext.dev) (`bun run build:worker`, `vite.config.ts`, `wrangler.jsonc`);
`GET /api/health` reports the deployed commit.

## Sibling

[fabb-skill](https://github.com/kstulgys/fabb-skill) — a coding-agent skill that drives the same
timetable and booking flow from the terminal.
