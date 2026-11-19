// 10-assets: copy branding assets (images, fonts, css) into public/ and replace app/src/seo.js.
// Runs FIRST so that later modules (css colour remap, prune) see the final asset set.
//
// Shares via ctx.state.brandingFiles: Set of public-relative paths copied from branding/ (e.g. 'css/couchchat.css').

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { listFilesAbs } from '../lib/helpers.mjs';

export const name = '10-assets';

export default async function (ctx) {
    const pub = ctx.scope('public');
    ctx.currentFile = 'branding';
    const copied = new Set();
    ctx.state.brandingFiles = copied;

    for (const dirName of ['images', 'fonts', 'css']) {
        const dir = path.join(ctx.branding, dirName);
        if (!fs.existsSync(dir)) {
            ctx.warn(`branding/${dirName} missing - nothing copied (upstream files remain!)`);
            continue;
        }
        for (const f of listFilesAbs(dir)) {
            if (/^(README\.md|generate\.sh)$/.test(path.basename(f))) continue;
            const dst = pub.abs(`${dirName}/${f}`);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(path.join(dir, f), dst);
            copied.add(`${dirName}/${f}`);
        }
        ctx.log(`copied branding/${dirName}/* -> public/${dirName}/`);
    }
    for (const r of ['css/couchchat.css', 'css/fonts.css']) {
        if (!pub.exists(r)) ctx.fail(`${r} missing after copy (branding/${r} required)`);
    }
    const expectedImages = ['logo.svg', 'couchchat.svg', 'couchchat-touch.png', 'favicon.png', 'favicon.ico', 'couchchat-logo.png', 'couchchat-logo.gif', 'preview.png'];
    for (const f of expectedImages) {
        if (!fs.existsSync(path.join(ctx.branding, 'images', f))) {
            ctx.warn(`branding/images/${f} missing: upstream image still shipped (couchchat.svg/couchchat-touch.png are also referenced by SITE_ICON_PATH/APPLE_TOUCH_ICON_PATH)`);
        }
    }

    // app/src/seo.js: own version, must keep the exact export names of upstream
    ctx.currentFile = 'app/src/seo.js';
    const own = path.join(ctx.branding, 'seo.js');
    if (!fs.existsSync(own)) ctx.fail(`branding/seo.js missing: ${own}`);
    const req = createRequire(import.meta.url);
    const upstreamExports = Object.keys(req(ctx.abs('app/src/seo.js'))).sort();
    const ownExports = Object.keys(req(own)).sort();
    if (JSON.stringify(upstreamExports) !== JSON.stringify(ownExports)) {
        ctx.fail(`seo.js exports differ. upstream: ${upstreamExports} / own: ${ownExports}`);
    }
    fs.copyFileSync(own, ctx.abs('app/src/seo.js'));
    ctx.log(`replaced by branding/seo.js (exports identical: ${ownExports.join(', ')})`);
}

