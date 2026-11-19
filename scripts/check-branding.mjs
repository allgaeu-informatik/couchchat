#!/usr/bin/env node
// Static branding check of a generated public tree (build/public). Plain Node ESM, no dependencies.
// Used by scripts/patch.mjs as a final gate and by scripts/smoke-test.sh (file-grep part).
//
//   node scripts/check-branding.mjs build/public [--app <app/src dir>]
//
// Prints "file:line: message" per violation and exits 1 if there is any.
// Only USER-VISIBLE or network-loaded things matter: HTML/JS comments (e.g. AGPL license headers) are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- forbidden patterns (case-insensitive) -------------------------------------------------------------
// Applied to views (comments stripped), JS (comment lines skipped), lang JSON (keys and values) and CSS.
const FORBIDDEN = [
    ['mirotalk', /mirotalk/i],
    ['miroslav', /miroslav/i],
    ['pejic', /pejic/i],
    ['github.com/miroslav', /github\.com\/miroslav/i],
    ['buymeacoffee', /buymeacoffee/i],
    ['patreon', /patreon/i],
    ['codecanyon', /codecanyon/i],
    ['sponsor', /sponsor/i],
    ['advertis*', /advertis/i],
    ['contabo', /contabo/i],
    ['hostinger', /hostinger/i],
    ['rambox', /rambox/i],
    ['stats.mirotalk', /stats\.mirotalk/i],
    ['docs.mirotalk', /docs\.mirotalk/i],
    ['fonts.googleapis', /fonts\.googleapis/i],
    ['fonts.gstatic', /fonts\.gstatic/i],
    ['buttons.github.io', /buttons\.github\.io/i],
    ['giphy', /giphy/i],
    // Business-SaaS: no "no account / free" promises (user-visible text only; the check skips JS comments)
    ['ohne Konto', /ohnes+Konto/i],
    ['keine Registrierung', /keine?s+Registrierung/i],
    ['Registrierung nicht', /Registrierungs+(?:ists+)?nicht/i],
    ['ohne Anmeldung', /ohnes+Anmeldung/i],
    ['kostenlos', /kostenlos/i],
];

// ALLOW-LIST (explicit and commented). Tokens removed from a line before the "mirotalk" test:
//  - internal identifiers that are never shown to users: CSS classes / element ids / data-channel names /
//    postMessage types / storage keys such as mirotalk-swal-destructive, mirotalk_chat_channel,
//    mirotalk:redirect, mirotalkTheme, mirotalkFileDropzone, mirotalk-logo.png (renamed to couchchat-logo; file names are kept on purpose
//    so hardcoded references keep working; the files themselves are replaced by CouchChat images).
const ALLOWED_TOKENS = [/mirotalk[-_:][\w:-]*/gi, /mirotalk[A-Z]\w*/g];

// Per-file allow-list for identifiers that are DOM ids / variable names of upstream code, never shown to users
// (the landing sections they refer to are removed from the HTML by scripts/patch.mjs).
const FILE_ALLOW = [
    [/^js\/brand\.js$/, /\b(?:topSponsors|sponsors|pastSponsors|advertisers|MiroTalkWidget)\b/g],
    [/^js\/landing\.js$/, /\bpastSponsors(?:Toggle)?\b/g],
];

// Marketing phrases that must not be visible in views / lang values.
const MARKETING = [
    ['free', /\bfree\b/i],
    ['kostenlos', /kostenlos/i],
    ['open source', /open[- ]source/i],
];
// Per-file allow-list for "free" in visible text (technical meanings, not marketing). Keep this list short.
const MARKETING_ALLOW = [
    // [file regex, line regex, reason]
];

const CSS_NET = ['fonts.googleapis', 'fonts.gstatic', 'buttons.github.io', 'stats.mirotalk', 'docs.mirotalk'];
const VIEW_COMMENT = /<!--[\s\S]*?-->/g;

function lineOf(text, idx) {
    return text.slice(0, idx).split('\n').length;
}

function stripAllowed(s) {
    for (const re of ALLOWED_TOKENS) s = s.replace(re, '');
    return s;
}

function walk(dir, base = dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p, base));
        else out.push(path.relative(base, p).split(path.sep).join('/'));
    }
    return out;
}

/** Blank out comments but keep line numbers. */
function blankComments(html) {
    return html.replace(VIEW_COMMENT, (m) => m.replace(/[^\n]/g, ' '));
}

/** Visible text of an HTML page: tags, scripts, styles and comments removed; useful attributes appended. */
function visibleTextLines(html) {
    let t = blankComments(html);
    const keepAttr = [];
    t.replace(/\b(?:title|alt|placeholder|aria-label|content|value)="([^"]*)"/g, (m, v, off) => {
        keepAttr.push([off, v]);
        return m;
    });
    t = t.replace(/<script[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, ' '));
    t = t.replace(/<style[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ' '));
    const lines = [];
    // text nodes
    const textOnly = t.replace(/<[^>]*>/g, (m) => m.replace(/[^\n]/g, ' '));
    textOnly.split('\n').forEach((l, i) => lines.push([i + 1, l]));
    for (const [off, v] of keepAttr) lines.push([lineOf(t, off), v]);
    return lines;
}

export function checkBuild(root, { structure = true } = {}) {
    const problems = [];
    const files = walk(root);
    const rel = (f) => path.join(path.basename(root), f).split(path.sep).join('/');
    const add = (f, line, msg) => problems.push(`${rel(f)}:${line}: ${msg}`);

    for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (!['.html', '.js', '.json', '.css', '.svg'].includes(ext)) continue;
        if (f.startsWith('vendor/')) continue; // pinned third-party libraries (vendor.lock.json), checked by 50-vendor
        const text = fs.readFileSync(path.join(root, f), 'utf8');
        let lines;
        if (ext === '.html') {
            lines = blankComments(text).split('\n');
        } else if (ext === '.js') {
            // skip comment-only lines (// ..., /* ..., * ..., */) - AGPL headers and JSDoc are not user visible
            lines = text.split('\n').map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? '' : l));
        } else if (ext === '.css') {
            lines = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
        } else {
            lines = text.split('\n');
        }

        lines.forEach((line, i) => {
            if (!line) return;
            let cleaned = stripAllowed(line);
            let lineChk = line;
            for (const [fr, re] of FILE_ALLOW) if (fr.test(f)) { cleaned = cleaned.replace(re, ''); lineChk = lineChk.replace(re, ''); }
            for (const [name, re] of FORBIDDEN) {
                // CSS: selectors of removed sections (#topSponsors ...) are dead rules, not visible; only network loads matter
                if (ext === '.css' && !CSS_NET.includes(name)) continue;
                const subject = name === 'mirotalk' ? cleaned : lineChk;
                if (re.test(subject)) add(f, i + 1, `forbidden "${name}": ${line.trim().slice(0, 140)}`);
            }
        });

        // marketing phrases: visible text of views and values of lang files
        if (ext === '.html') {
            for (const [ln, l] of visibleTextLines(text)) {
                for (const [name, re] of MARKETING) {
                    if (re.test(l) && !MARKETING_ALLOW.some(([fr, lr]) => fr.test(f) && lr.test(l))) {
                        add(f, ln, `marketing phrase "${name}" in visible text: ${l.trim().slice(0, 140)}`);
                    }
                }
            }
        }
        if (ext === '.json' && f.startsWith('lang/')) {
            lines.forEach((l, i) => {
                for (const [name, re] of MARKETING) {
                    if (re.test(l) && !MARKETING_ALLOW.some(([fr, lr]) => fr.test(f) && lr.test(l))) {
                        add(f, i + 1, `marketing phrase "${name}" in lang file: ${l.trim().slice(0, 140)}`);
                    }
                }
            });
        }
    }

    if (!structure) return problems;
    // ---- structural checks -------------------------------------------------------------------------------
    const view = (n) => (fs.existsSync(path.join(root, 'views', n)) ? fs.readFileSync(path.join(root, 'views', n), 'utf8') : null);
    for (const n of ['landing.html', 'newcall.html', 'login.html', 'waitingRoom.html', '404.html']) {
        const t = view(n);
        if (t === null) {
            add(`views/${n}`, 1, 'view missing');
            continue;
        }
        for (const need of ['https://allgaeu-informatik.de/impressum', 'https://allgaeu-informatik.de/datenschutz', 'https://allgaeu-informatik.de/kontakt']) {
            if (!t.includes(need)) add(`views/${n}`, 1, `footer link missing: ${need}`);
        }
    }
    for (const n of ['landing.html', 'newcall.html', 'login.html', 'waitingRoom.html', 'customizeRoom.html', 'client.html', 'activeRooms.html', 'testStunTurn.html', '404.html']) {
        const t = view(n);
        if (t !== null && !/<link rel="stylesheet" href="\/css\/couchchat\.css" \/>/.test(t)) add(`views/${n}`, 1, 'couchchat.css not linked');
    }

    // referenced local assets must exist (catches removed widget.js etc. that a view still loads)
    for (const f of files.filter((x) => x.startsWith('views/') && x.endsWith('.html'))) {
        const t = blankComments(fs.readFileSync(path.join(root, f), 'utf8'));
        const re = /\b(?:src|href)="([^"#?]+)"/g;
        let m;
        while ((m = re.exec(t))) {
            const u = m[1];
            if (/^(https?:|mailto:|data:|\{\{|javascript:|\/socket\.io\/)/.test(u)) continue; // /socket.io/socket.io.js is served by the app itself
            if (u === '/' || u.startsWith('/join') || u === '/login' || u === '/newcall' || u === '/privacy') continue;
            const target = u.startsWith('/') ? u.slice(1) : u.replace(/^(\.\.\/)+/, '');
            if (!/\.[a-z0-9]+$/i.test(target)) continue; // route, not a file
            if (!fs.existsSync(path.join(root, target))) add(f, lineOf(t, m.index), `referenced file does not exist: ${u}`);
        }
    }

    // external hosts loaded by views (informational list is printed by smoke-test.sh --hosts)
    return problems;
}

// ---- app/src (server code): only USER-VISIBLE string literals ---------------------------------------------
// Server code is full of identifiers and log lines that mention the upstream project. Only string literals are
// inspected (comments are skipped by the tokenizer), and each hit must be justified in APP_ALLOW below.
// Logger-only literals are not user-visible but are not distinguished from other literals: allow them explicitly.
//
// ENFORCEMENT: APP_CHECK_ENFORCED is true, so findings in app/src break the build like the public/ check. Setting it
// to false only downgrades the findings to warnings (patch.mjs); keep it true and justify exceptions in APP_ALLOW.
export const APP_CHECK_ENFORCED = true;

// Same forbidden patterns as for public/ except the CSS/network-only entries.
const APP_FORBIDDEN = FORBIDDEN.filter(([n]) => !['fonts.googleapis', 'fonts.gstatic'].includes(n));

// ALLOW-LIST: [file regex (relative to app/src), literal regex, reason]. Keep explicit and commented.
const APP_ALLOW = [
    [/^jwtSecret\.js$/, /^mirotalkp2p(?:_jwt_secret|:)/, 'deny-list of publicly known default secrets and HKDF label; internal, never shown to users'],
    [/^logs\.js$/, /^miroTalkP2P$/, 'default name of the internal logger instance (log prefix only)'],
    [/^server\.js$/, /^mirotalkp2p_default_secret$/, 'compared against the configured API secret to reject the publicly known default'],
    [/^server\.js$/, /^MiroTalk$/, 'entry of the deny-list of publicly known default HOST_USERS credentials (MiroTalk/P2P)'],
];

/** Extract string literals (', ", `) of JS source with 1-based line numbers; comments are skipped. */
export function stringLiterals(src) {
    const out = [];
    let i = 0;
    let line = 1;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        const d = src[i + 1];
        if (c === '\n') { line++; i++; continue; }
        if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') {
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
            i += 2;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            const quote = c;
            const startLine = line;
            let j = i + 1;
            let val = '';
            while (j < n && src[j] !== quote) {
                if (src[j] === '\\') { val += src[j] + (src[j + 1] || ''); j += 2; continue; }
                if (src[j] === '\n') {
                    if (quote !== '`') break; // unterminated quote: probably a regex literal, bail out
                    line++;
                }
                val += src[j];
                j++;
            }
            out.push([startLine, val]);
            i = j + 1;
            continue;
        }
        i++;
    }
    return out;
}

/** Returns all findings; whether they fail the build is decided by the caller (APP_CHECK_ENFORCED). */
export function checkApp(appSrcRoot) {
    const problems = [];
    if (!fs.existsSync(appSrcRoot)) return problems;
    for (const f of walk(appSrcRoot).filter((x) => x.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(appSrcRoot, f), 'utf8');
        for (const [line, lit] of stringLiterals(src)) {
            if (APP_ALLOW.some(([fr, lr]) => fr.test(f) && lr.test(lit))) continue;
            const cleaned = stripAllowed(lit);
            for (const [name, re] of APP_FORBIDDEN) {
                if (re.test(name === 'mirotalk' ? cleaned : lit)) {
                    problems.push(`app/src/${f}:${line}: forbidden "${name}" in string literal: ${lit.trim().slice(0, 120)}`);
                }
            }
        }
    }
    return problems;
}

export function externalHosts(root) {
    const hosts = new Map();
    for (const f of walk(root).filter((x) => x.startsWith('views/') && x.endsWith('.html'))) {
        const t = blankComments(fs.readFileSync(path.join(root, f), 'utf8'));
        const re = /\b(?:src|href)="(https?:\/\/([^/"]+)[^"]*)"/g;
        let m;
        while ((m = re.exec(t))) {
            const key = m[2];
            if (!hosts.has(key)) hosts.set(key, new Set());
            hosts.get(key).add(f);
        }
    }
    return hosts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = path.resolve(process.argv[2] || 'build/public');
    if (!fs.existsSync(dir)) {
        console.error(`ERROR: directory not found: ${dir}`);
        process.exit(2);
    }
    const problems = checkBuild(dir, { structure: !process.argv.includes('--no-structure') });
    const appDir = process.argv.includes('--app') ? path.resolve(process.argv[process.argv.indexOf('--app') + 1]) : null;
    if (appDir) {
        const appProblems = checkApp(appDir);
        console.log(`app/src check (${APP_CHECK_ENFORCED ? 'enforced' : 'NOT enforced'}): ${appProblems.length} finding(s)`);
        if (APP_CHECK_ENFORCED) problems.push(...appProblems);
        else appProblems.forEach((p) => console.log('  (warning) ' + p));
    }
    if (process.argv.includes('--hosts')) {
        console.log('External hosts loaded by views (list them in the privacy policy):');
        for (const [h, fs_] of externalHosts(dir)) console.log(`  ${h}  (${[...fs_].join(', ')})`);
    }
    if (problems.length) {
        console.error(problems.join('\n'));
        console.error(`\nFAILED: ${problems.length} violation(s)`);
        process.exit(1);
    }
    console.log('OK: no branding violations in ' + dir);
}
