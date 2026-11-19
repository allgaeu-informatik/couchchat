// 60-backgrounds: room background presets. The 18 upstream preset images are deleted in 90-cleanup; CouchChat's own
// presets (branding/backgrounds/*.webp) are copied into the image by the Dockerfile (/src/backgrounds). Runtime directories:
//   COUCHCHAT_BACKGROUNDS_DIR        default /src/backgrounds        built-in presets (image)
//   COUCHCHAT_BACKGROUNDS_EXTRA_DIR  default /src/backgrounds-extra  optional mount, files are ADDED (extra wins on name clash)
//   server:  GET /images/room-background/manifest.json  -> JSON array of file names (union of both dirs, safe names, images only)
//            GET /images/room-background/<file>         -> the file (extra dir first, then built-in; static, cache 1 h)
//   client:  roomBackground.js loads the manifest at startup; ROOM_BG_PRESETS is filled from it (empty = no presets).
//            client.js (camera virtual background) reads the same list and waits for it.

export const name = '60-backgrounds';

export default async function (ctx) {
    // ------------------------------------------------------------------------------------------------
    // server.js: manifest route + static route (registered before the generic static handler)
    // ------------------------------------------------------------------------------------------------
    {
        const srv = ctx.scope('app/src');
        let s = srv.read('server.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `server.js: ${label}`, n));
        const anchor = '// Serve static files from root (/)\napp.use(express.static(dir.public, staticOptions));';
        const block = `// CouchChat: room backgrounds. Built-in presets live in the image (COUCHCHAT_BACKGROUNDS_DIR, default /src/backgrounds);
// an optional extra directory (COUCHCHAT_BACKGROUNDS_EXTRA_DIR, default /src/backgrounds-extra, e.g. a mounted volume with
// operator-licensed images) is ADDED to the manifest, and its files win on a name clash.
const roomBgDir = path.resolve(process.env.COUCHCHAT_BACKGROUNDS_DIR || '/src/backgrounds');
const roomBgExtraDir = path.resolve(process.env.COUCHCHAT_BACKGROUNDS_EXTRA_DIR || '/src/backgrounds-extra');
const ROOM_BG_FILE_PATTERN = /^[A-Za-z0-9._-]+\\.(?:jpe?g|png|webp)$/i;
const listRoomBgFiles = (dirPath) =>
    fs.promises
        .readdir(dirPath, { withFileTypes: true })
        .then((entries) =>
            entries.filter((e) => e.isFile() && !e.name.startsWith('.') && ROOM_BG_FILE_PATTERN.test(e.name)).map((e) => e.name)
        )
        .catch(() => []);
app.get('/images/room-background/manifest.json', async (req, res) => {
    const [builtIn, extra] = await Promise.all([listRoomBgFiles(roomBgDir), listRoomBgFiles(roomBgExtraDir)]);
    res.set('Cache-Control', 'no-cache');
    res.json([...new Set([...builtIn, ...extra])].sort());
});
app.use(
    '/images/room-background',
    (req, res, next) => (ROOM_BG_FILE_PATTERN.test(path.posix.basename(req.path)) ? next() : res.sendStatus(404)),
    express.static(roomBgExtraDir, { index: false, dotfiles: 'ignore', maxAge: '1h', fallthrough: true }),
    express.static(roomBgDir, { index: false, dotfiles: 'ignore', maxAge: '1h', fallthrough: false })
);

`;
        R(anchor, () => block + anchor, 'room background routes');
        srv.write('server.js', s);
    }

    // ------------------------------------------------------------------------------------------------
    // public/js/roomBackground.js: presets from the manifest
    // ------------------------------------------------------------------------------------------------
    {
        const pub = ctx.scope('public');
        let s = pub.read('js/roomBackground.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `roomBackground.js: ${label}`, n));

        s = ctx.removeBlock(
            s,
            'const ROOM_BG_PRESETS = [',
            '].map((name) => `../images/room-background/${name}.webp`);',
            'roomBackground.js: hardcoded ROOM_BG_PRESETS list'
        );
        R(
            '// Minimal IndexedDB blob store',
            () => `// Presets are not bundled: the server lists the files of its mounted backgrounds directory (manifest.json).
// Empty or failing manifest = no presets (uploads keep working).
const ROOM_BG_MANIFEST_URL = '../images/room-background/manifest.json';
const ROOM_BG_MANIFEST_NAME = /^[A-Za-z0-9._-]+\\.(?:jpe?g|png|webp)$/i;
let ROOM_BG_PRESETS = [];

async function loadRoomBackgroundPresets() {
    try {
        const response = await fetch(ROOM_BG_MANIFEST_URL, { credentials: 'same-origin', cache: 'no-cache' });
        if (!response.ok) return ROOM_BG_PRESETS;
        const names = await response.json();
        if (!Array.isArray(names)) return ROOM_BG_PRESETS;
        ROOM_BG_PRESETS = [...new Set(names)]
            .filter((n) => typeof n === 'string' && ROOM_BG_MANIFEST_NAME.test(n))
            .map((n) => \`../images/room-background/\${n}\`)
            .filter((url) => ROOM_BG_PRESET_PATTERN.test(url));
    } catch (error) {
        console.warn('Room background: unable to load the preset list', error);
    }
    return ROOM_BG_PRESETS;
}

function getRoomBackgroundPresets() {
    return ROOM_BG_PRESETS.slice();
}

const roomBackgroundPresetsReady = typeof fetch === 'function' ? loadRoomBackgroundPresets() : Promise.resolve([]);

// Minimal IndexedDB blob store`,
            'presets loader'
        );
        R('getPresets = () => ROOM_BG_PRESETS,', 'getPresets = getRoomBackgroundPresets,', 'default getPresets');
        R('    async init() {\n        this.bindUI();', '    async init() {\n        await roomBackgroundPresetsReady;\n        this.bindUI();', 'init waits for presets');
        pub.write('js/roomBackground.js', s);
    }

    // ------------------------------------------------------------------------------------------------
    // public/js/client.js: camera virtual background list uses the same presets
    // ------------------------------------------------------------------------------------------------
    {
        const pub = ctx.scope('public');
        let s = pub.read('js/client.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `client.js: ${label}`, n));
        R(
            "    return typeof ROOM_BG_PRESETS !== 'undefined' && Array.isArray(ROOM_BG_PRESETS) ? ROOM_BG_PRESETS : [];",
            "    return typeof getRoomBackgroundPresets === 'function' ? getRoomBackgroundPresets() : [];",
            'getCameraBackgroundPresets'
        );
        // the grids are built synchronously at startup; rebuild them once the manifest has arrived
        R(
            '    createCameraBackgroundGrid(initBackgroundImageGrid, initBackgroundImageInput);\n    updateBackgroundControls();\n}',
            `    createCameraBackgroundGrid(initBackgroundImageGrid, initBackgroundImageInput);
    updateBackgroundControls();
    if (typeof roomBackgroundPresetsReady !== 'undefined') {
        roomBackgroundPresetsReady.then(() => {
            createCameraBackgroundGrid(backgroundImageGrid, backgroundImageInput);
            createCameraBackgroundGrid(initBackgroundImageGrid, initBackgroundImageInput);
            updateBackgroundControls();
        });
    }
}`,
            'rebuild camera grids after manifest'
        );
        // a remembered preset is only valid if the (now dynamic) list contains it
        R(
            '    const saved = lsSettings.camera_background;\n    if (!saved || !useVideo',
            "    if (typeof roomBackgroundPresetsReady !== 'undefined') await roomBackgroundPresetsReady;\n    const saved = lsSettings.camera_background;\n    if (!saved || !useVideo",
            'restore waits for presets'
        );
        pub.write('js/client.js', s);
    }
}
