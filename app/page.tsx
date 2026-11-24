import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";

export default async function RootPage() {
  await verifySession(); // redirects to /login if not signed in by an allowed email
  redirect("/dashboard");
}
