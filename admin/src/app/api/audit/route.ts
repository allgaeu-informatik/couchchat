import { z } from "zod";
import { json, route } from "@/server/http/handler";
import { listAudit } from "@/server/services/audit";
import { AUDIT_ACTIONS } from "@/server/types";

export const dynamic = "force-dynamic";

const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.enum(AUDIT_ACTIONS).optional(),
});

export const GET = route("admin", (ctx) => {
  const q = query.parse(Object.fromEntries(new URL(ctx.req.url).searchParams));
  return json(listAudit(q));
});
