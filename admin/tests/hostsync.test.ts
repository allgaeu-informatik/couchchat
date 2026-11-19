import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditRepo } from "@/server/repositories/audit";
import { usersRepo } from "@/server/repositories/users";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { createUser, deleteUser, updateUser } from "@/server/services/users";
import { buildHostUsersDoc, HOST_USERS_FILE, hostSyncDirty, hostSyncWarning, resetHostSyncState, retryHostSyncIfDirty, syncHostUsers } from "@/server/services/hostSync";
import type { SessionUser } from "@/server/types";
import { freshEnv, meta } from "./helpers";

type U = { username: string };

describe("host-users.json export", () => {
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
  afterEach(() => {
    resetHostSyncState();
    env.cleanup();
  });

  it("writes the contract format, only active users, atomically, mode 0644", async () => {
    const a = await createUser(
      admin,
      { username: "alice", displayname: "Alice", password: "Valid!Pass1", role: "user", allowedRooms: ["room-1", "room-2"], active: true },
      meta,
    );
    const b = await createUser(
      admin,
      { username: "bobby", displayname: "Bobby", password: "Valid!Pass1", role: "user", allowedRooms: ["*"], active: true },
      meta,
    );
    updateUser(admin, b.id, { active: false }, meta);

    const file = path.join(env.hostDir, HOST_USERS_FILE);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    expect(doc.version).toBe(1);
    expect(new Date(doc.generated_at).toISOString()).toBe(doc.generated_at);
    expect(doc.users.map((u: U) => u.username).sort()).toEqual(["alice", "root"]);
    const alice = doc.users.find((u: U) => u.username === "alice");
    expect(Object.keys(alice).sort()).toEqual(["allowed_rooms", "displayname", "password_hash", "username"]);
    expect(alice.allowed_rooms).toEqual(["room-1", "room-2"]);
    expect(alice.password_hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(await verifyPassword("Valid!Pass1", alice.password_hash)).toBe(true);
    expect(readdirSync(env.hostDir)).toEqual([HOST_USERS_FILE]); // no temp leftovers
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o644);

    deleteUser(admin, a.id, meta);
    expect(JSON.parse(readFileSync(file, "utf8")).users.map((u: U) => u.username)).toEqual(["root"]);
  });

  it("buildHostUsersDoc skips inactive users", () => {
    const rows = usersRepo.list().map((u) => ({ ...u, active: 0 }));
    expect(buildHostUsersDoc(rows).users).toEqual([]);
  });

  it("sync failure does not throw and is audited", () => {
    process.env.HOSTDATA_DIR = path.join(env.root, "data", "admin.sqlite", "nope"); // parent is a file, mkdir fails
    expect(syncHostUsers(meta)).toBe(false);
    expect(auditRepo.list({ action: "hostsync.error", limit: 5, offset: 0 }).total).toBe(1);
  });

  it("failed sync stays dirty (warning, one audit row) and recovers on retry", () => {
    const good = process.env.HOSTDATA_DIR as string;
    process.env.HOSTDATA_DIR = path.join(env.root, "data", "admin.sqlite", "nope");
    expect(syncHostUsers(meta)).toBe(false);
    expect(syncHostUsers(meta)).toBe(false);
    expect(hostSyncDirty()).toBe(true);
    expect(hostSyncWarning().warning).toBeTruthy();
    expect(auditRepo.list({ action: "hostsync.error", limit: 5, offset: 0 }).total).toBe(1);
    process.env.HOSTDATA_DIR = good;
    expect(retryHostSyncIfDirty()).toBe(true);
    expect(hostSyncDirty()).toBe(false);
    expect(hostSyncWarning()).toEqual({});
    expect(readFileSync(path.join(good, HOST_USERS_FILE), "utf8")).toContain('"root"');
  });
});
