import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentSession } from "@/server/http/pageSession";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden · CouchChat Admin" };

export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  return <LoginForm />;
}
