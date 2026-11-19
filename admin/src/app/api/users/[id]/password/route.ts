import { json, paramId, readJson, route, sess } from "@/server/http/handler";
import { resetPassword } from "@/server/services/users";
import { resetPasswordSchema } from "@/server/validation";
import { hostSyncWarning } from "@/server/services/hostSync";

export const dynamic = "force-dynamic";

export const POST = route("admin", async (ctx) => {
  const body = await readJson(ctx.req, resetPasswordSchema);
  await resetPassword(sess(ctx).user, paramId(ctx), body.newPassword, ctx.meta);
  return json({ ok: true, ...hostSyncWarning() });
});
