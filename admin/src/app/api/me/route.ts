import { json, readJson, route, sess } from "@/server/http/handler";
import { getOwnProfile, updateUser } from "@/server/services/users";
import { selfUpdateSchema } from "@/server/validation";
import { hostSyncWarning } from "@/server/services/hostSync";

export const dynamic = "force-dynamic";

export const GET = route("session", (ctx) => json({ user: getOwnProfile(sess(ctx).user) }));

/** Own profile: only username and displayname (enforced by schema AND by the permission rules in the service). */
export const PATCH = route("session", async (ctx) => {
  const { user } = sess(ctx);
  const patch = await readJson(ctx.req, selfUpdateSchema);
  const updated = updateUser(user, user.id, patch, ctx.meta);
  return json({ user: updated, ...hostSyncWarning() });
});
