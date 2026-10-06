import { isPreviewTestAccount, SESSION_COOKIE, sessionToken } from "@/lib/preview-session";

export const dynamic = "force-dynamic";

/** Signs in with `{ email, password }`. Only the preview test account exists, and only on a preview. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const token = isPreviewTestAccount(body?.email, body?.password) ? await sessionToken() : null;
  if (!token) return Response.json({ error: "Wrong email or password." }, { status: 401 });
  return Response.json(
    { email: body!.email },
    { headers: { "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` } },
  );
}

/** Signs out. */
export function DELETE() {
  return new Response(null, { status: 204, headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
}
