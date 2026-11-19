import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/connection";
import { usersRepo } from "@/server/repositories/users";
import { limiters } from "@/server/security/rateLimit";
import { isLegacyHash, verifyPassword } from "@/server/security/password";
import { login } from "@/server/services/auth";
import { HOST_USERS_FILE, resetHostSyncState } from "@/server/services/hostSync";
import { toPublicUser } from "@/server/services/users";
import type { UserRow } from "@/server/types";
import { freshEnv, meta } from "./helpers";

function scram(password: string, salt = "5d1c4f2e-8a3b-4c7d-9e0f-aabbccddeeff", iterations = 4096): string {
  const salted = pbkdf2Sync(password, Buffer.from(salt, "utf8"), iterations, 20, "sha1");
  const storedKey = createHash("sha1").update(createHmac("sha1", salted).update("Client Key").digest()).digest("hex");
  return `scram-sha1$${iterations}$${Buffer.from(salt, "utf8").toString("base64")}$${storedKey}`;
}

describe("lazy migration of imported Jitsi passwords", () => {
  let env: ReturnType<typeof freshEnv>;
  beforeEach(() => {
    env = freshEnv();
    limiters.loginIp.reset(`ip:${meta.ip}`);
  });
  afterEach(() => {
    resetHostSyncState();
    env.cleanup();
  });

  it("rehashes to scrypt after a successful login, audits it, syncs the host file and ignores the password policy", async () => {
    const old = scram("weak"); // violates the policy on purpose
    usersRepo.insert({ username: "legacy", displayname: "Legacy", passwordHash: old, role: "user", allowedRooms: ["*"], active: true }, Date.now());
    expect(toPublicUser(usersRepo.findByUsername("legacy") as UserRow).legacyPassword).toBe(true);

    await expect(login("legacy", "wrong", meta)).rejects.toThrow();
    expect((usersRepo.findByUsername("legacy") as UserRow).password_hash).toBe(old);

    const res = await login("legacy", "weak", meta);
    expect(res.user.username).toBe("legacy");
    const after = usersRepo.findByUsername("legacy") as UserRow;
    expect(after.password_hash.startsWith("scrypt$")).toBe(true);
    expect(isLegacyHash(after.password_hash)).toBe(false);
    expect(await verifyPassword("weak", after.password_hash)).toBe(true);
    expect(toPublicUser(after).legacyPassword).toBe(false);
    expect(JSON.stringify(toPublicUser(after))).not.toMatch(/scrypt|scram/);

    const a = getDb().prepare("SELECT * FROM audit WHERE action = 'password.rehash'").all() as unknown as { target_username: string; details: string }[];
    expect(a).toHaveLength(1);
    expect(a[0]?.target_username).toBe("legacy");
    expect(a[0]?.details).not.toMatch(/\$/);

    const doc = JSON.parse(readFileSync(path.join(env.hostDir, HOST_USERS_FILE), "utf8"));
    expect(doc.users[0].password_hash).toBe(after.password_hash);

    // a regular login afterwards does not rehash again
    await login("legacy", "weak", meta);
    expect(getDb().prepare("SELECT COUNT(*) AS c FROM audit WHERE action = 'password.rehash'").get()).toEqual({ c: 1 });
  });

  it("does not overwrite a hash that changed concurrently (compare-and-set)", () => {
    const id = usersRepo.insert({ username: "legacy", displayname: "L", passwordHash: scram("x"), role: "user", allowedRooms: ["*"], active: true }, Date.now());
    expect(usersRepo.rehash(id, "something-else", "scrypt$new", Date.now())).toBe(false);
    expect((usersRepo.findById(id) as UserRow).password_hash.startsWith("scram-sha1$")).toBe(true);
  });
});
