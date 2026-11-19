import { appOrigin } from "../config";
import { forbidden } from "../errors";

/** All state-changing requests need Origin == APP_ORIGIN and a JSON content type (on top of SameSite=Strict). */
export function assertCsrf(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  if (req.headers.get("origin") !== appOrigin()) throw forbidden("Ungültige Herkunft der Anfrage.");
  const ct = req.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(ct)) throw forbidden("Ungültiger Inhaltstyp.");
}
