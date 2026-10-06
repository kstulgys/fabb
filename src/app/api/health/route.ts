export const dynamic = "force-dynamic";

/** The deployment's health: the commit it was built from (`BUILD_SHA`, set by CI). */
export function GET() {
  return Response.json({ ok: true, sha: process.env.BUILD_SHA ?? null });
}
