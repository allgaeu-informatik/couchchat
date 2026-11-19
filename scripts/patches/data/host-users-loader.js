'use strict';

/**
 * Host users from a JSON file (HOST_USERS_FILE), written by the CouchChat admin panel.
 *
 *   {"version":1,"generated_at":"...","users":[{"username":"alice","password_hash":"scrypt$16384$8$1$<salt b64>$<key b64>",
 *     "displayname":"Alice","allowed_rooms":["*"]}]}
 *
 * Hash types: "scrypt$N$r$p$saltB64$keyB64" and, for accounts taken over from Jitsi/Prosody until their first panel login,
 * "scram-sha1$<iterations>$<salt b64>$<stored_key hex>" (RFC 5802 SCRAM-SHA-1 StoredKey; the salt is the base64 of the
 * UTF-8 bytes of the salt string kept in the Prosody account file).
 *
 * - The file is re-read when its inode, mtime, ctime or size changes (checked on every login attempt via statSync;
 *   the panel replaces the file by atomic rename, which yields a new inode).
 * - On a parse/validation error the previous list is kept (never log file contents).
 * - Hashes are verified with scrypt (parameters taken from the hash string) or SCRAM-SHA-1 and timingSafeEqual.
 * - Passwords are NFC-normalized before scrypt hashing/verification (the admin panel does the same when it hashes);
 *   SCRAM-SHA-1 uses NFKC as approximation of saslprep.
 * - Successful verifications are cached in memory (keyed by sha256 of hash + NUL + password), cleared on reload.
 * - Unknown usernames cost one dummy scrypt too (no timing oracle for valid usernames); SCRAM checks run a dummy scrypt as well;
 *   failed attempts are throttled per username (unknown names share one bucket) so the synchronous
 *   scrypt cannot be used to stall the event loop.
 */

const fs = require('fs');
const crypto = require('crypto');

const CACHE_MAX = 500;
const MAX_N = 1 << 20; // sanity caps for parameters read from the file
const MAX_R = 32;
const MAX_P = 16;
const MAX_KEYLEN = 256;
const SCRAM_MAX_ITERATIONS = 100000;
const THROTTLE_MAX_FAILS = 10; // failed checks per username per window; further attempts are rejected without scrypt
const THROTTLE_UNKNOWN_MAX_FAILS = 30; // shared bucket for all unknown usernames
const THROTTLE_WINDOW_MS = 60 * 1000;
const THROTTLE_MAX_KEYS = 1000;

function b64Strict(s) {
    return typeof s === 'string' && s.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0;
}

/** Parse the parts of "scram-sha1$iterations$saltB64$storedKeyHex"; returns null when malformed. */
function parseScramParts(parts) {
    if (parts.length !== 4) return null;
    const [, itS, saltB64, keyHex] = parts;
    if (!/^[0-9]{1,6}$/.test(itS)) return null;
    const iterations = Number(itS);
    if (iterations < 1 || iterations > SCRAM_MAX_ITERATIONS) return null;
    if (!b64Strict(saltB64) || !/^[0-9a-fA-F]{40}$/.test(keyHex)) return null;
    const salt = Buffer.from(saltB64, 'base64');
    if (salt.length < 1 || salt.length > 256) return null;
    return { kind: 'scram-sha1', iterations, salt, key: Buffer.from(keyHex, 'hex') };
}

/** Parse "scrypt$N$r$p$saltB64$keyB64" or "scram-sha1$iterations$saltB64$storedKeyHex"; returns null when malformed. */
function parseHash(hash) {
    if (typeof hash !== 'string' || hash.length > 1024) return null;
    const parts = hash.split('$');
    if (parts[0] === 'scram-sha1') return parseScramParts(parts);
    if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
    const [, nS, rS, pS, saltB64, keyB64] = parts;
    if (![nS, rS, pS].every((x) => /^[0-9]{1,8}$/.test(x))) return null;
    const N = Number(nS);
    const r = Number(rS);
    const p = Number(pS);
    if (N < 2 || (N & (N - 1)) !== 0 || N > MAX_N || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;
    if (!b64Strict(saltB64) || !b64Strict(keyB64)) return null;
    const salt = Buffer.from(saltB64, 'base64');
    const key = Buffer.from(keyB64, 'base64');
    if (salt.length < 8 || key.length < 16 || key.length > MAX_KEYLEN) return null;
    return { kind: 'scrypt', N, r, p, salt, key };
}

/** Verify a plaintext password against a scrypt hash string. Malformed hash = false. */
function verifyScryptHash(hash, password) {
    try {
        const h = parseHash(hash);
        if (!h || h.kind !== 'scrypt' || typeof password !== 'string') return false;
        const derived = crypto.scryptSync(password.normalize('NFC'), h.salt, h.key.length, {
            N: h.N,
            r: h.r,
            p: h.p,
            maxmem: 256 * h.N * h.r + 64 * 1024 * 1024,
        });
        return derived.length === h.key.length && crypto.timingSafeEqual(derived, h.key);
    } catch {
        return false;
    }
}

/**
 * Verify a plaintext password against a Prosody SCRAM-SHA-1 StoredKey (RFC 5802):
 * SaltedPassword = PBKDF2-HMAC-SHA1(saslprep(password), salt bytes, iterations, 20), ClientKey = HMAC(SaltedPassword, "Client Key"),
 * StoredKey = SHA1(ClientKey). saslprep is approximated by NFKC (identical for ASCII).
 * One dummy scrypt runs afterwards so legacy accounts cost about the same as scrypt ones (no timing oracle). Malformed = false.
 */
function verifyScramSha1Hash(hash, password) {
    try {
        const h = parseHash(hash);
        if (!h || h.kind !== 'scram-sha1' || typeof password !== 'string') return false;
        const salted = crypto.pbkdf2Sync(password.normalize('NFKC'), h.salt, h.iterations, 20, 'sha1');
        const clientKey = crypto.createHmac('sha1', salted).update('Client Key').digest();
        const storedKey = crypto.createHash('sha1').update(clientKey).digest();
        const ok = storedKey.length === h.key.length && crypto.timingSafeEqual(storedKey, h.key);
        verifyScryptHash(getDummyHash(), password);
        return ok;
    } catch {
        return false;
    }
}

/** Verify against either hash type (dispatch on the prefix). */
function verifyHash(hash, password) {
    return typeof hash === 'string' && hash.startsWith('scram-sha1$')
        ? verifyScramSha1Hash(hash, password)
        : verifyScryptHash(hash, password);
}

let dummyHash = null;
/** A valid hash of a random password: verified against for unknown usernames to equalize timing. */
function getDummyHash() {
    if (!dummyHash) {
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync(crypto.randomBytes(18).toString('base64'), salt, 64, { N: 16384, r: 8, p: 1 });
        dummyHash = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
    }
    return dummyHash;
}

/** Validate and normalize the parsed file; throws on structural errors. */
function normalizeFile(json, onSkip) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.users)) throw new Error('invalid structure');
    const seen = new Set();
    const out = [];
    for (const u of json.users) {
        if (!u || typeof u !== 'object' || Array.isArray(u)) throw new Error('invalid user entry');
        const username = typeof u.username === 'string' ? u.username : '';
        if (!username || seen.has(username)) throw new Error('invalid or duplicate username');
        seen.add(username);
        if (typeof u.password_hash !== 'string' || !parseHash(u.password_hash)) {
            // unknown/unsupported hash type (e.g. newer panel, older image): skip only this entry, never log its contents
            if (onSkip) onSkip();
            continue;
        }
        let rooms = Array.isArray(u.allowed_rooms) ? u.allowed_rooms.map((r) => String(r).trim()).filter(Boolean) : [];
        if (!rooms.length) rooms = ['*'];
        out.push({
            username,
            password: '',
            password_hash: u.password_hash,
            displayname: typeof u.displayname === 'string' ? u.displayname.trim() : '',
            allowed_rooms: rooms,
        });
    }
    return out;
}

/**
 * @param {{file:string, log?:{info:Function,warn:Function}}} opts
 */
function createHostUsersFile({ file, log = console, now = Date.now }) {
    let users = [];
    let sig = null; // `${ino}:${mtimeMs}:${ctimeMs}:${size}` of the last successfully read state
    let lastErrSig = null; // avoid repeating the same warning on every login
    const cache = new Map();
    const fails = new Map(); // throttle bucket -> { count, resetAt }

    function load(initial) {
        let st;
        try {
            st = fs.statSync(file);
        } catch {
            const s = 'missing';
            if (lastErrSig !== s) {
                log.warn(
                    initial
                        ? 'HOST_USERS_FILE not found yet, no host users loaded (will retry on login)'
                        : 'HOST_USERS_FILE is not readable, keeping previous host users'
                );
                lastErrSig = s;
            }
            return false;
        }
        const cur = `${st.ino}:${st.mtimeMs}:${st.ctimeMs}:${st.size}`;
        if (cur === sig || cur === lastErrSig) return false;
        try {
            let skipped = 0;
            const next = normalizeFile(JSON.parse(fs.readFileSync(file, 'utf8')), () => skipped++);
            if (skipped) log.warn(`HOST_USERS_FILE: ${skipped} entry/entries with unsupported password_hash skipped (CouchChat image too old for this hash type?)`);
            users = next;
            sig = cur;
            lastErrSig = null;
            cache.clear();
            log.info(`HOST_USERS_FILE loaded: ${users.length} host user(s)`);
            return true;
        } catch (e) {
            lastErrSig = cur;
            log.warn(`HOST_USERS_FILE could not be parsed (${e && e.message ? e.message : 'error'}), keeping previous host users`);
            return false;
        }
    }

    function refresh() {
        load(false);
        return users;
    }

    function cacheKey(user, password) {
        return crypto.createHash('sha256').update(`${user.password_hash}\0${password.normalize('NFC')}`).digest('hex');
    }

    function hasCached(user, password) {
        return cache.has(cacheKey(user, password));
    }

    function verify(user, password) {
        if (!user || !user.password_hash || typeof password !== 'string') return false;
        const key = cacheKey(user, password);
        if (cache.has(key)) return true;
        if (!verifyHash(user.password_hash, password)) return false;
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(key, true);
        return true;
    }

    function throttled(bucket, max) {
        const f = fails.get(bucket);
        return !!f && f.resetAt > now() && f.count >= max;
    }

    function recordFail(bucket) {
        const t = now();
        const f = fails.get(bucket);
        if (f && f.resetAt > t) {
            f.count++;
            return;
        }
        if (fails.size >= THROTTLE_MAX_KEYS) {
            for (const [k, v] of fails) if (v.resetAt <= t) fails.delete(k);
            if (fails.size >= THROTTLE_MAX_KEYS) fails.delete(fails.keys().next().value);
        }
        fails.set(bucket, { count: 1, resetAt: t + THROTTLE_WINDOW_MS });
    }

    /** Lookup like upstream getAuthPeer; returns the user entry or null. */
    function getAuthPeer(username, password) {
        refresh();
        if (typeof username !== 'string' || typeof password !== 'string') return null;
        const user = users.find((u) => u.username === username);
        if (user) {
            const bucket = `u:${username}`;
            if (throttled(bucket, THROTTLE_MAX_FAILS) && !hasCached(user, password)) return null;
            if (verify(user, password)) return user;
            recordFail(bucket);
            return null;
        }
        if (throttled('unknown', THROTTLE_UNKNOWN_MAX_FAILS)) return null;
        verifyScryptHash(getDummyHash(), password); // same cost as a real check
        recordFail('unknown');
        return null;
    }

    load(true);
    return { refresh, getAuthPeer, users: () => users, verify };
}

module.exports = { createHostUsersFile, verifyScryptHash, verifyScramSha1Hash, verifyHash, parseHash, normalizeFile };
