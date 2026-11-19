// Shared patch helpers. Plain Node ESM, no dependencies.
// createContext() builds the `ctx` object handed to every patch module (see scripts/patches/README.md).

import fs from 'node:fs';
import path from 'node:path';

export class PatchError extends Error {}

export function count(str, find) {
    if (find instanceof RegExp) {
        const flags = find.flags.includes('g') ? find.flags : find.flags + 'g';
        return (str.match(new RegExp(find.source, flags)) || []).length;
    }
    let n = 0;
    let i = 0;
    while ((i = str.indexOf(find, i)) !== -1) {
        n++;
        i += find.length;
    }
    return n;
}

export function listFilesAbs(dir, base = dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listFilesAbs(p, base));
        else out.push(path.relative(base, p).split(path.sep).join('/'));
    }
    return out;
}

export function copyTreeAbs(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name);
        const d = path.join(dst, e.name);
        if (e.isDirectory()) copyTreeAbs(s, d);
        else fs.copyFileSync(s, d);
    }
}

/**
 * @param {{root:string, branding:string, vendor?:string|null}} opts  root = tree shaped like /src (public/, app/src/)
 */
export function createContext({ root, branding, vendor = null }) {
    const logs = [];
    const warnings = [];
    const ctx = {
        root,
        branding,
        vendor,
        state: {}, // free-form data handed from one patch module to a later one
        logs,
        warnings,
        currentFile: '',
    };

    ctx.log = (msg) => logs.push(`${ctx.currentFile}: ${msg}`);
    ctx.warn = (msg) => warnings.push(msg);
    ctx.fail = (msg) => {
        throw new PatchError(`[${ctx.currentFile}] ${msg}`);
    };
    ctx.count = count;

    // ---- string helpers --------------------------------------------------------------------------------

    /** Replace `find` (string or regex) by `repl` (string or fn); the match count must equal `expect` (default 1). */
    ctx.replaceN = (str, find, repl, label, expect = 1) => {
        const n = count(str, find);
        if (n !== expect) {
            ctx.fail(
                `anchor mismatch for "${label}": expected ${expect} match(es), found ${n}. ` +
                    `Upstream changed? Pattern: ${find instanceof RegExp ? find : JSON.stringify(find)}`
            );
        }
        ctx.log(`${label}${expect > 1 ? ` (x${n})` : ''}`);
        if (find instanceof RegExp) {
            const flags = find.flags.includes('g') ? find.flags : find.flags + 'g';
            return str.replace(new RegExp(find.source, flags), typeof repl === 'function' ? repl : () => repl);
        }
        return str.split(find).join(typeof repl === 'function' ? repl() : repl);
    };
    ctx.replaceOnce = (str, find, repl, label) => ctx.replaceN(str, find, repl, label, 1);
    /** Like replaceN, but 0 matches are fine (the element is optional in that file). */
    ctx.replaceOpt = (str, find, repl, label) => {
        const n = count(str, find);
        return n === 0 ? str : ctx.replaceN(str, find, repl, label, n);
    };

    /**
     * Remove the block starting at `startAnchor` (string or regex, must match exactly once) up to and including
     * `endAnchor` (string, first occurrence after the start). Nested same-name blocks are not handled.
     */
    ctx.removeBlock = (str, startAnchor, endAnchor, label) => {
        const n = count(str, startAnchor);
        if (n !== 1) ctx.fail(`removeBlock "${label}": start anchor matched ${n}x, expected 1`);
        const start = startAnchor instanceof RegExp ? str.search(startAnchor) : str.indexOf(startAnchor);
        const end = str.indexOf(endAnchor, start);
        if (end < 0) ctx.fail(`removeBlock "${label}": end anchor ${JSON.stringify(endAnchor)} not found`);
        ctx.log(`removed block: ${label}`);
        return str.slice(0, start) + str.slice(end + endAnchor.length);
    };

    /** Replace the inner HTML of the element carrying id="..." (non-nested same-name tags only). */
    ctx.setInner = (html, id, inner, label = `text of #${id}`) => {
        const re = new RegExp(`(<([a-zA-Z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`);
        return ctx.replaceOnce(html, re, (m, open, tag, _old, close) => `${open}${inner}${close}`, label);
    };

    /** Remove a <section id="..."> ... </section> block (sections must not be nested). */
    ctx.removeSection = (html, id) => {
        const start = html.search(new RegExp(`[ \\t]*<section id="${id}"`));
        if (start < 0) ctx.fail(`section #${id} not found (upstream changed?)`);
        const open = html.indexOf('<section', html.indexOf(`id="${id}"`) - 20);
        const end = html.indexOf('</section>', open);
        if (end < 0) ctx.fail(`section #${id} has no closing tag`);
        if (html.slice(open + 8, end).includes('<section')) ctx.fail(`section #${id} contains nested sections`);
        ctx.log(`removed section #${id}`);
        const after = end + '</section>'.length;
        return html.slice(0, start) + html.slice(after).replace(/^[ \t]*\r?\n/, '');
    };

    /** Insert `snippet` immediately before the (single) </head>. */
    ctx.injectBeforeHeadEnd = (html, snippet, label) => ctx.replaceOnce(html, '</head>', () => `${snippet}</head>`, label);

    // ---- file helpers (paths relative to ctx.root, e.g. 'public/js/client.js' or 'app/src/server.js') ----

    const abs = (rel) => path.join(root, rel);
    ctx.abs = abs;
    ctx.exists = (rel) => fs.existsSync(abs(rel));
    ctx.read = (rel) => {
        ctx.currentFile = rel;
        if (!fs.existsSync(abs(rel))) ctx.fail('file does not exist in upstream source');
        return fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts have CRLF
    };
    ctx.write = (rel, content) => {
        fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
        fs.writeFileSync(abs(rel), content);
    };
    ctx.listFiles = (rel) => listFilesAbs(abs(rel));
    ctx.copyTree = (srcAbs, dstRel) => copyTreeAbs(srcAbs, abs(dstRel));
    ctx.deleteTree = (rel) => {
        if (fs.existsSync(abs(rel))) fs.rmSync(abs(rel), { recursive: true, force: true });
    };
    ctx.remove = ctx.deleteTree;

    /** Set a (dotted) key path in a JSON file; creates intermediate objects only if `create` is true. */
    ctx.setJsonKey = (rel, keyPath, value, { create = false } = {}) => {
        const json = JSON.parse(ctx.read(rel));
        const keys = keyPath.split('.');
        let o = json;
        for (const k of keys.slice(0, -1)) {
            if (!(k in o)) {
                if (!create) ctx.fail(`setJsonKey: "${keyPath}" - missing "${k}"`);
                o[k] = {};
            }
            o = o[k];
        }
        o[keys.at(-1)] = value;
        ctx.write(rel, JSON.stringify(json, null, 2) + '\n');
        ctx.log(`json key ${keyPath} set`);
    };

    /** Read a file from the branding directory (fails if missing). */
    ctx.readBranding = (rel) => {
        const p = path.join(branding, rel);
        if (!fs.existsSync(p)) {
            ctx.currentFile = rel;
            ctx.fail(`branding file missing: ${p}`);
        }
        return fs.readFileSync(p, 'utf8');
    };

    /** Scoped file API: ctx.scope('public').read('js/client.js') -> ctx.read('public/js/client.js'). */
    ctx.scope = (prefix) => ({
        read: (r) => ctx.read(`${prefix}/${r}`),
        write: (r, c) => ctx.write(`${prefix}/${r}`, c),
        remove: (r) => ctx.remove(`${prefix}/${r}`),
        exists: (r) => ctx.exists(`${prefix}/${r}`),
        listFiles: (r = '') => ctx.listFiles(`${prefix}/${r}`),
        abs: (r = '') => abs(`${prefix}/${r}`),
    });

    return ctx;
}
