import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hostDataDir } from "../config";
import { usersRepo } from "../repositories/users";
import type { RequestMeta, UserRow } from "../types";
import { recordAudit } from "./audit";

export interface HostUsersDoc {
  version: 1;
  generated_at: string;
  users: { username: string; password_hash: string; displayname: string; allowed_rooms: string[] }[];
}

export const HOST_USERS_FILE = "host-users.json";

function parseRooms(json: string): string[] {
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
  } catch {
    /* fall through */
  }
  return [];
}

/** Only active users are exported. */
export function buildHostUsersDoc(rows: UserRow[], now = new Date()): HostUsersDoc {
  return {
    version: 1,
    generated_at: now.toISOString(),
    users: rows
      .filter((u) => u.active === 1)
      .map((u) => ({
        username: u.username,
        password_hash: u.password_hash,
        displayname: u.displayname,
        allowed_rooms: parseRooms(u.allowed_rooms),
      })),
  };
}

function tryUnlink(p: string): void {
  try {
    unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/** Atomic write: temp file in the same directory, fsync, rename. Mode 0644. */
export function writeHostUsersFile(dir: string, doc: HostUsersDoc): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, HOST_USERS_FILE);
  const tmp = path.join(dir, `.${HOST_USERS_FILE}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fd = openSync(tmp, "w", 0o644);
  try {
    writeSync(fd, JSON.stringify(doc, null, 2) + "\n");
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    tryUnlink(tmp);
    throw e;
  }
  closeSync(fd);
  try {
    chmodSync(tmp, 0o644);
    renameSync(tmp, target);
  } catch (e) {
    tryUnlink(tmp);
    throw e;
  }
  return target;
}

// Sync state: after a failed write the file is stale (CouchChat would keep accepting old credentials), so the failure
// is remembered ("dirty") and retried on a short timer until it succeeds. /api/health reports it, mutating endpoints warn.
const RETRY_MS = 30_000;
// Kept on globalThis: Next.js bundles this module into several server chunks (instrumentation, route handlers, pages),
// all of which must see the same state (health endpoint, statistics system card).
const g = globalThis as unknown as {
  __ccHostSync?: { dirty: boolean; lastSuccessAt: number | null; retryTimer: ReturnType<typeof setInterval> | null };
};
const st = (g.__ccHostSync ??= { dirty: false, lastSuccessAt: null, retryTimer: null });

export const HOST_SYNC_WARNING =
  "Gespeichert, aber die Benutzerliste für CouchChat konnte nicht aktualisiert werden. Es wird automatisch erneut versucht.";

export function hostSyncDirty(): boolean {
  return st.dirty;
}

/** `{ warning }` to merge into the response of a mutating endpoint while the last sync failed. */
export function hostSyncWarning(): { warning?: string } {
  return st.dirty ? { warning: HOST_SYNC_WARNING } : {};
}

function stopRetry(): void {
  if (st.retryTimer) clearInterval(st.retryTimer);
  st.retryTimer = null;
}

function startRetry(): void {
  if (st.retryTimer) return;
  st.retryTimer = setInterval(() => retryHostSyncIfDirty(), RETRY_MS);
  st.retryTimer.unref();
}

/** Retries a failed sync (timer and hourly maintenance). No-op when clean. */
export function retryHostSyncIfDirty(): boolean {
  if (!st.dirty) return true;
  return syncHostUsers();
}

/** Writes host-users.json from the DB. Failures are logged and audited (first failure only), remembered and retried. Never throws. */
export function syncHostUsers(meta?: Partial<RequestMeta>): boolean {
  try {
    writeHostUsersFile(hostDataDir(), buildHostUsersDoc(usersRepo.list()));
    if (st.dirty) console.log("host sync recovered");
    st.dirty = false;
    st.lastSuccessAt = Date.now();
    stopRetry();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("host sync failed:", msg);
    if (!st.dirty) recordAudit({ action: "hostsync.error", meta, details: { error: msg.slice(0, 200) } });
    st.dirty = true;
    startRetry();
    return false;
  }
}

/** Test helper. */
export function resetHostSyncState(): void {
  st.dirty = false;
  st.lastSuccessAt = null;
  stopRetry();
}

/** Status for the statistics system card (time of the last successful write, ms since epoch). */
export function hostSyncStatus(): { ok: boolean; lastSuccessAt: number | null } {
  return { ok: !st.dirty, lastSuccessAt: st.lastSuccessAt };
}
