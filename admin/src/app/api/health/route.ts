import { getDb } from "@/server/db/connection";
import { json } from "@/server/http/handler";
import { hostSyncDirty } from "@/server/services/hostSync";

export const dynamic = "force-dynamic";

/** 503 = database broken; 200 "degraded" = panel works but host-users.json could not be written (retried every 30 s). */
export function GET(): Response {
  try {
    getDb().prepare("SELECT 1").get();
    return json(hostSyncDirty() ? { status: "degraded", hostSync: "failed" } : { status: "ok" });
  } catch {
    return json({ status: "error" }, 503);
  }
}
