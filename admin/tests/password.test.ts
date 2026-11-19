import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, isLegacyHash, parseScramHash, passwordPolicyError, verifyPassword } from "@/server/security/password";

describe("password policy", () => {
  it("accepts a compliant password", () => expect(passwordPolicyError("Couch!Chat9")).toBeNull());
  it.each([
    ["Ab1!", "zu kurz"],
    ["couch!chat9", "keine Großbuchstaben"],
    ["COUCH!CHAT9", "keine Kleinbuchstaben"],
    ["Couch!Chatx", "keine Ziffer"],
    ["CouchChat99", "kein Sonderzeichen"],
    ["Aa1!" + "x".repeat(125), "zu lang (129)"],
  ])("rejects %s (%s)", (pw) => expect(passwordPolicyError(pw)).not.toBeNull());
  it("accepts exactly 128 chars", () => expect(passwordPolicyError("Aa1!" + "x".repeat(124))).toBeNull());
});

describe("scrypt hash contract", () => {
  const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");

  it("TEST VECTOR: produces the documented format and verifies", async () => {
    const h = await hashPassword("Couch!Chat9", salt);
    const parts = h.split("$");
    expect(parts.slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
    expect(parts[4]).toBe(salt.toString("base64"));
    expect(Buffer.from(parts[5] as string, "base64")).toHaveLength(64);
    expect(await verifyPassword("Couch!Chat9", h)).toBe(true);
    expect(await verifyPassword("couch!Chat9", h)).toBe(false);
    // Printed once so the MiroTalk side can cross-check (derived by running code, not hand-written).
    console.log("TEST_VECTOR", h);
  });

  it("NFC: composed and decomposed input are the same password (non-ASCII vector shared with the MiroTalk side)", async () => {
    const salt2 = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const composed = "Café!Pass1";
    const decomposed = "Café!Pass1";
    const h = await hashPassword(composed, salt2);
    expect(await verifyPassword(decomposed, h)).toBe(true);
    expect(await verifyPassword("Cafe!Pass1", h)).toBe(false);
    console.log("TEST_VECTOR_NFC", h);
  });

  it("uses a random salt by default", async () => {
    expect(await hashPassword("Couch!Chat9")).not.toBe(await hashPassword("Couch!Chat9"));
  });

  it("rejects malformed or hostile hashes", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1073741824$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAA==")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$16384$8$1$AAAA$AAAA")).toBe(false);
  });
});

describe("scram-sha1 legacy hash (Jitsi/Prosody)", () => {
  // Independent, straightforward RFC 5802 implementation (salt = the salt string as stored by Prosody).
  function makeScram(password: string, saltString = "2a3b8c1e-5d6f-4a7b-9c0d-1e2f3a4b5c6d", iterations = 4096): string {
    const salted = pbkdf2Sync(password, Buffer.from(saltString, "utf8"), iterations, 20, "sha1");
    const clientKey = createHmac("sha1", salted).update("Client Key").digest();
    const storedKey = createHash("sha1").update(clientKey).digest("hex");
    return `scram-sha1$${iterations}$${Buffer.from(saltString, "utf8").toString("base64")}$${storedKey}`;
  }

  it("accepts the correct and rejects a wrong password", async () => {
    const h = makeScram("Couch!Chat9");
    expect(isLegacyHash(h)).toBe(true);
    expect(await verifyPassword("Couch!Chat9", h)).toBe(true);
    expect(await verifyPassword("couch!Chat9", h)).toBe(false);
    expect(await verifyPassword("Couch!Chat9", h.replace(/[0-9a-f]{40}$/, (m) => m.toUpperCase()))).toBe(true);
  });

  it("does not apply the password policy (weak imported passwords still verify)", async () => {
    expect(await verifyPassword("abc", makeScram("abc"))).toBe(true);
  });

  it("rejects malformed or hostile strings", async () => {
    const [, it, salt, key] = makeScram("x").split("$") as [string, string, string, string];
    for (const h of [
      "scram-sha1",
      `scram-sha1$0$${salt}$${key}`,
      `scram-sha1$100001$${salt}$${key}`,
      `scram-sha1$abc$${salt}$${key}`,
      `scram-sha1$${it}$!!!$${key}`,
      `scram-sha1$${it}$${salt}$${key.slice(2)}`,
      `scram-sha1$${it}$${salt}$${key}$extra`,
    ]) {
      expect(parseScramHash(h)).toBeNull();
      expect(await verifyPassword("x", h)).toBe(false);
    }
  });
});
