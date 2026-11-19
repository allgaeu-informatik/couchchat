import { createHash, randomBytes } from "node:crypto";
import { cookieName, cookieSecure, SESSION_ABSOLUTE_MS } from "../config";

export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function sessionCookie(token: string): string {
  const parts = [`${cookieName()}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_ABSOLUTE_MS / 1000}`];
  if (cookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const parts = [`${cookieName()}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (cookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

export function tokenFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const name = cookieName();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
    }
  }
  return null;
}
