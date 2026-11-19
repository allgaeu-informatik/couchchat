import { getDb } from "../db/connection";
import type { Role, UserRow } from "../types";

export interface NewUser {
  username: string;
  displayname: string;
  passwordHash: string;
  role: Role;
  allowedRooms: string[];
  active: boolean;
}

export const usersRepo = {
  count(): number {
    return (getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  },
  countActiveAdmins(): number {
    return (
      getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get() as { c: number }
    ).c;
  },
  findById(id: number): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  },
  findByUsername(username: string): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  },
  list(): UserRow[] {
    return getDb().prepare("SELECT * FROM users ORDER BY username").all() as unknown as UserRow[];
  },
  listActive(): UserRow[] {
    return getDb().prepare("SELECT * FROM users WHERE active = 1 ORDER BY username").all() as unknown as UserRow[];
  },
  insert(u: NewUser, now: number): number {
    const r = getDb()
      .prepare(
        `INSERT INTO users (username, displayname, password_hash, role, allowed_rooms, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(u.username, u.displayname, u.passwordHash, u.role, JSON.stringify(u.allowedRooms), u.active ? 1 : 0, now, now);
    return Number(r.lastInsertRowid);
  },
  updateProfile(
    id: number,
    f: { username: string; displayname: string; role: Role; allowedRooms: string[]; active: boolean },
    now: number,
  ): void {
    getDb()
      .prepare(
        `UPDATE users SET username = ?, displayname = ?, role = ?, allowed_rooms = ?, active = ?, updated_at = ? WHERE id = ?`,
      )
      .run(f.username, f.displayname, f.role, JSON.stringify(f.allowedRooms), f.active ? 1 : 0, now, id);
  },
  setPassword(id: number, hash: string, now: number): void {
    getDb()
      .prepare("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?")
      .run(hash, now, id);
  },
  /** Replaces the hash only if it still equals `oldHash` (compare-and-set); returns whether a row changed. */
  rehash(id: number, oldHash: string, newHash: string, now: number): boolean {
    const r = getDb()
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash = ?")
      .run(newHash, now, id, oldHash);
    return Number(r.changes) > 0;
  },
  setFailures(id: number, failed: number, lockedUntil: number | null): void {
    getDb().prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?").run(failed, lockedUntil, id);
  },
  delete(id: number): void {
    getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  },
};
