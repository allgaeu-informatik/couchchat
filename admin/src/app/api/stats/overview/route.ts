import { json, route } from "@/server/http/handler";
import { getOverview } from "@/server/services/stats";

export const dynamic = "force-dynamic";

/** Admin only: live numbers, tiles and system info (counts and room names only, never participant names). */
export const GET = route("admin", async () => json(await getOverview()));
