import { json, readJson, route, sess } from "@/server/http/handler";
import { createUser, listUsers } from "@/server/services/users";
import { createUserSchema } from "@/server/validation";
import { hostSyncWarning } from "@/server/services/hostSync";

export const dynamic = "force-dynamic";

export const GET = route("admin", (ctx) => json({ users: listUsers(sess(ctx).user) }));

export const POST = route("admin", async (ctx) => {
  const body = await readJson(ctx.req, createUserSchema);
  const user = await createUser(sess(ctx).user, body, ctx.meta);
  return json({ user, ...hostSyncWarning() }, 201);
});
