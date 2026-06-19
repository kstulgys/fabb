import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  // The dashboard is the app's home; it redirects to /signin when signed out.
  //
  // A magic-link click lands on SITE_URL (this root) with a `?code=` that the
  // client ConvexAuthProvider must read to finish signing in. A bare
  // redirect("/dashboard") drops the query string, so forward `code` onward to
  // /dashboard, where the (client) provider consumes it and establishes the
  // session. Without this, the click bounces /dashboard -> /signin.
  const { code } = await searchParams;
  const token = typeof code === "string" ? code : undefined;
  redirect(token ? `/dashboard?code=${encodeURIComponent(token)}` : "/dashboard");
}
