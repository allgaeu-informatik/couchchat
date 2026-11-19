// Run: node --test scripts/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHostUsersFile, verifyScryptHash, verifyScramSha1Hash, verifyHash, parseHash, normalizeFile } = require('../patches/data/host-users-loader.js');

function makeHash(password, salt = crypto.randomBytes(16)) {
    const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

test('shared test vector', () => {
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const hash = makeHash('Couch!Chat9', salt);
    assert.ok(parseHash(hash));
    assert.equal(verifyScryptHash(hash, 'Couch!Chat9'), true);
    assert.equal(verifyScryptHash(hash, 'couch!Chat9'), false);
});

test('malformed hashes never match', () => {
    for (const h of ['', 'x', 'scrypt$1$2', 'scrypt$16384$8$1$!!$!!', 'bcrypt$16384$8$1$AAAAAAAAAAA=$AAAA', 'scrypt$3$8$1$AAAAAAAAAAA=$AAAAAAAAAAAAAAAAAAAAAA==']) {
        assert.equal(verifyScryptHash(h, 'x'), false);
    }
    assert.equal(verifyScryptHash(null, 'x'), false);
});

test('file load, reload, keep-previous on error, missing file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hu-'));
    const file = path.join(dir, 'host-users.json');
    const logs = { info: [], warn: [] };
    const log = { info: (m) => logs.info.push(m), warn: (m) => logs.warn.push(m) };

    // missing at startup: no crash, empty list, warn
    const store = createHostUsersFile({ file, log });
    assert.equal(store.users().length, 0);
    assert.equal(store.getAuthPeer('alice', 'Secret!Pass1'), null);
    assert.ok(logs.warn.length >= 1);

    const write = (users) => fs.writeFileSync(file, JSON.stringify({ version: 1, generated_at: new Date().toISOString(), users }));
    write([{ username: 'alice', password_hash: makeHash('Secret!Pass1'), displayname: 'Alice', allowed_rooms: ['*'] }]);
    const u = store.getAuthPeer('alice', 'Secret!Pass1');
    assert.equal(u.displayname, 'Alice');
    assert.deepEqual(u.allowed_rooms, ['*']);
    assert.equal(store.getAuthPeer('alice', 'wrong'), null);
    assert.equal(store.getAuthPeer('alice', 'Secret!Pass1'), u); // cached path

    // corrupt file: previous list kept, no content in the log
    fs.writeFileSync(file, '{"users": [ SECRET-GARBAGE ');
    assert.ok(store.getAuthPeer('alice', 'Secret!Pass1'));
    assert.ok(!logs.warn.join('\n').includes('SECRET-GARBAGE'));

    // valid change: new user, old one removed, cache cleared
    write([{ username: 'bob', password_hash: makeHash('Other!Pass22'), displayname: 'Bob', allowed_rooms: ['r1'] }]);
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    assert.equal(store.getAuthPeer('alice', 'Secret!Pass1'), null);
    assert.deepEqual(store.getAuthPeer('bob', 'Other!Pass22').allowed_rooms, ['r1']);

    // 128 char password works
    const long = 'Aa1!' + 'x'.repeat(124);
    write([{ username: 'carol', password_hash: makeHash(long), displayname: 'C', allowed_rooms: [] }]);
    fs.utimesSync(file, new Date(), new Date(Date.now() + 10000));
    assert.ok(store.getAuthPeer('carol', long));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('NFC: composed and decomposed input are the same password (non-ASCII vector shared with the panel)', () => {
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const composed = 'Café!Pass1';
    const decomposed = 'Café!Pass1';
    assert.notEqual(composed, decomposed);
    // Panel side hashes password.normalize('NFC'); makeHash here does the same.
    const hash = makeHash(composed.normalize('NFC'), salt);
    assert.equal(verifyScryptHash(hash, composed), true);
    assert.equal(verifyScryptHash(hash, decomposed), true);
    assert.equal(verifyScryptHash(hash, 'Cafe!Pass1'), false);
});

test('NFC: decomposed login works through getAuthPeer incl. the success cache', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hu-'));
    const file = path.join(dir, 'host-users.json');
    const hash = makeHash('Café!Pass1');
    fs.writeFileSync(file, JSON.stringify({ version: 1, users: [{ username: 'zoe', password_hash: hash, displayname: 'Z', allowed_rooms: ['*'] }] }));
    const store = createHostUsersFile({ file, log: { info() {}, warn() {} } });
    assert.ok(store.getAuthPeer('zoe', 'Café!Pass1'));
    assert.ok(store.getAuthPeer('zoe', 'Café!Pass1'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('throttle: failures per username are limited, cached success still works, window expires; unknown names cost scrypt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hu-'));
    const file = path.join(dir, 'host-users.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, users: [{ username: 'zoe', password_hash: makeHash('Good!Pass1'), displayname: 'Z', allowed_rooms: ['*'] }] }));
    let t = 1_000_000;
    const store = createHostUsersFile({ file, log: { info() {}, warn() {} }, now: () => t });
    assert.ok(store.getAuthPeer('zoe', 'Good!Pass1')); // now cached
    for (let i = 0; i < 10; i++) assert.equal(store.getAuthPeer('zoe', `Bad!Pass${i}`), null);

    // 11th wrong attempt is rejected without running scrypt (fast), the cached correct password still passes
    let s = process.hrtime.bigint();
    assert.equal(store.getAuthPeer('zoe', 'Bad!Pass99'), null);
    const throttledMs = Number(process.hrtime.bigint() - s) / 1e6;
    assert.ok(throttledMs < 20, `throttled attempt should not run scrypt (took ${throttledMs} ms)`);
    assert.ok(store.getAuthPeer('zoe', 'Good!Pass1'));

    // window expires -> real checks again
    t += 61_000;
    s = process.hrtime.bigint();
    assert.equal(store.getAuthPeer('zoe', 'Bad!Pass99'), null);
    assert.ok(Number(process.hrtime.bigint() - s) / 1e6 >= 5, 'expected a real scrypt check after the window');

    // unknown username: runs a dummy scrypt (no timing oracle)
    store.getAuthPeer('nobody', 'x'); // warm the lazily created dummy hash
    s = process.hrtime.bigint();
    assert.equal(store.getAuthPeer('nobody', 'Whatever!1'), null);
    assert.ok(Number(process.hrtime.bigint() - s) / 1e6 >= 5, 'unknown username must cost about one scrypt');
    fs.rmSync(dir, { recursive: true, force: true });
});

// ---- Prosody SCRAM-SHA-1 (legacy hash type) ----------------------------------------------------------------------
// Independent, straightforward implementation of RFC 5802 as Prosody stores it (salt = the salt STRING as stored).
function makeScramHash(password, saltString = '2a3b8c1e-5d6f-4a7b-9c0d-1e2f3a4b5c6d', iterations = 4096) {
    const salted = crypto.pbkdf2Sync(password, Buffer.from(saltString, 'utf8'), iterations, 20, 'sha1');
    const clientKey = crypto.createHmac('sha1', salted).update('Client Key').digest();
    const storedKey = crypto.createHash('sha1').update(clientKey).digest('hex');
    return `scram-sha1$${iterations}$${Buffer.from(saltString, 'utf8').toString('base64')}$${storedKey}`;
}

test('scram-sha1: correct password accepted, wrong rejected (shared vector with the panel tests)', () => {
    const hash = makeScramHash('Couch!Chat9');
    assert.ok(parseHash(hash));
    assert.equal(verifyScramSha1Hash(hash, 'Couch!Chat9'), true);
    assert.equal(verifyScramSha1Hash(hash, 'couch!Chat9'), false);
    assert.equal(verifyHash(hash, 'Couch!Chat9'), true);
    assert.equal(verifyHash(hash, 'nope'), false);
    assert.equal(verifyScryptHash(hash, 'Couch!Chat9'), false); // wrong verifier for this type
    // uppercase hex is accepted (compared as bytes)
    assert.equal(verifyScramSha1Hash(hash.replace(/[0-9a-f]{40}$/, (m) => m.toUpperCase()), 'Couch!Chat9'), true);
});

test('scram-sha1: malformed or hostile strings never match', () => {
    const good = makeScramHash('x');
    const [, it, salt, key] = good.split('$');
    const bad = [
        '',
        'scram-sha1',
        'scram-sha1$4096$' + salt,
        `scram-sha1$0$${salt}$${key}`,
        `scram-sha1$100001$${salt}$${key}`,
        `scram-sha1$abc$${salt}$${key}`,
        `scram-sha1$${it}$!!!$${key}`,
        `scram-sha1$${it}$${salt}$${key.slice(2)}`,
        `scram-sha1$${it}$${salt}$${key.replace(/.$/, 'g')}`,
        `scram-sha1$${it}$${salt}$${key}$extra`,
        `scram-sha1$${it}$$${key}`,
    ];
    for (const h of bad) {
        assert.equal(parseHash(h), null, h);
        assert.equal(verifyHash(h, 'x'), false, h);
    }
});

test('scram-sha1: login through the file store, cache and reload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hu-'));
    const file = path.join(dir, 'host-users.json');
    fs.writeFileSync(
        file,
        JSON.stringify({ version: 1, users: [{ username: 'old', password_hash: makeScramHash('Couch!Chat9'), displayname: 'Old', allowed_rooms: ['*'] }] })
    );
    const store = createHostUsersFile({ file, log: { info() {}, warn() {} } });
    assert.equal(store.users().length, 1);
    assert.ok(store.getAuthPeer('old', 'Couch!Chat9'));
    assert.ok(store.getAuthPeer('old', 'Couch!Chat9')); // cached
    assert.equal(store.getAuthPeer('old', 'wrong'), null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('file change detection: atomic rename with identical size and mtime is still noticed (inode)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hu-'));
    const file = path.join(dir, 'host-users.json');
    const body = (pw) => JSON.stringify({ version: 1, users: [{ username: 'zoe', password_hash: makeHash(pw), displayname: 'Z', allowed_rooms: ['*'] }] });
    const fixed = new Date('2030-01-01T00:00:00Z');
    fs.writeFileSync(file, body('Pass!One11'));
    fs.utimesSync(file, fixed, fixed);
    const store = createHostUsersFile({ file, log: { info() {}, warn() {} } });
    assert.ok(store.getAuthPeer('zoe', 'Pass!One11'));
    const tmp = path.join(dir, 'new.tmp');
    fs.writeFileSync(tmp, body('Pass!Two22')); // same byte length
    fs.utimesSync(tmp, fixed, fixed);
    fs.renameSync(tmp, file);
    assert.equal(store.getAuthPeer('zoe', 'Pass!One11'), null);
    assert.ok(store.getAuthPeer('zoe', 'Pass!Two22'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('normalizeFile: unsupported hash type skips only that entry', () => {
    let skipped = 0;
    const out = normalizeFile(
        { users: [{ username: 'a', password_hash: 'future$x$y' }, { username: 'b', password_hash: makeHash('pw') }] },
        () => skipped++,
    );
    assert.deepEqual(out.map((u) => u.username), ['b']);
    assert.equal(skipped, 1);
    assert.throws(() => normalizeFile({ users: [{ username: 'b', password_hash: makeHash('pw') }, { username: 'b', password_hash: makeHash('pw') }] }));
});
