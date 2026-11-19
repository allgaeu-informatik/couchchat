#!/usr/bin/env node
// CouchChat patcher core. Patches a /src-shaped tree (public/ and app/src/) of the pinned MiroTalk P2P image.
//
// Plain Node ESM, no npm dependencies. Deterministic and idempotent when started from a pristine tree
// (use --out to leave --root untouched). Every patch declares an anchor and an expected match count; a mismatch
// FAILS the run (exit 1) - that is the signal that upstream changed and the patch has to be revisited.
//
//   node scripts/patch.mjs --root <dir> [--out <dir>] [--branding branding] [--vendor <dir>]
//
//   --root      tree shaped like /src (contains public/ and app/src/). Patched IN PLACE unless --out is given.
//   --out       copy --root there first and patch the copy (root stays pristine).
//   --branding  branding source dir (default: <repo>/branding)
//   --vendor    optional dir with pinned third-party files (output of the vendor stage), used by 50-vendor.mjs
//
// Patch modules live in scripts/patches/ and run in fixed order (see scripts/patches/README.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, copyTreeAbs, PatchError } from './lib/helpers.mjs';
import { checkBuild, checkApp, APP_CHECK_ENFORCED } from './check-branding.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PATCH_DIR = path.join(HERE, 'patches');
export const MODULES = ['10-assets', '20-views', '30-texts', '40-server', '50-vendor', '60-backgrounds', '90-cleanup'];

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    if (i >= 0 && args[i + 1]) return path.resolve(args[i + 1]);
    return def === undefined ? null : path.resolve(REPO, def);
};

async function main() {
    const rootArg = opt('root');
    if (!rootArg) {
        console.error('Usage: node scripts/patch.mjs --root <dir> [--out <dir>] [--branding <dir>] [--vendor <dir>]');
        process.exit(2);
    }
    const out = opt('out');
    const branding = opt('branding', 'branding');
    const vendor = opt('vendor');

    if (!fs.existsSync(path.join(rootArg, 'public', 'views', 'landing.html')) || !fs.existsSync(path.join(rootArg, 'app', 'src'))) {
        console.error(`ERROR: --root is not a /src-shaped tree (needs public/views and app/src): ${rootArg}`);
        process.exit(2);
    }
    let root = rootArg;
    if (out) {
        fs.rmSync(out, { recursive: true, force: true });
        copyTreeAbs(path.join(rootArg, 'public'), path.join(out, 'public'));
        copyTreeAbs(path.join(rootArg, 'app'), path.join(out, 'app'));
        root = out;
    }

    const ctx = createContext({ root, branding, vendor });
    const ran = [];
    for (const m of MODULES) {
        const file = path.join(PATCH_DIR, `${m}.mjs`);
        if (!fs.existsSync(file)) {
            console.log(`skip ${m} (module not present)`);
            continue;
        }
        const mod = await import(pathToFileURL(file).href);
        if (typeof mod.default !== 'function') throw new PatchError(`patch module ${m} has no default export function`);
        const before = ctx.logs.length;
        await mod.default(ctx);
        ran.push(`${mod.name || m} (${ctx.logs.length - before} steps)`);
    }

    ctx.currentFile = 'final check';
    const problems = checkBuild(path.join(root, 'public'));
    const appFindings = checkApp(path.join(root, 'app', 'src'));
    if (APP_CHECK_ENFORCED) problems.push(...appFindings);
    else for (const f of appFindings) ctx.warn(`app/src check not enforced yet: ${f}`);
    console.log('Applied patches:');
    for (const l of ctx.logs) console.log(`  - ${l}`);
    for (const w of ctx.warnings) console.log(`WARNING: ${w}`);
    if (problems.length) {
        console.error(`\nFAILED: ${problems.length} branding problem(s) remain in the generated tree:`);
        for (const p of problems) console.error(`  ${p}`);
        process.exit(1);
    }
    console.log(`\nModules: ${ran.join(', ')}`);
    console.log(`OK: ${ctx.logs.length} patch steps, ${ctx.warnings.length} warning(s), root: ${root}`);
}

main().catch((e) => {
    if (e instanceof PatchError) {
        console.error(`\nPATCH FAILED: ${e.message}`);
        console.error('Upstream changed in a way the patcher does not know. Update scripts/patches/*.mjs for the new version.');
        process.exit(1);
    }
    console.error(e);
    process.exit(1);
});
