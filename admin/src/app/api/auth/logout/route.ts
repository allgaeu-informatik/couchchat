import { json, route, sess } from "@/server/http/handler";
import { logout } from "@/server/services/auth";
import { clearSessionCookie } from "@/server/security/session";

export const dynamic = "force-dynamic";

export const POST = route("session", (ctx) => {
  logout(sess(ctx), ctx.meta);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
});
