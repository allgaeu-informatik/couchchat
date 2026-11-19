import { getDb } from "../db/connection";
import type { AuditRow } from "../types";

export interface AuditInsert {
  ts: number;
  actorId: number | null;
  actorUsername: string | null;
  action: string;
  targetUsername: string | null;
  ip: string | null;
  details: Record<string, unknown> | null;
}

export const auditRepo = {
  insert(a: AuditInsert): void {
    getDb()
      .prepare(
        "INSERT INTO audit (ts, actor_id, actor_username, action, target_username, ip, details) VALUES (?,?,?,?,?,?,?)",
      )
      .run(a.ts, a.actorId, a.actorUsername, a.action, a.targetUsername, a.ip, a.details ? JSON.stringify(a.details) : null);
  },
  list(opts: { action?: string; limit: number; offset: number }): { rows: AuditRow[]; total: number } {
    const where = opts.action ? "WHERE action = ?" : "";
    const args = opts.action ? [opts.action] : [];
    const total = (getDb().prepare(`SELECT COUNT(*) AS c FROM audit ${where}`).get(...args) as { c: number }).c;
    const rows = getDb()
      .prepare(`SELECT * FROM audit ${where} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...args, opts.limit, opts.offset) as unknown as AuditRow[];
    return { rows, total };
  },
  purgeOlderThan(ts: number): number {
    return Number(getDb().prepare("DELETE FROM audit WHERE ts < ?").run(ts).changes);
  },
};
