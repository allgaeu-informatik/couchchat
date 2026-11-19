import { AppError, badRequest, conflict, notFound, tooMany } from "../errors";
import { transaction } from "../db/connection";
import { limiters } from "../security/rateLimit";
import { hashPassword, isLegacyHash, passwordPolicyError, verifyPassword } from "../security/password";
import { sessionsRepo } from "../repositories/sessions";
import { usersRepo } from "../repositories/users";
import type { PublicUser, RequestMeta, Role, SessionUser, UserRow } from "../types";
import { recordAudit } from "./audit";
import { syncHostUsers } from "./hostSync";
import { assertAdmin, assertMayDelete, assertMayUpdate, type UpdatePatch } from "./permissions";

function parseRooms(json: string): string[] {
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  } catch {
    /* empty */
  }
  return [];
}

export function toPublicUser(u: UserRow, now = Date.now()): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayname: u.displayname,
    role: u.role,
    allowedRooms: parseRooms(u.allowed_rooms),
    active: u.active === 1,
    locked: u.locked_until !== null && u.locked_until > now,
    legacyPassword: isLegacyHash(u.password_hash),
    createdAt: new Date(u.created_at).toISOString(),
    updatedAt: new Date(u.updated_at).toISOString(),
  };
}

const actorRef = (a: SessionUser) => ({ id: a.id, username: a.username });

function requirePolicy(pw: string, field: string): void {
  const err = passwordPolicyError(pw);
  if (err) throw badRequest(err, { [field]: err });
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

const TAKEN = "Dieser Benutzername ist bereits vergeben.";

export function listUsers(actor: SessionUser): PublicUser[] {
  assertAdmin(actor);
  return usersRepo.list().map((u) => toPublicUser(u));
}

export function getOwnProfile(actor: SessionUser): PublicUser {
  const u = usersRepo.findById(actor.id);
  if (!u) throw notFound();
  return toPublicUser(u);
}

export async function createUser(
  actor: SessionUser,
  input: { username: string; displayname: string; password: string; role: Role; allowedRooms: string[]; active: boolean },
  meta: RequestMeta,
): Promise<PublicUser> {
  assertAdmin(actor);
  requirePolicy(input.password, "password");
  const passwordHash = await hashPassword(input.password);
  let id: number;
  try {
    id = transaction(() =>
      usersRepo.insert(
        {
          username: input.username,
          displayname: input.displayname,
          passwordHash,
          role: input.role,
          allowedRooms: input.allowedRooms,
          active: input.active,
        },
        Date.now(),
      ),
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(TAKEN, { username: "Bereits vergeben." });
    throw e;
  }
  recordAudit({
    action: "user.create",
    actor: actorRef(actor),
    targetUsername: input.username,
    meta,
    details: { role: input.role, active: input.active },
  });
  syncHostUsers(meta);
  return toPublicUser(usersRepo.findById(id) as UserRow);
}

/** Shared by PATCH /api/users/:id (admin) and PATCH /api/me (self). Permission rules are enforced here. */
export function updateUser(actor: SessionUser, targetId: number, patch: UpdatePatch, meta: RequestMeta): PublicUser {
  let changed: string[] = [];
  let sessionsKilled = false;
  let after!: UserRow;
  let before!: UserRow;
  try {
    transaction(() => {
      const target = usersRepo.findById(targetId);
      if (!target) {
        // Non-admins get 403 for others (not 404), so existence is not leaked through the status code.
        assertAdmin(actor);
        throw notFound("Benutzer nicht gefunden.");
      }
      before = target;
      assertMayUpdate(actor, target, patch, usersRepo.countActiveAdmins());
      const oldRooms = parseRooms(target.allowed_rooms);
      const next = {
        username: patch.username ?? target.username,
        displayname: patch.displayname ?? target.displayname,
        role: patch.role ?? target.role,
        allowedRooms: patch.allowedRooms ?? oldRooms,
        active: patch.active ?? target.active === 1,
      };
      changed = [];
      if (next.username !== target.username) changed.push("username");
      if (next.displayname !== target.displayname) changed.push("displayname");
      if (next.role !== target.role) changed.push("role");
      if (JSON.stringify(next.allowedRooms) !== JSON.stringify(oldRooms)) changed.push("allowedRooms");
      if (next.active !== (target.active === 1)) changed.push("active");
      if (changed.length === 0) {
        after = target;
        return;
      }
      usersRepo.updateProfile(targetId, next, Date.now());
      if (changed.includes("role") || changed.includes("active")) {
        sessionsRepo.deleteForUser(targetId);
        sessionsKilled = true;
      }
      after = usersRepo.findById(targetId) as UserRow;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(TAKEN, { username: "Bereits vergeben." });
    throw e;
  }
  if (changed.length > 0) {
    recordAudit({
      action: "user.update",
      actor: actorRef(actor),
      targetUsername: before.username,
      meta,
      details: { changed, ...(changed.includes("username") ? { newUsername: after.username } : {}), sessionsEnded: sessionsKilled },
    });
    syncHostUsers(meta);
  }
  return toPublicUser(after);
}

export function deleteUser(actor: SessionUser, targetId: number, meta: RequestMeta): void {
  let username = "";
  transaction(() => {
    const target = usersRepo.findById(targetId);
    if (!target) {
      assertAdmin(actor);
      throw notFound("Benutzer nicht gefunden.");
    }
    assertMayDelete(actor, target, usersRepo.countActiveAdmins());
    username = target.username;
    sessionsRepo.deleteForUser(targetId);
    usersRepo.delete(targetId);
  });
  recordAudit({ action: "user.delete", actor: actorRef(actor), targetUsername: username, meta });
  syncHostUsers(meta);
}

/** Admin sets a new password for another user. Ends all of that user's sessions and clears the lock. */
export async function resetPassword(actor: SessionUser, targetId: number, newPassword: string, meta: RequestMeta): Promise<void> {
  assertAdmin(actor);
  const target = usersRepo.findById(targetId);
  if (!target) throw notFound("Benutzer nicht gefunden.");
  if (target.id === actor.id) throw badRequest("Das eigene Passwort bitte über „Passwort ändern“ setzen.");
  requirePolicy(newPassword, "newPassword");
  const hash = await hashPassword(newPassword);
  transaction(() => {
    usersRepo.setPassword(targetId, hash, Date.now());
    sessionsRepo.deleteForUser(targetId);
  });
  recordAudit({ action: "password.reset", actor: actorRef(actor), targetUsername: target.username, meta });
  syncHostUsers(meta);
}

/** Own password change: requires the current password; ends all other sessions of this user. */
export async function changeOwnPassword(
  actor: SessionUser,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  if (!limiters.passwordChange.consume(`u:${actor.id}`)) throw tooMany();
  const user = usersRepo.findById(actor.id);
  if (!user) throw notFound();
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new AppError(400, "bad_current_password", "Das aktuelle Passwort ist nicht korrekt.", {
      currentPassword: "Nicht korrekt.",
    });
  }
  requirePolicy(newPassword, "newPassword");
  if (newPassword === currentPassword) {
    throw badRequest("Das neue Passwort muss sich vom aktuellen unterscheiden.", { newPassword: "Muss sich unterscheiden." });
  }
  const hash = await hashPassword(newPassword);
  transaction(() => {
    usersRepo.setPassword(user.id, hash, Date.now());
    sessionsRepo.deleteForUser(user.id, currentSessionId);
  });
  limiters.passwordChange.reset(`u:${actor.id}`);
  recordAudit({ action: "password.change", actor: actorRef(actor), targetUsername: user.username, meta });
  syncHostUsers(meta);
}
