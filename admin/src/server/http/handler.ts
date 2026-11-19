import { ZodError, type ZodType } from "zod";
import { AppError, badRequest, forbidden, unauthorized } from "../errors";
import { assertCsrf } from "../security/csrf";
import { tokenFromCookieHeader } from "../security/session";
import { resolveSession, type ResolvedSession } from "../services/auth";
import { trustProxy } from "../config";
import type { RequestMeta } from "../types";

export interface Ctx {
  req: Request;
  meta: RequestMeta;
  session: ResolvedSession | null;
  params: Record<string, string>;
}
export interface AuthedCtx extends Ctx {
  session: ResolvedSession;
}

const BASE_HEADERS = { "Cache-Control": "no-store" } as const;

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...BASE_HEADERS, ...extraHeaders },
  });
}

export function requestMeta(req: Request): RequestMeta {
  let ip = "direct";
  if (trustProxy()) {
    // Caddy appends the client address; the last entry is the one our own proxy saw.
    const xff = req.headers.get("x-forwarded-for");
    const last = xff?.split(",").pop()?.trim();
    if (last && /^[0-9a-fA-F:.]{3,45}$/.test(last)) ip = last;
  }
  return { ip, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 256) };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    return json({ error: { code: e.code, message: e.message, fields: e.fields } }, e.status);
  }
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    const first = e.issues[0]?.message ?? "Ungültige Eingabe.";
    return json({ error: { code: "validation", message: first, fields } }, 400);
  }
  console.error("unhandled error:", e instanceof Error ? e.message : "unknown error");
  return json({ error: { code: "internal", message: "Interner Fehler." } }, 500);
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > 16_384) throw new AppError(413, "too_large", "Anfrage zu groß.");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Ungültiges JSON.");
  }
  return schema.parse(data);
}

type Access = "public" | "session" | "admin";
type Handler = (ctx: Ctx) => Promise<Response> | Response;
type RouteCtx = { params?: Promise<Record<string, string>> };

/** Wraps a controller: CSRF check, session/role guard, error mapping. Controllers stay thin. */
export function route(access: Access, fn: Handler) {
  return async (req: Request, rc?: RouteCtx): Promise<Response> => {
    try {
      assertCsrf(req);
      const session = resolveSession(tokenFromCookieHeader(req.headers.get("cookie")));
      if (access !== "public") {
        if (!session) throw unauthorized();
        if (access === "admin" && session.user.role !== "admin") throw forbidden();
      }
      const params = rc?.params ? await rc.params : {};
      return await fn({ req, meta: requestMeta(req), session, params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function paramId(ctx: Ctx): number {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id < 1) throw badRequest("Ungültige ID.");
  return id;
}

export function sess(ctx: Ctx): ResolvedSession {
  if (!ctx.session) throw unauthorized();
  return ctx.session;
}
