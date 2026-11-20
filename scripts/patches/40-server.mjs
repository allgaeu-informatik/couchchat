// 40-server: patches of the upstream server code (app/src, app/api, and the .env shipped in the image).
//
// Scope: everything user-visible that the server sends to clients or that would leave the installation:
//   - telemetry (/stats payload and stats defaults), redirects (/about), restart banner,
//   - config.js defaults (brand strings, OG data, UI language/translation mode, about block),
//   - htmlInjector fallbacks, admin mail subject/body, API docs title,
//   - Jitsi-like host protection: landing/newcall/join are always served, no standalone login page; the Socket.IO
//     'join' check stays the only gate and the client shows a waiting + host-login modal (data/client-gate.js).
// Internal identifiers (JWT label, known-default-secret deny-list, logger app name) stay untouched; they are
// allow-listed in scripts/check-branding.mjs (APP_ALLOW) with a reason.
//
// Every patch: explicit anchor + expected match count (ctx.replaceN / replaceOnce), a mismatch fails the build.
// app/src/seo.js is replaced in 10-assets.mjs, public/ is handled by 20-views / 30-texts.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const name = '40-server';

// Client-side host gate (replaces handleUnauthorized in public/js/client.js), kept as a plain JS file for readability.
const CLIENT_GATE = fs
    .readFileSync(fileURLToPath(new URL('./data/client-gate.js', import.meta.url)), 'utf8')
    .replace(/\r\n/g, '\n');

const HOME = 'https://allgaeu-informatik.de';

// German defaults (identical to couchchat.env.example, so the app is branded even if a variable is missing).
const APP_TITLE_DE = '<h1>CouchChat</h1>Videochats im Browser.<br />Einfach, sicher, schnell.';
const APP_DESC_DE =
    'CouchChat ist der Videochat der Allgäu Informatik GmbH. Meetings direkt im Browser starten, ohne Installation.';
const OG_DESC_DE =
    'Sichere Videomeetings direkt im Browser, ohne Installation. Ein Service der Allgäu Informatik GmbH.';

export default async function (ctx) {
    const srv = ctx.scope('app/src');

    // ------------------------------------------------------------------------------------------------
    // config.js
    // ------------------------------------------------------------------------------------------------
    {
        let s = srv.read('config.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `config.js: ${label}`, n));

        // Telemetry: never enabled, never an upstream URL or site id (the /stats route hands this to clients).
        R("enabled: process.env.STATS_ENABLED ? getEnvBoolean(process.env.STATS_ENABLED) : true,", 'enabled: false,', 'stats.enabled');
        R("src: process.env.STATS_SCR || 'https://stats.mirotalk.com/script.js',", "src: '',", 'stats.src');
        R("id: process.env.STATS_ID || 'c7615aa7-ceec-464a-baba-54cb605d7261',", "id: '',", 'stats.id');

        // UI language and translation mode: German, human-made files only (no third-party translation service).
        R("process.env.UI_LANGUAGE || 'en'", "process.env.UI_LANGUAGE || 'de'", 'UI_LANGUAGE default');
        R("process.env.UI_TRANSLATION_MODE || 'google'", "process.env.UI_TRANSLATION_MODE || 'native'", 'UI_TRANSLATION_MODE default');

        // Brand defaults
        R("process.env.APP_NAME || 'MiroTalk'", "process.env.APP_NAME || 'CouchChat'", 'APP_NAME');
        R("'<h1>MiroTalk</h1>Free browser based Real-time video calls.<br />Simple, Secure, Fast.'", JSON.stringify(APP_TITLE_DE).replace(/^"|"$/g, "'"), 'APP_TITLE');
        R(
            "'Start your next video call with a single click. No download, plug-in, or login is required. Just get straight to talking, messaging, and sharing your screen.'",
            `'${APP_DESC_DE}'`,
            'APP_DESCRIPTION'
        );
        R("process.env.JOIN_DESCRIPTION || 'Pick a room name.<br />How about this one?'", "process.env.JOIN_DESCRIPTION || 'Raumname eingeben oder einen neuen Raum starten und den Link teilen.'", 'JOIN_DESCRIPTION');
        R("process.env.JOIN_BUTTON_LABEL || 'JOIN ROOM'", "process.env.JOIN_BUTTON_LABEL || 'RAUM BEITRETEN'", 'JOIN_BUTTON_LABEL');
        R("process.env.CUSTOMIZE_BUTTON_LABEL || 'CUSTOMIZE ROOM'", "process.env.CUSTOMIZE_BUTTON_LABEL || 'RAUM ANPASSEN'", 'CUSTOMIZE_BUTTON_LABEL');
        R("process.env.JOIN_LAST_LABEL || 'Your recent room:'", "process.env.JOIN_LAST_LABEL || 'Letzten Raum erneut betreten'", 'JOIN_LAST_LABEL');

        // Open Graph
        R("process.env.OG_SITE_NAME || 'MiroTalk'", "process.env.OG_SITE_NAME || 'CouchChat'", 'OG_SITE_NAME');
        R("process.env.OG_TITLE || 'MiroTalk P2P - Open Source WebRTC Video Calls & Meetings'", "process.env.OG_TITLE || 'CouchChat - Videochat im Browser'", 'OG_TITLE');
        R(
            "'MiroTalk P2P is an open-source self-hosted WebRTC video calling and meeting platform. Create fast peer-to-peer video calls with screen sharing, chat, whiteboard and collaboration directly in the browser.'",
            `'${OG_DESC_DE}'`,
            'OG_DESCRIPTION'
        );
        R("process.env.OG_IMAGE_URL || 'https://p2p.mirotalk.com/images/preview.png'", "process.env.OG_IMAGE_URL || 'https://couchchat.de/images/preview.png'", 'OG_IMAGE_URL');
        R("process.env.OG_URL || 'https://p2p.mirotalk.com'", "process.env.OG_URL || 'https://couchchat.de'", 'OG_URL');

        // Page titles
        R("process.env.SITE_TITLE || 'MiroTalk P2P - Open Source WebRTC Video Calls & Meetings'", "process.env.SITE_TITLE || 'CouchChat - Videochat im Browser'", 'SITE_TITLE');
        R("process.env.NEW_CALL_TITLE || 'MiroTalk a Free Secure Video Calls, Chat & Screen Sharing.'", "process.env.NEW_CALL_TITLE || 'CouchChat - Neuer Raum'", 'NEW_CALL_TITLE');
        R("process.env.LOGIN_TITLE || 'MiroTalk - Host Protected login required.'", "process.env.LOGIN_TITLE || 'CouchChat - Anmeldung'", 'LOGIN_TITLE');
        R("process.env.CLIENT_TITLE || 'MiroTalk WebRTC Video call, Chat Room & Screen Sharing.'", "process.env.CLIENT_TITLE || 'CouchChat - Videochat'", 'CLIENT_TITLE');
        R("process.env.PRIVACY_POLICY_TITLE || 'MiroTalk - privacy and policy.'", "process.env.PRIVACY_POLICY_TITLE || 'CouchChat - Datenschutz'", 'PRIVACY_POLICY_TITLE');
        R("process.env.NOT_FOUND_TITLE || 'MiroTalk - 404 Page not found.'", "process.env.NOT_FOUND_TITLE || 'CouchChat - Seite nicht gefunden'", 'NOT_FOUND_TITLE');
        R("process.env.WHO_ARE_YOU_TITLE || 'MiroTalk - Waiting for host to start the meeting'", "process.env.WHO_ARE_YOU_TITLE || 'CouchChat - Warteraum'", 'WHO_ARE_YOU_TITLE');

        // Remaining brand texts that fell back to English: German defaults (same wording as couchchat.env.example),
        // so the image is self-contained German even with a minimal environment.
        // upstream sometimes wraps the default onto the next line, hence \s+ between || and the literal
        const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const T = (env, oldDefault, newDefault) =>
            R(new RegExp(`process\\.env\\.${env} \\|\\|\\s+${esc(oldDefault)}`), () => `process.env.${env} || ${newDefault}`, env);
        T('NEW_ROOM_TITLE', "'Pick name. <br />Share URL. <br />Start conference.'", "'Neuen Raum erstellen'");
        T(
            'NEW_ROOM_DESC',
            `"Each room has its disposable URL. Just pick a room name and share your custom URL. It's that easy."`,
            "'Wählen Sie einen Raumnamen oder lassen Sie einen zufälligen Namen erzeugen und teilen Sie den Link mit Ihren Gesprächspartnern.'"
        );
        T('LOGIN_HEADING', "'Welcome back'", "'Anmeldung'");
        T('LOGIN_DESCRIPTION', "'Enter your credentials to continue.'", "'Bitte melden Sie sich an, um einen Raum zu starten.'");
        T('LOGIN_BUTTON_LABEL', "'Login'", "'Anmelden'");
        T('JOIN_ROOM_TITLE', "'Pick name.<br />Share URL.<br />Start conference.'", "'CouchChat - Raum beitreten'");
        T('JOIN_ROOM_BUTTON_LABEL', "'JOIN ROOM'", "'Beitreten'");
        T('STUN_TURN_TITLE', "'Test Stun/Turn Servers.'", "'CouchChat - Verbindungstest'");
        T('WHO_ARE_YOU_WAITING_ROOM_HEADING', "'Waiting for host...'", "'Warteraum'");
        T(
            'WHO_ARE_YOU_WAITING_ROOM_DESCRIPTION',
            `"The meeting hasn't started yet.<br />You'll join automatically when the host opens the room."`,
            "'Bitte warten Sie, bis der Gastgeber Sie in den Raum lässt.'"
        );
        T('WHO_ARE_YOU_WAITING_ROOM_STATUS', "'Checking room status...'", "'Status'");
        T('WHO_ARE_YOU_WAITING_ROOM_READY', "'Room is ready! Joining...'", "'Der Raum ist bereit'");
        T('WHO_ARE_YOU_WAITING_ROOM_WAITING', "'Waiting for host to start the meeting...'", "'Sie warten auf Einlass'");
        T('WHO_ARE_YOU_WAITING_ROOM_HOST_LINK', "'Are you the host?'", "'Sie sind der Gastgeber?'");
        T('WHO_ARE_YOU_WAITING_ROOM_LOGIN_LINK', "'Login here'", "'Als Gastgeber anmelden'");
        T('WHO_ARE_YOU_WAITING_ROOM_ELAPSED_JUST', "'Just started waiting'", "'Gerade eben'");
        T('WHO_ARE_YOU_WAITING_ROOM_ELAPSED_MINUTES', "'Waiting for {minutes}'", "'Wartezeit: {minutes}'");
        // waiting music off by default (licence of waiting-music.mp3 unclear; the file is deleted in 90-cleanup)
        T('WHO_ARE_YOU_WAITING_ROOM_SONG_URL', "'../sounds/waiting-music.mp3'", "''");
        // about image (file renamed in branding/images)
        T('ABOUT_IMAGE_URL', "'../images/mirotalk-logo.gif'", "'../images/couchchat-logo.gif'");

        // About block (only shown with SHOW_ABOUT=true): neutral German text, no author/contact data of upstream.
        const aboutTitle = 'title: `WebRTC P2P v${packageJson.version}`,';
        const aboutBlock = /title: `WebRTC P2P v\$\{packageJson\.version\}`,\n\s*html: `[\s\S]*?`,\n(?=\s*\},\n\s*\/\/ MiroTalk apps switcher)/;
        const aboutNew =
            "title: 'CouchChat',\n" +
            '            html: `\n' +
            '                <div class="about-content">\n' +
            '                    <p class="about-description">\n' +
            '                        CouchChat ist ein Videochat-Dienst der Allgäu Informatik GmbH.\n' +
            '                    </p>\n' +
            '                    <a\n' +
            '                        class="about-primary-action"\n' +
            `                        href="\${process.env.SUPPORT_URL || '${HOME}'}"\n` +
            '                        target="_blank"\n' +
            '                        rel="noopener noreferrer"\n' +
            '                    >\n' +
            '                        <i class="fas fa-info-circle" aria-hidden="true"></i>\n' +
            "                        <span>${process.env.SUPPORT_TEXT || 'Mehr erfahren'}</span>\n" +
            '                    </a>\n' +
            '                    <footer class="about-footer">\n' +
            "                        &copy; ${new Date().getFullYear()} ${process.env.COPYRIGHT_TEXT || 'Allgäu Informatik GmbH'}\n" +
            '                    </footer>\n' +
            '                </div>\n' +
            '            `,\n';
        if (!s.includes(aboutTitle)) ctx.fail('config.js: about title anchor not found (upstream changed?)');
        R(aboutBlock, () => aboutNew, 'about block (title + html)');

        // App switcher and widget defaults (all hidden by SHOW_* flags, but never point at upstream)
        R("process.env.APP_SWITCHER_DOMAIN || 'mirotalk.com'", "process.env.APP_SWITCHER_DOMAIN || 'couchchat.de'", 'APP_SWITCHER_DOMAIN');
        R("process.env.APP_SWITCHER_DOCS_URL ?? 'https://docs.mirotalk.com/'", "process.env.APP_SWITCHER_DOCS_URL ?? ''", 'APP_SWITCHER_DOCS_URL');
        R("process.env.WIDGET_SUPPORT_POWERED_BY || 'Powered by MiroTalk'", "process.env.WIDGET_SUPPORT_POWERED_BY || 'CouchChat'", 'WIDGET_SUPPORT_POWERED_BY');

        srv.write('config.js', s);
    }

    // config.template.js is only the source of the copy that became config.js; nothing loads it at runtime.
    if (srv.exists('config.template.js')) {
        srv.remove('config.template.js');
        ctx.currentFile = 'config.template.js';
        ctx.log('removed unused app/src/config.template.js (identical source of config.js)');
    }

    // ------------------------------------------------------------------------------------------------
    // server.js
    // ------------------------------------------------------------------------------------------------
    {
        let s = srv.read('server.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `server.js: ${label}`, n));

        // Hardening / correct status codes
        R('const app = express();', "const app = express();\napp.disable('x-powered-by'); // CouchChat: no framework banner", 'x-powered-by');
        R(
            'app.use((req, res) => {\n    res.sendFile(views.notFound);\n});',
            'app.use((req, res) => {\n    res.status(404).sendFile(views.notFound);\n});',
            'soft 404 -> real 404'
        );
        R(
            "app.get('/activeRooms', OIDCAuth, (req, res) => {\n",
            "app.get('/activeRooms', OIDCAuth, (req, res) => {\n    if (!hostCfg.showActiveRooms) return res.status(404).sendFile(views.notFound); // feature off (SHOW_ACTIVE_ROOMS)\n",
            '/activeRooms gated by SHOW_ACTIVE_ROOMS'
        );

        // GET /api/v1/activeRooms: public only with SHOW_ACTIVE_ROOMS=true (upstream). Additionally usable with a valid
        // API key (header "authorization" == API_KEY_SECRET) while SHOW_ACTIVE_ROOMS=false, so the admin panel can read the
        // room list (room id + peer count, no names) over the internal network. Caddy keeps blocking /api/* publicly.
        R(
            '    if (!hostCfg.showActiveRooms) {\n        return res.status(403).json({',
            '    const apiKeyOk = new ServerApi(req.headers.host, req.headers.authorization, api_key_secret).isAuthorized();\n    if (!hostCfg.showActiveRooms && !apiKeyOk) {\n        return res.status(403).json({',
            "/api/v1/activeRooms: also with a valid API key"
        );

        // /hostIdentity: HOST_USERS logins do not lock the name (typed name wins; displayname only fills an empty name in join)
        R(
            'return res.json({ locked: true, name: String(checkXSS(hostUser.displayname)).slice(0, 254) });',
            'return res.json({ locked: false, name: null }); // CouchChat: typed name wins, displayname only as fallback in join',
            '/hostIdentity: no name lock'
        );

        // /stats and the "stats" field of the config payload: telemetry is always off, no upstream URL/id leaks.
        R('const statsData = config.stats;', 'const statsData = { enabled: false }; // CouchChat: no telemetry', 'statsData');

        // /about: upstream redirects to its documentation site
        R("res.redirect(301, 'https://docs.mirotalk.com/mirotalk-p2p/');", `res.redirect(302, '${HOME}');`, '/about redirect');

        // fallback base URL for robots.txt / sitemap.xml
        R("config.brand?.og?.url || 'https://p2p.mirotalk.com'", "config.brand?.og?.url || 'https://couchchat.de'", 'seoBaseUrl fallback');

        // fail-closed message for publicly known default credentials (the credential list itself stays)
        R(
            "'HOST_USERS contains publicly known default credentials (admin/admin, guest/guest, MiroTalk/P2P). Set your own in .env'",
            "'HOST_USERS contains publicly known default credentials. Set your own in couchchat.env'",
            'HOST_USERS warning'
        );

        // restart banner sent to connected clients (socket event serverShutdown)
        R(
            "'MiroTalk is updating. You may be briefly disconnected while the server restarts. Please reconnect in a moment.'",
            "'CouchChat wird aktualisiert. Die Verbindung kann kurz unterbrochen werden. Bitte gleich neu verbinden.'",
            'serverShutdown banner'
        );

        // API log lines ("MiroTalk get stats - Authorized", ...): 5 pairs plus one for active rooms
        R(/'MiroTalk get (stats|token|meetings|meeting|join|active rooms) - /, (m, what) => `'CouchChat get ${what} - `, 'API log lines', 11);

        // ---- Host protection, Jitsi-like (HOST_PROTECTED=true, HOST_USER_AUTH=false, OIDC off) ----------------
        // Pages stay public; the Socket.IO 'join' handler (peer_token required for a NEW room) is the only gate.
        // robots.txt / sitemap.xml: only OIDC blocks everything; /join, /login, ... stay disallowed via ROBOTS_DISALLOW.
        R(
            'const blockAll = OIDC.enabled || hostCfg.protected;',
            'const blockAll = OIDC.enabled; // CouchChat: landing page stays indexable with host protection',
            'robots blockAll'
        );
        R(
            "if (OIDC.enabled || hostCfg.protected) return res.status(404).sendFile(views.notFound);\n    res.type('application/xml')",
            "if (OIDC.enabled) return res.status(404).sendFile(views.notFound);\n    res.type('application/xml')",
            'sitemap only blocked by OIDC'
        );
        // '/' and '/newcall': always served, hostCfg.authenticated is no longer reset here
        R(
            "app.get('/', OIDCAuth, (req, res) => {\n    if (!OIDC.enabled && hostCfg.protected) {\n        hostCfg.authenticated = false;\n        res.redirect('/login');\n    } else {\n        return htmlInjector.injectHtml(views.landing, res);\n    }\n});",
            "app.get('/', OIDCAuth, (req, res) => {\n    return htmlInjector.injectHtml(views.landing, res);\n});",
            "'/' always served"
        );
        R(
            "app.get('/newcall', OIDCAuth, (req, res) => {\n    if (!OIDC.enabled && hostCfg.protected) {\n        hostCfg.authenticated = false;\n        res.redirect('/login');\n    } else {\n        htmlInjector.injectHtml(views.newCall, res);\n    }\n});",
            "app.get('/newcall', OIDCAuth, (req, res) => {\n    htmlInjector.injectHtml(views.newCall, res);\n});",
            "'/newcall' always served"
        );
        // /join/:roomId: always the client view with host protection (no waiting-room page); the socket join decides
        R(
            '    if (allowRoomAccess) {\n        htmlInjector.injectHtml(views.client, res);\n    } else if (OIDC.enabled || hostCfg.protected) {',
            '    if (allowRoomAccess || (hostCfg.protected && !OIDC.enabled)) {\n        // CouchChat: host protection is enforced in the Socket.IO join (client shows the waiting/host-login modal)\n        htmlInjector.injectHtml(views.client, res);\n    } else if (OIDC.enabled) {',
            '/join/:roomId always client view'
        );
        // /login: no standalone page; the login happens in the modal inside the room
        R(
            "app.get(['/login'], (req, res) => {\n    if (hostCfg.protected || hostCfg.user_auth) {\n        return htmlInjector.injectHtml(views.login, res);\n    }\n    res.redirect('/');\n});",
            "app.get(['/login'], (req, res) => {\n    const room = req.query.room;\n    if (typeof room === 'string' && Validate.isValidRoomName(room)) {\n        return res.redirect('/join/' + encodeURIComponent(room));\n    }\n    res.redirect('/');\n});",
            '/login redirects (no standalone page)'
        );
        R(
            "app.get('/logged', (req, res) => {\n    if (!OIDC.enabled && hostCfg.protected) {\n        const ip = getIP(req);\n        if (allowedIP(ip)) {\n            res.redirect('/');\n        } else {\n            hostCfg.authenticated = false;\n            res.redirect('/login');\n        }\n    } else {\n        res.redirect('/');\n    }\n});",
            "app.get('/logged', (req, res) => {\n    res.redirect('/');\n});",
            '/logged -> /'
        );

        // ---- /join?room=X&token=... (direct join): no login page, no 401 JSON; the modal in the room handles the login ----
        const JOIN_REDIRECT = "res.redirect(Validate.isValidRoomName(room) ? '/join/' + encodeURIComponent(room) : '/')";
        R(
            "        if (!allowRoomAccess && !token) {\n            return res.status(401).json({ message: 'Direct Room Join Unauthorized' });\n        }",
            `        if (!allowRoomAccess && !token) {\n            return ${JOIN_REDIRECT};\n        }`,
            '/join params: no token -> room redirect'
        );
        R(
            "                if (!validToken) {\n                    return res.status(401).json({ message: 'Invalid Token' });\n                }",
            `                if (!validToken) {\n                    return ${JOIN_REDIRECT};\n                }`,
            '/join params: invalid token -> room redirect'
        );
        R(
            "                return hostCfg.protected || hostCfg.user_auth\n                    ? htmlInjector.injectHtml(views.login, res)\n                    : htmlInjector.injectHtml(views.landing, res);",
            `                return ${JOIN_REDIRECT};`,
            '/join params: JWT error -> room redirect'
        );
        R(
            "            return htmlInjector.injectHtml(views.client, res);\n        } else {\n            return htmlInjector.injectHtml(views.login, res);\n        }",
            `            return htmlInjector.injectHtml(views.client, res);\n        } else {\n            return ${JOIN_REDIRECT};\n        }`,
            '/join params: not valid peer -> room redirect'
        );
        if (s.includes('views.login, res')) ctx.fail('server.js: a route still serves views.login');

        // ---- Socket.IO join: keep the typed display name; HOST_USERS displayname only as fallback for an empty name ----
        R(
            "        if (!verifiedPeerName && authenticatedHostUser?.displayname) {\n            peer_name = String(checkXSS(authenticatedHostUser.displayname)).slice(0, 254);\n            socket.verifiedPeerName = peer_name;\n            config.peer_name = peer_name;\n        }",
            "        if (!verifiedPeerName && authenticatedHostUser?.displayname) {\n            // CouchChat: a typed name wins, the configured displayname is only the fallback for an empty name\n            const typedPeerName = typeof peer_name === 'string' ? peer_name.trim() : '';\n            if (typedPeerName) {\n                peer_name = String(checkXSS(typedPeerName)).slice(0, 254);\n                config.peer_name = peer_name;\n            } else {\n                peer_name = String(checkXSS(authenticatedHostUser.displayname)).slice(0, 254);\n                socket.verifiedPeerName = peer_name;\n                config.peer_name = peer_name;\n            }\n        }",
            'join: typed name wins over HOST_USERS displayname'
        );

        srv.write('server.js', s);
    }

    // ------------------------------------------------------------------------------------------------
    // client.js: handleUnauthorized (upstream: alert + redirect to /login) becomes the waiting/host-login modal
    // ------------------------------------------------------------------------------------------------
    {
        const pubc = ctx.scope('public');
        let c = pubc.read('js/client.js');
        c = ctx.replaceN(c, /function handleUnauthorized\(\) \{[\s\S]*?\n\}\n/, () => CLIENT_GATE, 'client.js: handleUnauthorized -> host gate modal');
        if (c.includes('/login/?room=')) ctx.fail('client.js: still redirects to /login');

        // auto-join after the gate (data/client-gate.js stores name + mic/cam before the reload): feed the stored values
        // into the existing direct-join path (name param skips the prejoin dialog, audio/video params set the buttons)
        c = ctx.replaceN(
            c,
            "function getPeerName() {\n    const name = getQueryParam('name');",
            "function getPeerName() {\n    const ccAuto = ccAutoJoinTake();\n    const name = getQueryParam('name') || (ccAuto && ccAuto.name) || null;",
            'client.js: getPeerName auto-join name'
        );
        c = ctx.replaceN(
            c,
            "    let audio = getQueryParam('audio');\n    let video = getQueryParam('video');",
            "    let audio = getQueryParam('audio') || ccAutoJoinMedia('audio');\n    let video = getQueryParam('video') || ccAutoJoinMedia('video');",
            'client.js: checkPeerAudioVideo auto-join media'
        );
        // handleRoomNotAllowed: German text, drop the token, button to the start page
        c = ctx.replaceN(
            c,
            /function handleRoomNotAllowed\(\) \{[\s\S]*?\n\}\n/,
            () =>
                "function handleRoomNotAllowed() {\n    try {\n        window.sessionStorage.removeItem('peer_token');\n    } catch (e) {\n        /* storage not available */\n    }\n    playSound('alert');\n    Swal.fire({\n        allowOutsideClick: false,\n        allowEscapeKey: false,\n        background: swBg,\n        imageUrl: images.forbidden,\n        title: 'Raum nicht erlaubt',\n        text: 'Für diesen Raum fehlt Ihnen die Berechtigung.',\n        confirmButtonText: 'Zur Startseite',\n        showClass: { popup: 'animate__animated animate__fadeInDown' },\n        hideClass: { popup: 'animate__animated animate__fadeOutUp' },\n    }).then(() => {\n        openURL('/');\n    });\n}\n",
            'client.js: handleRoomNotAllowed German + token reset'
        );
        // upstream bug: emitPeerAction (one target: mute, hide video, stop screen, ...) omits peer_uuid, so the server's
        // isPeerPresenter check (name + uuid of the sender) fails and the presenter action is dropped silently
        c = ctx.replaceN(
            c,
            "        peer_name: myPeerName,\n        peer_action: peerAction,\n        extras: extras,\n        send_to_all: false,",
            "        peer_name: myPeerName,\n        peer_uuid: myPeerUUID,\n        peer_action: peerAction,\n        extras: extras,\n        send_to_all: false,",
            'client.js: emitPeerAction sends peer_uuid'
        );
        // GDPR: recording, room snapshot and transcription switched off via env (SHOW_RECORD_BUTTON, SHOW_SNAPSHOT,
        // SHOW_CAPTION_BUTTON) must stay off for presenters too. Upstream only hides the buttons and lets presenters
        // trigger them by keyboard shortcut (r / t / k) or voice command, so the flags are enforced in the functions
        // and the shortcut exemption for presenters is removed.
        c = ctx.replaceN(
            c,
            'function startStreamRecording() {\n',
            'function startStreamRecording() {\n    if (!buttons.main.showRecordStreamBtn) return;\n',
            'client.js: startStreamRecording honours SHOW_RECORD_BUTTON'
        );
        c = ctx.replaceN(
            c,
            'async function snapshotRoom() {\n',
            'async function snapshotRoom() {\n    if (!buttons.main.showSnapshotRoomBtn) return;\n',
            'client.js: snapshotRoom honours SHOW_SNAPSHOT'
        );
        // Connectivity panel: Chrome tries STUN/TURN on every local interface (Hyper-V, WSL, VPN adapters), and each failing
        // interface fires icecandidateerror. Upstream turns the dot red on every error, even after a srflx/relay candidate
        // was found, so a working STUN/TURN path shows red. Keep green once any candidate of that type arrived.
        c = ctx.replaceN(
            c,
            "        if (url.startsWith('host:')) networkHost.innerText = '🔴';\n        if (url.startsWith('stun:')) networkStun.innerText = '🔴';\n        if (url.startsWith('turn:')) networkTurn.innerText = '🔴';",
            "        const ccMarkFailed = (el) => {\n            if (el.innerText !== '🟢') el.innerText = '🔴';\n        };\n        if (url.startsWith('host:')) ccMarkFailed(networkHost);\n        if (url.startsWith('stun:')) ccMarkFailed(networkStun);\n        if (url.startsWith('turn:')) ccMarkFailed(networkTurn);",
            'client.js: connectivity panel keeps green after a successful candidate'
        );
        for (const flag of ['showRecordStreamBtn', 'showCaptionRoomBtn', 'showSnapshotRoomBtn']) {
            c = ctx.replaceN(
                c,
                `if (notPresenter && !buttons.main.${flag}) {`,
                `if (!buttons.main.${flag}) {`,
                `client.js: shortcut for ${flag} blocked for presenters too`
            );
        }
        pubc.write('js/client.js', c);
    }

    // ------------------------------------------------------------------------------------------------
    // htmlInjector.js (fallbacks if config.brand.og is incomplete)
    // ------------------------------------------------------------------------------------------------
    {
        let s = srv.read('htmlInjector.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `htmlInjector.js: ${label}`, n));
        R("this.config?.og?.url || 'https://p2p.mirotalk.com'", "this.config?.og?.url || 'https://couchchat.de'", 'og.url fallback');
        R(
            "'MiroTalk P2P is an open-source self-hosted WebRTC video calling and meeting platform. Create fast peer-to-peer video calls with screen sharing, chat, whiteboard and collaboration directly in the browser.'",
            `'${OG_DESC_DE}'`,
            'og.description fallback'
        );
        R("this.config?.og?.image || 'https://p2p.mirotalk.com/images/preview.png'", "this.config?.og?.image || 'https://couchchat.de/images/preview.png'", 'og.image fallback');
        R("this.config?.og?.siteName || 'MiroTalk'", "this.config?.og?.siteName || 'CouchChat'", 'siteName fallback', 2);
        R("this.config?.og?.title || 'MiroTalk P2P - Open Source WebRTC Video Calls & Meetings'", "this.config?.og?.title || 'CouchChat - Videochat im Browser'", 'og.title fallback');
        srv.write('htmlInjector.js', s);
    }

    // ------------------------------------------------------------------------------------------------
    // lib/nodemailer.js (admin alert mail, only active with EMAIL_ALERTS_ENABLED)
    // ------------------------------------------------------------------------------------------------
    {
        let s = srv.read('lib/nodemailer.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `nodemailer.js: ${label}`, n));
        R('`MiroTalk P2P - New user Join to Room ${room_id}`', '`CouchChat - Neuer Teilnehmer in Raum ${room_id}`', 'subject');
        R('<h1>New user join</h1>', '<h1>Neuer Teilnehmer</h1>', 'heading');
        R('<td>User</td>', '<td>Name</td>', 'row User');
        R('<td>Os</td>', '<td>Betriebssystem</td>', 'row Os');
        R('<td>Room</td>', '<td>Raum</td>', 'row Room');
        R('<td>Date, Time</td>', '<td>Datum, Uhrzeit</td>', 'row Date');
        srv.write('lib/nodemailer.js', s);
    }

    // ------------------------------------------------------------------------------------------------
    // app/api/swagger.yaml (served under /api/v1/docs; the Caddy example blocks /api/* anyway)
    // ------------------------------------------------------------------------------------------------
    {
        const rel = 'app/api/swagger.yaml';
        if (!ctx.exists(rel)) ctx.fail(`${rel} missing: the root must contain the complete upstream app/ directory`);
        let s = ctx.read(rel);
        s = ctx.replaceN(s, 'title: MiroTalk P2P API', 'title: CouchChat API', 'swagger title');
        s = ctx.replaceN(
            s,
            'description: API description for external applications that integrates with MiroTalk P2P.',
            'description: Schnittstellenbeschreibung fuer externe Anwendungen, die CouchChat anbinden.',
            'swagger description'
        );
        // example value of a request field ("default: 'mirotalk'"), harmless but visible in the docs
        s = ctx.replaceN(s, "default: 'mirotalk'", "default: 'couchchat'", 'swagger example value');
        ctx.write(rel, s);
    }

    // ------------------------------------------------------------------------------------------------
    // logo files were renamed in branding/images (mirotalk-logo.* -> couchchat-logo.*): fix every reference in public/
    // (runs after 20-views/30-texts, which still write the old name in brand.js).
    // ------------------------------------------------------------------------------------------------
    {
        const pub = ctx.scope('public');
        const LOGO = [['js/brand.js', 1], ['js/client.js', 2]];
        for (const [rel, n] of LOGO) {
            let s = pub.read(rel);
            s = ctx.replaceN(s, /mirotalk-logo\.(png|gif)/g, (m, ext) => `couchchat-logo.${ext}`, `${rel}: mirotalk-logo reference`, n);
            pub.write(rel, s);
        }
        // nothing may still point at the old names
        for (const f of pub.listFiles()) {
            if (!/\.(html|js|css|json)$/.test(f)) continue;
            if (pub.read(f).includes('mirotalk-logo')) ctx.fail(`${f}: still references mirotalk-logo.*`);
        }
        for (const f of srv.listFiles()) {
            if (!f.endsWith('.js')) continue;
            if (srv.read(f).includes('mirotalk-logo')) ctx.fail(`app/src/${f}: still references mirotalk-logo.*`);
        }
    }

    // ------------------------------------------------------------------------------------------------
    // /src/.env shipped inside the upstream image (copy of .env.template with development defaults, among them a
    // public TURN account and a publicly known OIDC session secret). dotenv never overrides real environment
    // variables, but every variable missing from couchchat.env would silently fall back to those values.
    // CouchChat is configured exclusively via the environment, so the file is replaced by an empty stub.
    // ------------------------------------------------------------------------------------------------
    ctx.currentFile = '.env';
    ctx.write(
        '.env',
        '# CouchChat: no defaults here. Configuration comes exclusively from the container environment (couchchat.env).\n'
    );
    ctx.log('replaced upstream .env (development defaults, public TURN account) by an empty stub');
}
