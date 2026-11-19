import { LOCK_DURATION_MS, LOCK_THRESHOLD, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from "../config";
import { AppError, tooMany } from "../errors";
import { sessionsRepo } from "../repositories/sessions";
import { usersRepo } from "../repositories/users";
import { dummyHash, hashPassword, isLegacyHash, verifyPassword } from "../security/password";
import { limiters } from "../security/rateLimit";
import { hashSessionToken, newSessionToken } from "../security/session";
import type { RequestMeta, SessionUser } from "../types";
import { transaction } from "../db/connection";
import { recordAudit } from "./audit";
import { syncHostUsers } from "./hostSync";

const GENERIC = "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.";
const invalid = () => new AppError(401, "invalid_credentials", GENERIC);

export interface ResolvedSession {
  sessionId: string;
  user: SessionUser;
}

/** Verifies credentials and creates a session. All failure modes return the same generic error. */
export async function login(
  usernameRaw: string,
  password: string,
  meta: RequestMeta,
): Promise<{ token: string; user: SessionUser }> {
  const username = usernameRaw.trim().toLowerCase();
  if (!limiters.loginIp.consume(`ip:${meta.ip}`) || !limiters.loginUser.consume(`u:${username}`)) throw tooMany();

  const user = usersRepo.findByUsername(username);
  const now = Date.now();
  const locked = !!user && user.locked_until !== null && user.locked_until > now;
  // Always run one scrypt verification (dummy for unknown/locked accounts) so timing does not reveal state.
  const ok = await verifyPassword(password, user && !locked ? user.password_hash : await dummyHash());

  if (!user) {
    recordAudit({ action: "login.failed", targetUsername: username.slice(0, 64), meta, details: { reason: "unknown" } });
    throw invalid();
  }
  if (locked) {
    recordAudit({ action: "login.locked", targetUsername: username, meta, details: { reason: "attempt_while_locked" } });
    throw invalid();
  }
  if (!ok || user.active !== 1) {
    const failed = user.failed_logins + 1;
    if (failed >= LOCK_THRESHOLD) {
      usersRepo.setFailures(user.id, 0, now + LOCK_DURATION_MS);
      recordAudit({ action: "login.locked", targetUsername: username, meta, details: { reason: "too_many_failures" } });
    } else {
      usersRepo.setFailures(user.id, failed, null);
    }
    recordAudit({
      action: "login.failed",
      targetUsername: username,
      meta,
      details: { reason: ok ? "inactive" : "bad_password" },
    });
    throw invalid();
  }

  if (user.failed_logins !== 0 || user.locked_until !== null) usersRepo.setFailures(user.id, 0, null);
  limiters.loginUser.reset(`u:${username}`);
  const token = newSessionToken();
  sessionsRepo.insert({
    id: hashSessionToken(token),
    userId: user.id,
    now,
    expiresAt: now + SESSION_ABSOLUTE_MS,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const su: SessionUser = { id: user.id, username: user.username, displayname: user.displayname, role: user.role };
  recordAudit({ action: "login.success", actor: su, targetUsername: user.username, meta });
  if (isLegacyHash(user.password_hash)) await rehashLegacy(su, user.id, user.password_hash, password, meta);
  return { token, user: su };
}

/**
 * Lazy migration of an imported Jitsi/Prosody SCRAM hash to scrypt after a successful login. The password policy is
 * deliberately not applied here. A failure must never break the login (the legacy hash keeps working).
 */
async function rehashLegacy(su: SessionUser, userId: number, oldHash: string, password: string, meta: RequestMeta): Promise<void> {
  try {
    const hash = await hashPassword(password);
    const changed = transaction(() => usersRepo.rehash(userId, oldHash, hash, Date.now()));
    if (!changed) return; // hash was changed concurrently (e.g. password reset): leave it alone
    recordAudit({ action: "password.rehash", actor: su, targetUsername: su.username, meta, details: { from: "scram-sha1", to: "scrypt" } });
    syncHostUsers(meta);
  } catch (e) {
    console.error("password rehash failed:", e instanceof Error ? e.message : "unknown error");
  }
}

export function resolveSession(token: string | null, now = Date.now()): ResolvedSession | null {
  if (!token) return null;
  const id = hashSessionToken(token);
  const s = sessionsRepo.find(id);
  if (!s) return null;
  if (s.expires_at <= now || now - s.last_seen_at >= SESSION_IDLE_MS) {
    sessionsRepo.delete(id);
    return null;
  }
  const u = usersRepo.findById(s.user_id);
  if (!u || u.active !== 1) {
    sessionsRepo.delete(id);
    return null;
  }
  if (now - s.last_seen_at > 60_000) sessionsRepo.touch(id, now);
  return { sessionId: id, user: { id: u.id, username: u.username, displayname: u.displayname, role: u.role } };
}

export function logout(session: ResolvedSession, meta: RequestMeta): void {
  sessionsRepo.delete(session.sessionId);
  recordAudit({ action: "logout", actor: session.user, targetUsername: session.user.username, meta });
}

export function purgeSessions(now = Date.now()): number {
  return sessionsRepo.purgeExpired(now, SESSION_IDLE_MS);
}
