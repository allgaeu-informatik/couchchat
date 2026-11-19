#!/usr/bin/env node
// vendor.mjs - fetch pinned third-party browser libraries and lay them out under <out>/<name>/...
// Runs in the Dockerfile stage "vendor" (node:24-alpine, needs npm + tar). Network only here, never at patch time.
//
//   node scripts/vendor.mjs --lock vendor.lock.json --out /vendor
//   node scripts/vendor.mjs --lock vendor.lock.json --update-lock   (fill missing integrity/sha256; maintenance)
//
// Lock entry types:
//   npm: { name, package, version, integrity, files: { "<path in package>": "<path under out/name>" } }
//        a key ending in "/" copies a directory recursively.
//   url: { name, files: [ { url, sha256, to } ] }
// Any mismatch (integrity, sha256, missing file) aborts with exit 1.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
};
const lockPath = path.resolve(opt('--lock') || 'vendor.lock.json');
const outDir = opt('--out') ? path.resolve(opt('--out')) : null;
const update = args.includes('--update-lock');
if (!outDir && !update) {
    console.error('usage: vendor.mjs --lock <file> (--out <dir> | --update-lock)');
    process.exit(2);
}

const die = (m) => {
    console.error(`vendor: FAIL: ${m}`);
    process.exit(1);
};
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
let lockChanged = false;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function copyInto(srcAbs, dstAbs) {
    const st = fs.statSync(srcAbs);
    if (st.isDirectory()) {
        for (const e of fs.readdirSync(srcAbs).sort()) copyInto(path.join(srcAbs, e), path.join(dstAbs, e));
    } else {
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        fs.copyFileSync(srcAbs, dstAbs);
    }
}

function handleNpm(e, tmp) {
    const spec = `${e.package}@${e.version}`;
    const dir = fs.mkdtempSync(path.join(tmp, 'pk-'));
    let meta;
    try {
        const out = execFileSync('npm', ['pack', spec, '--json', '--silent', '--ignore-scripts'], {
            cwd: dir,
            encoding: 'utf8',
        });
        meta = JSON.parse(out)[0];
    } catch (err) {
        die(`npm pack ${spec} failed: ${err.message}`);
    }
    if (e.integrity && e.integrity !== meta.integrity) {
        die(`${spec}: integrity mismatch (lock ${e.integrity}, got ${meta.integrity})`);
    }
    if (!e.integrity) {
        if (!update) die(`${spec}: no integrity in lock (run --update-lock)`);
        e.integrity = meta.integrity;
        lockChanged = true;
    }
    if (!outDir) return;
    const ex = path.join(dir, 'x');
    fs.mkdirSync(ex);
    execFileSync('tar', ['-xzf', path.join(dir, meta.filename), '-C', ex]);
    for (const [from, to] of Object.entries(e.files)) {
        const src = path.join(ex, 'package', from);
        if (!fs.existsSync(src)) die(`${spec}: file not in package: ${from}`);
        copyInto(src, path.join(outDir, e.name, to));
    }
}

async function handleUrl(e) {
    for (const f of e.files) {
        const res = await fetch(f.url);
        if (!res.ok) die(`${f.url}: HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const h = sha256(buf);
        if (f.sha256 && f.sha256 !== h) die(`${f.url}: sha256 mismatch (lock ${f.sha256}, got ${h})`);
        if (!f.sha256) {
            if (!update) die(`${f.url}: no sha256 in lock (run --update-lock)`);
            f.sha256 = h;
            lockChanged = true;
        }
        if (!outDir) continue;
        const dst = path.join(outDir, e.name, f.to);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, buf);
    }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-'));
try {
    if (outDir) {
        fs.rmSync(outDir, { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });
    }
    for (const e of lock.entries) {
        console.log(`vendor: ${e.name}`);
        if (e.type === 'npm') handleNpm(e, tmp);
        else if (e.type === 'url') await handleUrl(e);
        else die(`${e.name}: unknown type ${e.type}`);
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
if (lockChanged) {
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    console.log('vendor: lock updated');
}
console.log('vendor: OK');
