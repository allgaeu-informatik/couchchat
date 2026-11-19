// 50-vendor: self-host every third-party browser resource (no CDN at runtime).
//
// Input : ctx.vendor = output of scripts/vendor.mjs (/vendor/<name>/...), pinned by vendor.lock.json.
// Output: public/vendor/<name>/... plus rewritten references in public/views/*.html, public/js/*.js, public/css/*.css.
//
// Steps
//   1. copy ctx.vendor -> public/vendor (FAILS when --vendor is missing: the pages would be broken)
//   2. rewrite every CDN URL (exact quoted URL, expected file list) to ../vendor/... (HTML) or /vendor/... (JS)
//   3. runtime-only third parties that cannot be self-hosted are removed:
//        Google Translate (translate.js), Gravatar + DiceBear (client.js -> local initials avatars),
//        KLIPY attribution markup (the GIF feature itself is disabled by config)
//   4. final assertion: no banned third-party host and no external script/style/font/img/iframe remains
//      (YouTube embed = user-initiated, explicitly allow-listed below)
//
// Runs after 20-views/30-texts (so their anchors are already settled) and before 90-cleanup.

import fs from 'node:fs';

export const name = '50-vendor';

// ---------------------------------------------------------------------------------------------------------------
// CDN URL -> vendored file. `files` lists the HTML views that must contain the quoted URL exactly once.
// Paths are relative to /vendor.
// ---------------------------------------------------------------------------------------------------------------
const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/';
const ANIMATE = 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css';
const XSS = 'https://cdn.jsdelivr.net/npm/xss/dist/xss.min.js';
const AXIOS = 'https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js';
const SWAL = 'https://cdn.jsdelivr.net/npm/sweetalert2@11.4.8';
const SCROLLREVEAL = 'https://unpkg.com/scrollreveal@4.0.0/dist/scrollreveal.min.js';

const HTML_MAP = [
    // Font Awesome 6.1.1 / 6.4.2 -> one pinned release (6.4.2; minor releases only add icons)
    { url: `${FA}6.1.1/css/all.min.css`, to: 'fontawesome/css/all.min.css', files: ['client', 'landing', 'newcall'] },
    { url: `${FA}6.4.2/css/all.min.css`, to: 'fontawesome/css/all.min.css', files: ['activeRooms', 'login', 'waitingRoom'] },
    { url: ANIMATE, to: 'animate-css/animate.min.css', files: ['client', 'landing', 'login', 'newcall', 'waitingRoom'] },
    { url: XSS, to: 'xss/xss.min.js', files: ['client', 'customizeRoom', 'landing', 'login', 'newcall', 'testStunTurn', 'waitingRoom'] },
    { url: AXIOS, to: 'axios/axios.min.js', files: ['activeRooms', 'client', 'login', 'waitingRoom'] },
    { url: SWAL, to: 'sweetalert2/sweetalert2.all.js', files: ['client', 'landing', 'login', 'newcall'] },
    { url: SCROLLREVEAL, to: 'scrollreveal/scrollreveal.min.js', files: ['login', 'waitingRoom'] },
    { url: 'https://unpkg.com/animejs@3.0.1/lib/anime.min.js', to: 'animejs/anime.min.js', files: ['login'] },
    { url: 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js', to: 'qrcodejs/qrcode.min.js', files: ['customizeRoom'] },
    // client.html only
    { url: 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css', to: 'quill/quill.snow.css', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css', to: 'flatpickr/flatpickr.min.css', files: ['client'] },
    { url: 'https://npmcdn.com/flatpickr/dist/themes/airbnb.css', to: 'flatpickr/themes/airbnb.css', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/classic.min.css', to: 'pickr/themes/classic.min.css', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/monolith.min.css', to: 'pickr/themes/monolith.min.css', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/nano.min.css', to: 'pickr/themes/nano.min.css', files: ['client'] },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/atom-one-dark.min.css', to: 'highlightjs/styles/atom-one-dark.min.css', files: ['client'] },
    { url: 'https://webrtc.github.io/adapter/adapter-latest.js', to: 'webrtc-adapter/adapter.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js', to: 'marked/marked.umd.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/fabric@5.3.0-browser/dist/fabric.min.js', to: 'fabric/fabric.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js', to: 'quill/quill.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js', to: 'qrious/qrious.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/emoji-mart@latest/dist/browser.js', to: 'emoji-mart/browser.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', to: 'pdfjs/pdf.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', to: 'html2canvas/html2canvas.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/jspdf@3.0.4/dist/jspdf.umd.min.js', to: 'jspdf/jspdf.umd.min.js', files: ['client'] },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js', to: 'crypto-js/crypto-js.js', files: ['client'] },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/popper.js/2.11.8/umd/popper.min.js', to: 'popper/popper.min.js', files: ['client'] },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/tippy.js/6.3.7/tippy-bundle.umd.min.js', to: 'tippy/tippy-bundle.umd.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/flatpickr', to: 'flatpickr/flatpickr.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/pickr.min.js', to: 'pickr/pickr.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/pickr.es5.min.js', to: 'pickr/pickr.es5.min.js', files: ['client'] },
    { url: 'https://cdn.jsdelivr.net/npm/ua-parser-js@latest/dist/ua-parser.min.js', to: 'ua-parser/ua-parser.min.js', files: ['client'] },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js', to: 'highlightjs/highlight.min.js', files: ['client'] },
];

// Hosts that must not appear (outside comments) anywhere in views/js/css after patching.
const BANNED_HOSTS = [
    'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'npmcdn.com', 'webrtc.github.io/adapter',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'storage.googleapis.com', 'translate.google.com',
    'translate.googleapis.com', 'api.dicebear.com', 'gravatar.com', 'api.klipy.com', 'buttons.github.io',
    'media.giphy.com', 'ajax.googleapis.com', 'code.jquery.com', 'stackpath.bootstrapcdn.com', 'maxcdn.bootstrapcdn.com',
    'ui-avatars.com', 'api.qrserver.com', 'huggingface.co', 'cdn.jsdelivr.com',
];

// External loads that are allowed to remain (host regex, reason). Keep explicit.
const ALLOWED_LOADS = [
    [/^https:\/\/www\.youtube\.com\/embed\//, 'YouTube embed: only when a user explicitly shares a YouTube link in a room (privacy policy mentions it)'],
    [/^https:\/\/allgaeu-informatik\.de(\/|$)/, 'own homepage'],
    [/^https:\/\/couchchat\.de(\/|$)/, 'own product domain'],
];

const stripHtmlComments = (t) => t.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
const stripJsComments = (t) =>
    t
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

export default async function (ctx) {
    ctx.currentFile = 'vendor';
    if (!ctx.vendor) {
        ctx.fail('50-vendor: --vendor <dir> is required (output of scripts/vendor.mjs / Dockerfile stage "vendor"). ' +
            'Without it the pages would still load libraries from CDNs.');
    }
    if (!fs.existsSync(ctx.vendor) || !fs.readdirSync(ctx.vendor).length) ctx.fail(`50-vendor: vendor dir empty or missing: ${ctx.vendor}`);

    // 1. copy vendored files
    ctx.copyTree(ctx.vendor, 'public/vendor');
    ctx.log('vendor: copied pinned libraries to public/vendor');

    // 2a. HTML views: exact quoted URL -> ../vendor/<file>
    const perFile = new Map();
    for (const e of HTML_MAP) {
        if (!ctx.exists(`public/vendor/${e.to}`)) ctx.fail(`vendor file missing for ${e.url}: public/vendor/${e.to} (vendor.lock.json out of sync?)`);
        for (const f of e.files) {
            if (!perFile.has(f)) perFile.set(f, []);
            perFile.get(f).push(e);
        }
    }
    for (const [view, entries] of perFile) {
        const rel = `public/views/${view}.html`;
        let html = ctx.read(rel);
        for (const e of entries) {
            html = ctx.replaceOnce(html, `"${e.url}"`, `"../vendor/${e.to}"`, `vendor ${view}.html: ${e.to}`);
        }
        ctx.write(rel, html);
    }

    // 2b. mediapipe (background effects): main thread + worker get absolute /vendor URLs through the config object
    {
        const rel = 'public/js/background-effects.js';
        let js = ctx.read(rel);
        js = ctx.replaceOnce(
            js,
            /visionBundleUrl: `https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@\$\{BG_TASKS_VISION_VERSION\}\/vision_bundle\.mjs`,/,
            "visionBundleUrl: new URL('/vendor/mediapipe/vision_bundle.mjs', location.href).href,",
            'vendor bg: vision bundle'
        );
        js = ctx.replaceOnce(
            js,
            /wasmBaseUrl: `https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@\$\{BG_TASKS_VISION_VERSION\}\/wasm`,/,
            "wasmBaseUrl: new URL('/vendor/mediapipe/wasm', location.href).href,",
            'vendor bg: wasm base'
        );
        js = ctx.replaceOnce(
            js,
            "'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'",
            "new URL('/vendor/mediapipe-models/selfie_segmenter.tflite', location.href).href",
            'vendor bg: selfie model'
        );
        js = ctx.replaceOnce(
            js,
            "'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'",
            "new URL('/vendor/mediapipe-models/selfie_multiclass_256x256.tflite', location.href).href",
            'vendor bg: multiclass model'
        );
        ctx.write(rel, js);
        // the version constant must still match the pinned package
        if (!js.includes("BG_TASKS_VISION_VERSION = '1.2.0'")) ctx.fail('background-effects.js: tasks-vision version changed; update vendor.lock.json (mediapipe) and the wasm files');
    }

    // 3a. emoji-mart: ship the emoji data locally instead of fetching it from jsdelivr at runtime
    {
        const rel = 'public/js/client.js';
        let js = ctx.read(rel);
        js = ctx.replaceN(
            js,
            /(const picker\w*Options = \{\n)(\s*)(theme: 'dark',)/,
            (m, a, ind, t) => `${a}${ind}data: loadEmojiMartData,\n${ind}${t}`,
            'vendor emoji-mart: data option',
            3
        );
        js += `
/**
 * Emoji data for emoji-mart, served locally (/vendor/emoji-mart-data) so the picker never calls a CDN.
 */
async function loadEmojiMartData() {
    const res = await fetch('/vendor/emoji-mart-data/native.json');
    if (!res.ok) throw new Error('emoji data not available: ' + res.status);
    return res.json();
}
`;

        // 3b. Gravatar -> local initials avatar (no request leaves the browser, no email hash is sent anywhere)
        js = ctx.replaceOnce(
            js,
            /    const gravatarURL = `https:\/\/www\.gravatar\.com\/avatar\/\$\{hash\}\?s=\$\{avatarSize\}&d=404`;\n[\s\S]*?    return gravatarURL;\n/,
            '    // CouchChat: no Gravatar lookup (privacy); the initials avatar is generated locally\n    return genAvatarSvg(email, avatarSize);\n',
            'vendor client.js: gravatar -> local avatar'
        );

        // 3c. DiceBear random avatars -> local initials avatars generated from a random seed
        js = ctx.replaceOnce(
            js,
            /            const dicebearStyles = \[[\s\S]*?\];\n\n            for \(let i = 0; i < 6; i\+\+\) \{\n                const seed = Math\.random\(\)\.toString\(36\)\.substring\(2, 10\);\n                const style = dicebearStyles\[i % dicebearStyles\.length\];\n                const url = `https:\/\/api\.dicebear\.com\/9\.x\/\$\{style\}\/svg\?seed=\$\{encodeURIComponent\(seed\)\}`;\n/,
            '            for (let i = 0; i < 6; i++) {\n                const seed = Math.random().toString(36).substring(2, 10);\n                const url = genAvatarSvg(seed, 96); // local, no external avatar service\n',
            'vendor client.js: dicebear -> local avatars'
        );
        ctx.write(rel, js);
    }

    // 3d. Google Translate cannot be self-hosted: never load it (UI language comes from the native language files)
    {
        const rel = 'public/js/translate.js';
        let js = ctx.read(rel);
        js = ctx.replaceOnce(
            js,
            "        await loadScript('https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit');\n",
            "        // CouchChat: Google Translate is disabled (third-party script, privacy). Native language files only.\n        console.log('Google Translate is disabled in this build');\n",
            'vendor translate.js: disable google translate'
        );
        ctx.write(rel, js);
    }

    // 3e. KLIPY attribution (GIF search is disabled by config, the markup would still be a third-party link)
    {
        const rel = 'public/views/client.html';
        let html = ctx.read(rel);
        html = ctx.replaceOnce(
            html,
            /\n\s*<a\s+class="chat-gif-attribution"[\s\S]*?Powered by KLIPY<\/a\s*>/,
            '',
            'vendor client.html: remove KLIPY attribution'
        );
        ctx.write(rel, html);
    }

    // 3f. KLIPY GIF search talks to api.klipy.com directly from the browser: drop the script and hard-disable the feature.
    //     client.js already hides the GIF button when GifSearch is undefined or gifSearchConfig is null.
    {
        const rel = 'public/views/client.html';
        let html = ctx.read(rel);
        html = ctx.replaceOnce(html, '        <script defer src="../js/gifSearch.js"></script>\n', '', 'vendor client.html: remove gifSearch.js');
        ctx.write(rel, html);
        ctx.remove("public/js/gifSearch.js");
        const jr = "public/js/client.js";
        let js = ctx.read(jr);
        js = ctx.replaceOnce(
            js,
            "gifSearchConfig = config.gifSearch?.enabled && config.gifSearch?.apiKey ? config.gifSearch : null;",
            "gifSearchConfig = null; // CouchChat: KLIPY GIF search removed (third-party API)",
            "vendor client.js: disable gif search"
        );
        ctx.write(jr, js);
    }

    // 4. final assertion
    const problems = [];
    const files = ctx.listFiles('public').filter((f) => !f.startsWith('vendor/'));
    for (const f of files) {
        const isHtml = f.endsWith('.html');
        const isJs = f.endsWith('.js') || f.endsWith('.mjs');
        const isCss = f.endsWith('.css');
        if (!(isHtml || isJs || isCss) || !/^(views|js|css)\//.test(f)) continue;
        const raw = ctx.read(`public/${f}`);
        const text = isHtml ? stripHtmlComments(raw) : isCss ? raw.replace(/\/\*[\s\S]*?\*\//g, '') : stripJsComments(raw);
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            for (const h of BANNED_HOSTS) {
                if (line.includes(h)) problems.push(`${f}:${i + 1}: banned third-party host "${h}"`);
            }
        });
        // loaded external resources (HTML attributes that fetch, CSS url()/@import)
        const loads = [];
        if (isHtml) {
            for (const m of text.matchAll(/<(script|img|iframe|source|video|audio|embed|object)\b[^>]*?\b(?:src|data)="(https?:\/\/[^"]+)"/gi)) loads.push(m[2]);
            for (const m of text.matchAll(/<link\b[^>]*?\brel="(?:stylesheet|preload|modulepreload|prefetch|icon|shortcut icon|apple-touch-icon|manifest)"[^>]*?\bhref="(https?:\/\/[^"]+)"/gi)) loads.push(m[1]);
            for (const m of text.matchAll(/<link\b[^>]*?\bhref="(https?:\/\/[^"]+)"[^>]*?\brel="(?:stylesheet|preload|modulepreload|prefetch|icon)"/gi)) loads.push(m[1]);
            for (const m of text.matchAll(/\bsrcset="([^"]*https?:\/\/[^"]+)"/gi)) loads.push(m[1]);
        }
        if (isCss) {
            for (const m of text.matchAll(/(?:url\(\s*['"]?|@import\s+(?:url\(\s*)?['"])(https?:\/\/[^'")\s]+)/gi)) loads.push(m[1]);
        }
        if (isJs) {
            for (const m of text.matchAll(/(?:import\(|importScripts\(|fetch\(|new Worker\(|new Audio\(|\.src\s*=)\s*[`'"](https?:\/\/[^`'"]+)/g)) loads.push(m[1]);
            for (const m of text.matchAll(/https:\/\/www\.youtube\.com\/embed\/[^'"`\s]*/g)) loads.push(m[0]);
        }
        for (const u of loads) {
            if (!ALLOWED_LOADS.some(([re]) => re.test(u))) problems.push(`${f}: external resource still loaded: ${u}`);
        }
    }
    if (problems.length) ctx.fail(`50-vendor: third-party references remain:\n  ${problems.join('\n  ')}`);

    // every /vendor/... reference must exist
    const refs = new Set();
    for (const f of files) {
        if (!/\.(html|js|css)$/.test(f) || !/^(views|js|css)\//.test(f)) continue;
        for (const m of ctx.read(`public/${f}`).matchAll(/(?:\.\.\/|\/)vendor\/([A-Za-z0-9_.\/-]+\.(?:json|mjs|js|css|tflite|wasm)(?![A-Za-z0-9]))/g)) refs.add(m[1]);
    }
    const missing = [...refs].filter((r) => !ctx.exists(`public/vendor/${r}`));
    if (missing.length) ctx.fail(`50-vendor: referenced vendor files missing: ${missing.join(', ')}`);
    ctx.log(`vendor: ${refs.size} distinct vendor references verified, no third-party loads remain`);
}
