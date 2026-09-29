import { redirect } from "next/navigation";

// Root redirects: authenticated users go to dashboard, others to login.
// The actual auth check happens inside /dashboard via the client component.
export default function Home() {
  redirect("/dashboard");
}
