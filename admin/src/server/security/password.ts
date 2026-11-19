import { createHash, createHmac, pbkdf2, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Hash format shared with CouchChat (MiroTalk): "scrypt$N$r$p$saltB64$keyB64" (standard base64).
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
const MAX_N = 1 << 16; // refuse absurd cost parameters from a (tampered) stored string

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, keylen, { N: n, r, p, maxmem: 256 * n * r + 4 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string, salt: Buffer = randomBytes(16)): Promise<string> {
  const key = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Legacy format imported from Jitsi/Prosody (SCRAM-SHA-1, RFC 5802): "scram-sha1$<iterations>$<salt b64>$<stored_key hex>".
// The salt is the salt STRING of the Prosody account file (base64 of its UTF-8 bytes). Only used until the user logs in once;
// the panel then rehashes to scrypt (see auth.login). Same format and rules in scripts/patches/data/host-users-loader.js.
export const SCRAM_PREFIX = "scram-sha1$";
const SCRAM_MAX_ITERATIONS = 100_000;

export function isLegacyHash(stored: string): boolean {
  return stored.startsWith(SCRAM_PREFIX);
}

interface ScramParts {
  iterations: number;
  salt: Buffer;
  storedKey: Buffer;
}

export function parseScramHash(stored: string): ScramParts | null {
  if (stored.length > 1024) return null;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scram-sha1") return null;
  const [, itS, saltB64, keyHex] = parts as [string, string, string, string];
  if (!/^[0-9]{1,6}$/.test(itS)) return null;
  const iterations = Number(itS);
  if (iterations < 1 || iterations > SCRAM_MAX_ITERATIONS) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(saltB64) || saltB64.length % 4 !== 0) return null;
  const salt = Buffer.from(saltB64, "base64");
  if (salt.length < 1 || salt.length > 256) return null;
  if (!/^[0-9a-fA-F]{40}$/.test(keyHex)) return null;
  return { iterations, salt, storedKey: Buffer.from(keyHex, "hex") };
}

function pbkdf2Sha1(password: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Approximation of SASLprep: NFKC (identical for ASCII passwords).
    pbkdf2(password.normalize("NFKC"), salt, iterations, 20, "sha1", (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function verifyScram(password: string, stored: string): Promise<boolean> {
  const h = parseScramHash(stored);
  if (!h) return false;
  try {
    const salted = await pbkdf2Sha1(password, h.salt, h.iterations);
    const clientKey = createHmac("sha1", salted).update("Client Key").digest();
    const storedKey = createHash("sha1").update(clientKey).digest();
    const ok = timingSafeEqual(storedKey, h.storedKey);
    // Cost equalisation: a SCRAM check is much cheaper than scrypt, which would reveal which accounts are still legacy.
    await verifyScrypt(password, await dummyHash());
    return ok;
  } catch {
    return false;
  }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  return isLegacyHash(stored) ? verifyScram(password, stored) : verifyScrypt(password, stored);
}

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || n < 2 || n > MAX_N || (n & (n - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 8) return false;
  const salt = Buffer.from(parts[4] as string, "base64");
  const expected = Buffer.from(parts[5] as string, "base64");
  if (salt.length < 8 || expected.length < 16 || expected.length > 128) return false;
  try {
    const actual = await derive(password, salt, n, r, p, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Valid hash of a random password, used to equalise timing for unknown users. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(18).toString("base64"));
  return dummy;
}

/** Returns a German error message, or null if the password satisfies the policy. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 8 || pw.length > 128) return "Das Passwort muss 8 bis 128 Zeichen lang sein.";
  if (!/\p{Ll}/u.test(pw)) return "Das Passwort braucht mindestens einen Kleinbuchstaben.";
  if (!/\p{Lu}/u.test(pw)) return "Das Passwort braucht mindestens einen Großbuchstaben.";
  if (!/[0-9]/.test(pw)) return "Das Passwort braucht mindestens eine Ziffer.";
  if (!/[^\p{L}\p{N}]/u.test(pw)) return "Das Passwort braucht mindestens ein Sonderzeichen.";
  return null;
}
