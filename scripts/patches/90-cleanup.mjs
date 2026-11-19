// 90-cleanup: delete upstream files that only the removed landing sections / widgets / telemetry used.
// Runs LAST so that the reference corpus (everything that still mentions a file name) reflects all other patches.
// Files are deleted only if nothing in the patched public tree still references them; otherwise they are kept
// and listed in the log.

import fs from 'node:fs';

export const name = '90-cleanup';

function textCorpus(pub) {
    let corpus = '';
    for (const f of pub.listFiles()) {
        if (!/\.(html|js|css|json|svg)$/.test(f)) continue;
        if (/^(images)\//.test(f) && !f.endsWith('.svg')) continue;
        let t = fs.readFileSync(pub.abs(f), 'utf8');
        if (f.endsWith('.css')) t = t.replace(/\/\*[\s\S]*?\*\//g, '');
        if (f.endsWith('.html')) t = t.replace(/<!--[\s\S]*?-->/g, '');
        corpus += `\n${t}`;
    }
    return corpus;
}

export default async function (ctx) {
    const pub = ctx.scope('public');
    ctx.currentFile = 'prune';
    const unusedJs = ['js/widget.js', 'js/appSwitcher.js', 'js/stats.js', 'js/iframe.js'];
    for (const f of unusedJs) pub.remove(f);
    pub.remove('css/widgets');
    const candidates = [
        'images/sponsors', 'images/advertisers', 'images/miroslav-pejic.png', 'images/github.png', 'images/header.png',
        'images/mirotalk-github.gif', 'images/mirotalk-header.gif', 'images/mirotalk-header.png', 'images/mirotalk-hetzner-qr.png',
        'images/mirotalk-railway-qr.png', 'images/mirotalk.png', 'images/mirotalk-icon.png', 'images/p2p-icon.png',
        'images/AGPLv3.png', 'images/docker.png', 'images/k8s.png', 'images/nginx.png', 'images/ngrok.png',
        'images/nodejs.png', 'images/pm2.png', 'images/browsers.png', 'images/self-hosting.png', 'images/youtube.png',
        'images/webrtc.png', 'images/chatgpt.png', 'images/illustration-section-01.svg', 'images/about.jpg',
        'images/feature-tile-icon-01.svg', 'images/feature-tile-icon-02.svg', 'images/feature-tile-icon-03.svg',
        'images/feature-tile-icon-04.svg', 'images/feature-tile-icon-05.svg', 'images/feature-tile-icon-06.svg',
        'images/image-placeholder.png',
        // upstream logos (renamed to couchchat-logo.* in branding/images; every reference is rewritten in 40-server)
        'images/mirotalk-logo.png', 'images/mirotalk-logo.gif',
        // sponsor / advertiser logos (public root), unused brand art, illustrations of the removed landing blocks
        'sponsors', 'advertisers', 'images/mirotalk-mc.png', 'images/stun-turn.png', 'images/cam-mic-off.png', 'images/image-placeholder.svg',
        ...['accessControl', 'api', 'audioStreaming', 'breakoutRooms', 'chatgpt', 'fileSharing', 'integrations', 'interactiveWhitboard',
            'liveCaptions', 'livePolls', 'maximumSecurity', 'noiseSuppression', 'recordingMeeting', 'screenSharing', 'sharedEditor',
            'totalPrivacy', 'virtualBackground', 'webcamChat', 'webcamStreaming'].map((n) => `svg/${n}.svg`),
    ];
    // Room background presets: upstream's 18 images (copyright unclear) are removed completely. CouchChat's own presets
    // are copied in by the Dockerfile into /src/backgrounds (outside public/) and served by 60-backgrounds.
    {
        const dir = 'images/room-background';
        if (!pub.exists(dir)) ctx.fail(dir + ' missing (upstream changed? 60-backgrounds assumes it existed)');
        const files = pub.listFiles(dir);
        const odd = files.filter((f) => !f.endsWith('.webp'));
        if (odd.length) ctx.fail(dir + ': unexpected non-webp files, review before deleting: ' + odd.join(', '));
        if (files.length < 1 || files.length > 18) ctx.fail(dir + ': expected 1..18 preset files, found ' + files.length);
        pub.remove(dir);
        ctx.log('prune: removed ' + files.length + ' upstream room background presets (own presets come from /src/backgrounds, see 60-backgrounds)');
    }
    // Waiting-room music: licence of waiting-music.mp3 unclear; config default is '' (off). Delete unless something
    // other than the (now empty) config default still names the file.
    {
        const mp3 = 'sounds/waiting-music.mp3';
        if (pub.exists(mp3)) {
            const corpus0 = textCorpus(pub) + textCorpus(ctx.scope('app/src'));
            if (corpus0.includes('waiting-music')) ctx.fail('waiting-music.mp3 is still referenced after patching');
            pub.remove(mp3);
            ctx.log('prune: removed ' + mp3);
        }
    }
    // Upstream example scripts / docs that are not needed at runtime (api/swagger.yaml is served at /api/v1/docs and stays;
    // ssl/key.pem + cert.pem are read at start-up and stay). package.json stays (AGPL notice).
    {
        const drop = ['app/api/README.md', 'app/api/restAPI.png', 'app/ssl/README.md', 'app/ssl/https.png'];
        for (const d of ['join', 'meeting', 'meetings', 'stats', 'token']) drop.push('app/api/' + d);
        let n = 0;
        for (const rel of drop) {
            if (!ctx.exists(rel)) ctx.fail(rel + ' missing (upstream changed?)');
            ctx.remove(rel);
            n++;
        }
        ctx.log('prune: removed ' + n + ' upstream API example scripts / READMEs under app/api and app/ssl');
    }
    const corpus = textCorpus(pub) + textCorpus(ctx.scope('app/src'));
    let removed = 0;
    const kept = [];
    for (const rel of candidates) {
        if (!pub.exists(rel)) continue;
        const isDir = fs.statSync(pub.abs(rel)).isDirectory();
        const names = isDir ? [`${rel.replace(/^images\//, '')}/`] : [rel.split('/').pop()];
        if (names.some((n) => corpus.includes(n))) {
            kept.push(rel);
            continue;
        }
        pub.remove(rel);
        removed++;
    }
    ctx.log(`prune: removed ${unusedJs.length} unused scripts, css/widgets and ${removed} unreferenced upstream images`);
    if (kept.length) ctx.log(`prune: kept (still referenced): ${kept.join(', ')}`);
}
