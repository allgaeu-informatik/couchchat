import { getDb } from "../db/connection";

export interface SessionRow {
  id: string;
  user_id: number;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
}

export const sessionsRepo = {
  insert(s: { id: string; userId: number; now: number; expiresAt: number; ip: string; userAgent: string }): void {
    getDb()
      .prepare(
        "INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)",
      )
      .run(s.id, s.userId, s.now, s.expiresAt, s.now, s.ip, s.userAgent.slice(0, 256));
  },
  find(id: string): SessionRow | undefined {
    return getDb().prepare("SELECT id, user_id, created_at, expires_at, last_seen_at FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
  },
  touch(id: string, now: number): void {
    getDb().prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, id);
  },
  delete(id: string): void {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },
  deleteForUser(userId: number, exceptId?: string): void {
    if (exceptId) getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, exceptId);
    else getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  },
  purgeExpired(now: number, idleMs: number): number {
    const r = getDb().prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?").run(now, now - idleMs);
    return Number(r.changes);
  },
};
