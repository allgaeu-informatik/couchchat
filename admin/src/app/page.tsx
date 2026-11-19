import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { currentSession } from "@/server/http/pageSession";
import { getOwnProfile, listUsers } from "@/server/services/users";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session) redirect("/login");
  const profile = getOwnProfile(session.user);
  const users = session.user.role === "admin" ? listUsers(session.user) : [];
  return <Dashboard initialProfile={profile} initialUsers={users} />;
}
