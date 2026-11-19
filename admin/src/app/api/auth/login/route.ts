import { json, readJson, route } from "@/server/http/handler";
import { login } from "@/server/services/auth";
import { sessionCookie } from "@/server/security/session";
import { loginSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export const POST = route("public", async ({ req, meta }) => {
  const body = await readJson(req, loginSchema);
  const { token, user } = await login(body.username, body.password, meta);
  return json({ user }, 200, { "Set-Cookie": sessionCookie(token) });
});
