import { redirect } from "next/navigation";

export default function Home() {
  // The dashboard is the app's home; it redirects to /signin when signed out.
  redirect("/dashboard");
}
