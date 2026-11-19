import { json, paramId, readJson, route, sess } from "@/server/http/handler";
import { deleteUser, updateUser } from "@/server/services/users";
import { adminUpdateSchema } from "@/server/validation";
import { hostSyncWarning } from "@/server/services/hostSync";

export const dynamic = "force-dynamic";

export const PATCH = route("admin", async (ctx) => {
  const patch = await readJson(ctx.req, adminUpdateSchema);
  const user = updateUser(sess(ctx).user, paramId(ctx), patch, ctx.meta);
  return json({ user, ...hostSyncWarning() });
});

export const DELETE = route("admin", (ctx) => {
  deleteUser(sess(ctx).user, paramId(ctx), ctx.meta);
  return json({ ok: true, ...hostSyncWarning() });
});
