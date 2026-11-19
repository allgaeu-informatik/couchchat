import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { usersRepo } from "@/server/repositories/users";
import { sessionsRepo } from "@/server/repositories/sessions";
import { assertMayDelete, assertMayUpdate } from "@/server/services/permissions";
import { changeOwnPassword, createUser, deleteUser, resetPassword, updateUser } from "@/server/services/users";
import { hashPassword } from "@/server/security/password";
import { hashSessionToken } from "@/server/security/session";
import { login, resolveSession } from "@/server/services/auth";
import type { SessionUser, UserRow } from "@/server/types";
import { freshEnv, meta } from "./helpers";

const row = (o: Partial<UserRow>): UserRow => ({
  id: 1,
  username: "a",
  displayname: "A",
  password_hash: "x",
  role: "user",
  allowed_rooms: '["*"]',
  active: 1,
  failed_logins: 0,
  locked_until: null,
  created_at: 0,
  updated_at: 0,
  ...o,
});
const su = (o: Partial<SessionUser>): SessionUser => ({ id: 1, username: "a", displayname: "A", role: "user", ...o });

describe("pure permission rules", () => {
  it("user may edit only self, only username/displayname", () => {
    const actor = su({ id: 5 });
    expect(() => assertMayUpdate(actor, row({ id: 5 }), { displayname: "X" }, 1)).not.toThrow();
    expect(() => assertMayUpdate(actor, row({ id: 6 }), { displayname: "X" }, 1)).toThrow(/Keine Berechtigung/);
    expect(() => assertMayUpdate(actor, row({ id: 5 }), { role: "admin" }, 1)).toThrow(AppError);
    expect(() => assertMayUpdate(actor, row({ id: 5 }), { allowedRooms: ["x"] }, 1)).toThrow(AppError);
    expect(() => assertMayUpdate(actor, row({ id: 5 }), { active: false }, 1)).toThrow(AppError);
  });
  it("user cannot delete", () => {
    expect(() => assertMayDelete(su({ id: 5 }), row({ id: 6 }), 2)).toThrow(AppError);
  });
  it("last active admin is protected", () => {
    const admin = su({ id: 1, role: "admin" });
    const target = row({ id: 1, role: "admin" });
    expect(() => assertMayUpdate(admin, target, { role: "user" }, 1)).toThrow(/letzte aktive Administrator/);
    expect(() => assertMayUpdate(admin, target, { active: false }, 1)).toThrow(/letzte aktive Administrator/);
    expect(() => assertMayUpdate(admin, target, { role: "user" }, 2)).not.toThrow();
    expect(() => assertMayDelete(su({ id: 2, role: "admin" }), target, 1)).toThrow(/letzte aktive Administrator/);
  });
  it("admin cannot delete self", () => {
    expect(() => assertMayDelete(su({ id: 1, role: "admin" }), row({ id: 1, role: "admin" }), 3)).toThrow(/nicht selbst/);
  });
});

describe("user service with database", () => {
  let env: ReturnType<typeof freshEnv>;
  let admin: SessionUser;
  beforeEach(async () => {
    env = freshEnv();
    const id = usersRepo.insert(
      { username: "root", displayname: "Root", passwordHash: await hashPassword("Root!Pass1x"), role: "admin", allowedRooms: ["*"], active: true },
      Date.now(),
    );
    admin = { id, username: "root", displayname: "Root", role: "admin" };
  });
  afterEach(() => env.cleanup());

  const mk = (username: string) =>
    createUser(admin, { username, displayname: username, password: "Valid!Pass1", role: "user", allowedRooms: ["*"], active: true }, meta);

  it("rejects duplicates and weak passwords", async () => {
    await mk("alice");
    await expect(mk("alice")).rejects.toThrow(/bereits vergeben/);
    await expect(
      createUser(admin, { username: "bobby", displayname: "B", password: "weak", role: "user", allowedRooms: ["*"], active: true }, meta),
    ).rejects.toThrow();
  });

  it("non-admin cannot create or change others or elevate", async () => {
    const alice = await mk("alice");
    const bob = await mk("bobby");
    const aliceSu: SessionUser = { id: alice.id, username: "alice", displayname: "alice", role: "user" };
    await expect(
      createUser(aliceSu, { username: "evil", displayname: "E", password: "Valid!Pass1", role: "admin", allowedRooms: ["*"], active: true }, meta),
    ).rejects.toThrow(/Keine Berechtigung/);
    expect(() => updateUser(aliceSu, bob.id, { displayname: "Hacked" }, meta)).toThrow(/Keine Berechtigung/);
    expect(() => updateUser(aliceSu, alice.id, { role: "admin" }, meta)).toThrow(AppError);
    expect(updateUser(aliceSu, alice.id, { displayname: "Alice A", username: "alice2" }, meta).username).toBe("alice2");
    expect(() => deleteUser(aliceSu, bob.id, meta)).toThrow(AppError);
  });

  it("last-admin protections hold in the service", () => {
    expect(() => updateUser(admin, admin.id, { role: "user" }, meta)).toThrow(/letzte aktive Administrator/);
    expect(() => updateUser(admin, admin.id, { active: false }, meta)).toThrow(/letzte aktive Administrator/);
    expect(() => deleteUser(admin, admin.id, meta)).toThrow(AppError);
  });

  it("role change and password reset kill sessions; own change keeps the current one", async () => {
    const alice = await mk("alice");
    const first = await login("alice", "Valid!Pass1", meta);
    expect(resolveSession(first.token)).not.toBeNull();
    updateUser(admin, alice.id, { role: "admin" }, meta);
    expect(resolveSession(first.token)).toBeNull();

    const l1 = await login("alice", "Valid!Pass1", meta);
    const l2 = await login("alice", "Valid!Pass1", meta);
    const s1 = resolveSession(l1.token);
    if (!s1) throw new Error("session missing");
    await changeOwnPassword(s1.user, s1.sessionId, "Valid!Pass1", "Other!Pass22", meta);
    expect(resolveSession(l1.token)).not.toBeNull();
    expect(resolveSession(l2.token)).toBeNull();
    await expect(changeOwnPassword(s1.user, s1.sessionId, "wrong", "Third!Pass33", meta)).rejects.toThrow(/nicht korrekt/);

    await resetPassword(admin, alice.id, "Reset!Pass44", meta);
    expect(resolveSession(l1.token)).toBeNull();
    await expect(login("alice", "Other!Pass22", meta)).rejects.toThrow();
    await expect(login("alice", "Reset!Pass44", meta)).resolves.toBeTruthy();
    expect(sessionsRepo.find(hashSessionToken(l1.token))).toBeUndefined();
  });

  it("locks the account after 10 failures with a generic error", async () => {
    await mk("alice");
    for (let i = 0; i < 10; i++) {
      await expect(login("alice", "nope", { ...meta, ip: `10.0.0.${i}` })).rejects.toThrow(/Anmeldung fehlgeschlagen/);
    }
    await expect(login("alice", "Valid!Pass1", { ...meta, ip: "10.9.9.9" })).rejects.toThrow(/Anmeldung fehlgeschlagen/);
    await expect(login("ghost", "nope", { ...meta, ip: "10.9.9.8" })).rejects.toThrow(/Anmeldung fehlgeschlagen/);
  }, 30000);
});
