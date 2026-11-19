import { conflict, forbidden } from "../errors";
import type { Role, SessionUser, UserRow } from "../types";

export interface UpdatePatch {
  username?: string;
  displayname?: string;
  role?: Role;
  allowedRooms?: string[];
  active?: boolean;
}

const SELF_FIELDS = new Set(["username", "displayname"]);
const LAST_ADMIN = "Der letzte aktive Administrator kann nicht gelöscht, herabgestuft oder deaktiviert werden.";

/** Pure permission rules (the server never trusts the client). */
export function assertMayUpdate(actor: SessionUser, target: UserRow, patch: UpdatePatch, activeAdmins: number): void {
  if (actor.role !== "admin") {
    if (target.id !== actor.id) throw forbidden();
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && !SELF_FIELDS.has(k)) throw forbidden("Diese Angabe dürfen nur Administratoren ändern.");
    }
    return;
  }
  const losesAdmin = patch.role === "user" || patch.active === false;
  if (target.role === "admin" && target.active === 1 && losesAdmin && activeAdmins <= 1) throw conflict(LAST_ADMIN);
}

export function assertMayDelete(actor: SessionUser, target: UserRow, activeAdmins: number): void {
  if (actor.role !== "admin") throw forbidden();
  if (actor.id === target.id) throw conflict("Sie können sich nicht selbst löschen.");
  if (target.role === "admin" && target.active === 1 && activeAdmins <= 1) throw conflict(LAST_ADMIN);
}

export function assertAdmin(actor: SessionUser): void {
  if (actor.role !== "admin") throw forbidden();
}
