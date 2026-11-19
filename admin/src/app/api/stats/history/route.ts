import { z } from "zod";
import { json, route } from "@/server/http/handler";
import { getHistory } from "@/server/services/stats";
import { STATS_RANGES } from "@/server/types";

export const dynamic = "force-dynamic";

const query = z.object({ range: z.enum(STATS_RANGES, { error: "Ungültiger Zeitraum." }).default("24h") });

export const GET = route("admin", (ctx) => {
  const q = query.parse(Object.fromEntries(new URL(ctx.req.url).searchParams));
  return json(getHistory(q.range));
});
