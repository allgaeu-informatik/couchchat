import { cookies } from "next/headers";
import { cookieName } from "../config";
import { tokenFromCookieHeader } from "../security/session";
import { resolveSession } from "../services/auth";

/** Session lookup for server-rendered pages (same logic as the API guard). */
export async function currentSession() {
  const jar = await cookies();
  const v = jar.get(cookieName())?.value;
  return resolveSession(tokenFromCookieHeader(v ? `${cookieName()}=${v}` : null));
}
