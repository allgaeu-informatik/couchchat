import { json, readJson, route, sess } from "@/server/http/handler";
import { changeOwnPassword } from "@/server/services/users";
import { ownPasswordSchema } from "@/server/validation";
import { hostSyncWarning } from "@/server/services/hostSync";

export const dynamic = "force-dynamic";

export const POST = route("session", async (ctx) => {
  const s = sess(ctx);
  const body = await readJson(ctx.req, ownPasswordSchema);
  await changeOwnPassword(s.user, s.sessionId, body.currentPassword, body.newPassword, ctx.meta);
  return json({ ok: true, ...hostSyncWarning() });
});
