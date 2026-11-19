// 30-texts: user-visible texts. Language files (lang/*.json) and the JS strings that carry brand names,
// default colours (in-room dark theme) and the German fallback brand object (js/brand.js).
// Internal identifiers (mirotalk_chat_channel, storage keys, ...) are intentionally left untouched.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESCRIPTION_DE } from '../lib/brand.mjs';

const CLIENT_DE = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/client-js-de.json', import.meta.url)), 'utf8'));

const SR_DE = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/screenreader-de.json', import.meta.url)), 'utf8'));

export const name = '30-texts';

// Module-level shims bound to the ctx of the current run (patch.mjs runs one pass per process).
let ctx;
let pub;
const sub = (...a) => ctx.replaceN(...a);
const fail = (m) => ctx.fail(m);
const read = (r) => pub.read(r);
const write = (r, c) => pub.write(r, c);

export default async function (c) {
    ctx = c;
    pub = ctx.scope('public');
    const langRenames = patchLang(); // first: JS strings must match the renamed lang keys
    patchJs(langRenames);
}

// Fallback brand object of public/js/brand.js (used only if /brand cannot be fetched; the server's /brand
// response is merged over it). Replaces the upstream English/MiroTalk defaults.
const BRAND_DEFAULTS = `let brand = {
    app: {
        language: 'de',
        translationMode: 'native',
        name: 'CouchChat',
        title: 'CouchChat<br />Videochats im Browser.<br />Einfach, sicher, schnell.',
        description: '${DESCRIPTION_DE}',
        joinDescription: 'Raumname eingeben oder<br />einen neuen Raum starten.',
        joinButtonLabel: 'RAUM BEITRETEN',
        customizeRoomButtonLabel: 'RAUM ANPASSEN',
        joinLastLabel: 'Letzter Raum:',
    },
    site: {
        shortcutIcon: '../images/couchchat.svg',
        appleTouchIcon: '../images/couchchat-touch.png',
        landingTitle: 'CouchChat - Videochat im Browser',
        newCallTitle: 'CouchChat - Neuer Raum',
        newCallRoomTitle: 'Raumname wählen. <br />Link teilen. <br />Gespräch starten.',
        newCallRoomDescription: 'Jeder Raum hat eine eigene Adresse. Wählen Sie einen Raumnamen und teilen Sie den Link mit Ihren Gesprächspartnern.',
        loginTitle: 'CouchChat - Anmeldung',
        loginHeading: 'Willkommen zurück',
        loginDescription: 'Bitte melden Sie sich an, um fortzufahren.',
        loginButtonLabel: 'Anmelden',
        joinRoomTitle: 'Raumname wählen.<br />Link teilen.<br />Gespräch starten.',
        joinRoomButtonLabel: 'RAUM BEITRETEN',
        clientTitle: 'CouchChat - Videochat',
        privacyPolicyTitle: 'CouchChat - Datenschutz',
        stunTurnTitle: 'CouchChat - Verbindungstest',
        notFoundTitle: 'CouchChat - Seite nicht gefunden',
        waitingRoomTitle: 'CouchChat - Warteraum',
        waitingRoomHeading: 'Warten auf den Gastgeber ...',
        waitingRoomDescription: 'Das Meeting hat noch nicht begonnen.<br />Sie treten automatisch bei, sobald der Gastgeber den Raum öffnet.',
        waitingRoomStatus: 'Raumstatus wird geprüft ...',
        waitingRoomReady: 'Der Raum ist bereit. Beitritt läuft ...',
        waitingRoomWaiting: 'Warten auf den Start des Meetings ...',
        waitingRoomHostLink: 'Sie sind der Gastgeber?',
        waitingRoomLoginLink: 'Hier anmelden',
        waitingRoomElapsedJust: 'Gerade erst gestartet',
        waitingRoomElapsedMinutes: 'Wartezeit: {minutes}',
        waitingRoomSongUrl: '',
    },
    html: {
        topSponsors: false,
        about: false,
        features: true,
        faq: false,
        teams: false,
        tryEasier: false,
        poweredBy: false,
        sponsors: false,
        pastSponsors: false,
        advertisers: false,
        supportUs: false,
        footer: true,
        version: false,
        appSwitcher: false,
    },
    about: {
        imageUrl: '../images/mirotalk-logo.gif',
        title: 'CouchChat',
        html: '<span>&copy; 2026 Allgäu Informatik GmbH</span>',
    },
    appSwitcher: {
        domain: '',
        apps: '',
        urls: {},
        docsUrl: '',
    },
    widget: {
        enabled: false,
    },
};`;

// ---------------------------------------------------------------------------------------------------------
// JS patches (user-visible strings only; internal identifiers like mirotalk_chat_channel stay untouched)
// ---------------------------------------------------------------------------------------------------------

const DARK_THEME_REPL = [
    ["'radial-gradient(#2a2a2e, #121214)'", "'radial-gradient(#233749, #16222f)'", 4],
    ["'rgba(18, 18, 20, 0.85)'", "'rgba(22, 34, 47, 0.88)'", 1],
    ["'#333338'", "'#2b4358'", 1],
    ["'#3d3d42'", "'#35516a'", 1],
    ["'#2c2c30'", "'#233749'", 1],
    ["'#3a3a40'", "'#2f4a61'", 1],
    ["'#252528'", "'#1d2f40'", 1],
    ["'#121214'", "'#16222F'", 1],
    ["'rgba(18, 18, 20, 0.75)'", "'rgba(22, 34, 47, 0.78)'", 1],
    ["'#315bd6'", "'#006e96'", 1],
    ["'green'", "'#006e96'", 1],
];

function patchJs(langRenames) {
    // brand.js: replace the English/MiroTalk fallback defaults (the server /brand response is merged over them)
    {
        let b = read('js/brand.js');
        const start = b.indexOf('let brand = {');
        const endMarker = '\n};\n';
        const end = b.indexOf(endMarker, start);
        if (start < 0 || end < 0) fail('brand defaults object not found (upstream changed?)');
        b = b.slice(0, start) + BRAND_DEFAULTS + b.slice(end + endMarker.length - 1);
        ctx.log('replaced brand fallback defaults (German, CouchChat)');
        // widget support is removed together with widget.js
        b = sub(b, /function handleWidget\(\) \{[\s\S]*?\n\}\n/, 'function handleWidget() {\n    // widget support removed in CouchChat\n}\n', 'neutralize handleWidget');
        // The /brand response is cached per tab in sessionStorage; a fresh key avoids serving stale settings
        // (e.g. SHOW_FEATURES=false cached under the upstream key, which hid the features block).
        b = sub(b, "const brandDataKey = 'brandDataP2P';", "const brandDataKey = 'couchchatBrandData';", 'brand cache key');
        write('js/brand.js', b);
    }

    // client.js
    let j = read('js/client.js');
    j = sub(j, "'MiroTalk is updating.\\nYou may be briefly disconnected while the server restarts.\\nPlease reconnect in a moment.'",
        "'CouchChat wird aktualisiert.\\nDie Verbindung kann kurz unterbrochen werden, während der Server neu startet.\\nBitte verbinden Sie sich in einem Moment erneut.'", 'restart banner text');
    j = sub(j, "brand.app?.name || 'MiroTalk P2P'", "brand.app?.name || 'CouchChat'", 'name fallback');
    j = sub(j, '<title>MiroTalk Editor</title>', '<title>CouchChat Editor</title>', 'editor export title');
    j = sub(j, '`Join my MiroTalk P2P meeting: ${roomId}`', '`Ich lade Sie zu einem CouchChat-Meeting ein: ${roomId}`', 'invite text');
    j = sub(j, '`MiroTalk P2P meeting: ${roomId}`', '`CouchChat-Meeting: ${roomId}`', 'calendar title');
    j = sub(j, "location.hostname || 'mirotalk'", "location.hostname || 'couchchat'", 'calendar uid');
    j = sub(j, "productName: 'MiroTalk P2P'", "productName: 'CouchChat'", 'calendar productName');
    j = sub(j, "`You're invited to a MiroTalk P2P meeting.`", '`Sie sind zu einem CouchChat-Meeting eingeladen.`', 'mail invite line');
    j = sub(j, '`Please join our MiroTalk P2P Video Chat Meeting`', '`Bitte nehmen Sie an unserem CouchChat-Meeting teil`', 'mail subject');
    j = sub(j, /'WebRTC P2P v\d+(?:\.\d+)*'/, "'CouchChat'", 'about title fallback (version independent)');
    j = sub(j, `text: 'You can optionally rate your MiroTalk experience before you go.'`,
        `text: '${langRenames.rate.newKey}'`, 'feedback text (matches lang key)');
    // in-room default dark theme: navy surfaces + petrol accents
    {
        const startMarker = 'let themeMap = {\n    dark: {';
        const s = j.indexOf(startMarker);
        if (s < 0) fail('themeMap.dark anchor not found');
        const e = j.indexOf('\n    },', s);
        if (e < 0) fail('themeMap.dark end not found');
        let block = j.slice(s, e);
        for (const [from, to, n] of DARK_THEME_REPL) block = sub(block, from, to, `dark theme ${from}`, n);
        j = j.slice(0, s) + block + j.slice(e);
    }
    j = sub(j, "'#4678f9'", "'#0a86ad'", 'switch accent fallback');
    // (d) e-mail invitation: SHOW_EMAIL_INVITE only drove the settings tab; the share dialog always showed its
    // e-mail button and handleRules() forced the tab back on for presenters. Honour the flag everywhere.
    j = sub(
        j,
        '        showDenyButton: true,\n        showCancelButton: true,\n        reverseButtons: true,\n        confirmButtonText: `Copy invite`,',
        '        showDenyButton: !!buttons.settings.showTabEmailInvitation,\n        showCancelButton: true,\n        reverseButtons: true,\n        confirmButtonText: `Copy invite`,',
        'share dialog: e-mail button follows showTabEmailInvitation'
    );
    j = sub(j, '        buttons.settings.showTabEmailInvitation = true;\n', '', 'handleRules: do not force e-mail invitation on for presenters');
    j = sub(
        j,
        "        { element: tabEmailInvitation, display: buttons.settings.showTabEmailInvitation, mode: 'block' },",
        "        { element: tabEmailInvitation, display: buttons.settings.showTabEmailInvitation, mode: 'block' },\n" +
            "        { element: participantsEmailInviteBtn, display: buttons.settings.showTabEmailInvitation, mode: 'flex' },",
        'participants dropdown: hide e-mail invitation entry'
    );
    // hardcoded English messages that do not run through i18n (table: scripts/patches/data/client-js-de.json)
    for (const e of CLIENT_DE.entries) j = sub(j, e.old, e.new, `client.js text: ${e.old.slice(0, 60)}`, e.count ?? 1);
    // profile tab: raw boolean -> Ja/Nein
    j = sub(j, 'isPeerPresenter.innerText = isPresenter;', "isPeerPresenter.innerText = isPresenter ? 'Ja' : 'Nein';", 'profile: moderator Ja/Nein');
    // Pickr (theme colour picker) builds its aria-labels from I18N_DEFAULTS (English); pass German strings at the call site
    j = sub(
        j,
        '    useAsButton: true,\n',
        "    useAsButton: true,\n    i18n: {\n        'ui:dialog': 'Farbauswahl',\n        'btn:toggle': 'Farbauswahl umschalten',\n        'btn:swatch': 'Farbfeld',\n        'btn:last-color': 'Vorherige Farbe verwenden',\n        'btn:save': 'Speichern',\n        'btn:cancel': 'Abbrechen',\n        'btn:clear': 'Zurücksetzen',\n        'aria:btn:save': 'Speichern und schließen',\n        'aria:btn:cancel': 'Abbrechen und schließen',\n        'aria:btn:clear': 'Zurücksetzen und schließen',\n        'aria:input': 'Eingabefeld für die Farbe',\n        'aria:palette': 'Farbauswahlbereich',\n        'aria:hue': 'Farbtonregler',\n        'aria:opacity': 'Deckkraftregler',\n    },\n",
        'pickr: German i18n option'
    );
    j = patchRecordingNotice(j);
    j = patchEmojiPicker(j);
    write('js/client.js', j);

    // SweetAlert2 default close-button aria-label ('Close this dialog') is English; set it once on the shared mixin
    let sw = read('js/swal.js');
    sw = sub(sw, "    reverseButtons: true,\n", "    reverseButtons: true,\n    closeButtonAriaLabel: 'Dialog schließen',\n", 'swal.js: German closeButtonAriaLabel');
    write('js/swal.js', sw);

    // calendarInvite.js
    let c = read('js/calendarInvite.js');
    c = sub(c, "productName = 'MiroTalk P2P'", "productName = 'CouchChat'", 'productName default');
    c = sub(c, "createUid(domain = 'mirotalk')", "createUid(domain = 'couchchat')", 'uid domain default');
    // invite texts (.ics description / mail body / copied invite): German unit names and date format
    c = sub(c, "`${hours} ${hours === 1 ? 'hour' : 'hours'}`", "`${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`", 'duration hours (de)');
    c = sub(c, "`${rest} ${rest === 1 ? 'minute' : 'minutes'}`", "`${rest} ${rest === 1 ? 'Minute' : 'Minuten'}`", 'duration minutes (de)');
    c = sub(c, "locale = 'en-US' }", "locale = 'de-DE' }", 'meeting time locale (de)');
    c = sub(c, "' (next day)'", "' (am Folgetag)'", 'next-day hint (de)');
    write('js/calendarInvite.js', c);

    // landing.js (share button of the removed "support us" block; kept consistent anyway)
    let l = read('js/landing.js');
    l = sub(l, "title: 'MiroTalk P2P'", "title: 'CouchChat'", 'share title');
    l = sub(l, "text: 'Free, open-source WebRTC video calls in your browser. Check out MiroTalk!'",
        `text: '${langRenames.share.newKey}'`, 'share text (matches lang key)');
    write('js/landing.js', l);

    // titles of shared rooms
    let cr = read('js/customizeRoom.js');
    cr = sub(cr, "document.title || 'MiroTalk Room'", "document.title || 'CouchChat'", 'share title');
    // this page does not load i18n.js: translate its status / error messages directly
    for (const [en, de] of [
        ['`Duration ${label} must be a whole number between 0 and ${max}`', '`Die Angabe für ${label} muss eine ganze Zahl zwischen 0 und ${max} sein`'],
        ["parseDurationPart(durationHoursEl?.value, 99, 'hours')", "parseDurationPart(durationHoursEl?.value, 99, 'Stunden')"],
        ["parseDurationPart(durationMinutesEl?.value, 59, 'minutes')", "parseDurationPart(durationMinutesEl?.value, 59, 'Minuten')"],
        ["'Custom duration must be at least 1 minute'", "'Eine benutzerdefinierte Dauer muss mindestens 1 Minute betragen'"],
        ["'Room name is required'", "'Bitte geben Sie einen Raumnamen an'"],
        ["'Link copied to clipboard.'", "'Link in die Zwischenablage kopiert.'"],
        ["'Unable to copy join URL'", "'Der Beitrittslink konnte nicht kopiert werden'"],
        ["'Unable to build join URL'", "'Der Beitrittslink konnte nicht erstellt werden'"],
    ]) {
        cr = sub(cr, en, de, `customizeRoom.js text: ${en.slice(0, 50)}`);
    }
    write('js/customizeRoom.js', cr);
    let lg = read('js/login.js');
    lg = sub(lg, "title: 'MiroTalk Room'", "title: 'CouchChat'", 'share title');
    write('js/login.js', lg);

    // room background list: drop the upstream-branded background
    let rb = read('js/roomBackground.js');
    rb = sub(rb, /\n\s*'mirotalk',(?=\n\]\.map)/, '', 'drop MiroTalk room background');
    write('js/roomBackground.js', rb);
    pub.remove('images/room-background/mirotalk.webp');

    patchOtherJs();
}

// English literals in the smaller scripts. [old, new, count=1]; every anchor must match exactly `count` times.
const OTHER_JS_DE = {
    'js/geoLocation.js': [
        ['title: \'Geo Location\',', 'title: \'Standort\',', 2],
        ['`Would you like to share your location to ${from_peer_name}?`', '`Möchten Sie Ihren Standort mit ${from_peer_name} teilen?`'],
        ['`Would you like to open ${peer_name} geolocation?`', '`Möchten Sie den Standort von ${peer_name} öffnen?`'],
        ["'Geolocation',\n            'Geolocation requested. Please wait for confirmation...',", "'Standort',\n            'Standortanfrage gesendet. Bitte warten Sie auf die Bestätigung ...',"],
        ["'User denied the request for Geolocation'", "'Die Standortfreigabe wurde abgelehnt'"],
        ["'Location information is unavailable'", "'Standortinformationen sind nicht verfügbar'"],
        ["'The request to get user location timed out'", "'Die Standortabfrage hat zu lange gedauert (Zeitüberschreitung)'"],
        ["'An unknown error occurred while retrieving your location'", "'Beim Ermitteln des Standorts ist ein unbekannter Fehler aufgetreten'"],
        ["'Geolocation is not supported by this browser'", "'Dieser Browser unterstützt keine Standortermittlung'"],
        [
            "'Unable to retrieve your location. Please ensure location services are enabled in your device and browser settings, and try again'",
            "'Der Standort konnte nicht ermittelt werden. Bitte stellen Sie sicher, dass die Ortungsdienste in den Geräte- und Browsereinstellungen aktiviert sind, und versuchen Sie es erneut'",
        ],
        ["geoError.startsWith('Unable to retrieve')", "geoError.startsWith('Der Standort konnte nicht ermittelt werden')"],
        [
            "' If the problem persists, check your device and browser location permissions, and ensure you have a clear view of the sky (for GPS)'",
            "' Besteht das Problem weiterhin, prüfen Sie die Standortberechtigungen von Gerät und Browser und sorgen Sie für freie Sicht zum Himmel (für GPS)'",
        ],
        ['`${this.peer_name}: Has declined permission for geolocation`', '`${this.peer_name}: Hat die Standortfreigabe abgelehnt`'],
    ],
    'js/common.js': [
        [String.raw`'Room name empty!\nPlease pick a room name.'`, String.raw`'Raumname fehlt!\nBitte wählen Sie einen Raumnamen.'`],
        [String.raw`'Invalid Room name!\nPath traversal pattern detected!'`, String.raw`'Ungültiger Raumname!\nUnzulässiges Pfadmuster erkannt.'`],
    ],
    'js/editor.js': [["placeholder: 'Write something together...'", "placeholder: 'Gemeinsam etwas schreiben ...'"]],
    'js/networkStats.js': [
        ["label: 'Excellent'", "label: 'Ausgezeichnet'", 2],
        ["label: 'Good'", "label: 'Gut'", 2],
        ["label: 'Fair'", "label: 'Mittel'", 2],
        ["label: 'Poor'", "label: 'Schlecht'", 2],
    ],
    'js/speechRecognition.js': [
        // German is the default recognition language (the voice commands follow it); upstream preselects English
        ['    recognitionDialect.selectedIndex = 6;\n', "    recognitionDialect.selectedIndex = 6;\n    setRecognitionDialect('de-DE');\n"],
    ],
    'js/videoDrawing.js': [["'Screen annotation canvas'", "'Zeichenfläche für Bildschirmanmerkungen'"]],
    'js/voiceCommands.js': [['`Voice commands language: ${', '`Sprache der Sprachbefehle: ${']],
    'js/activeRooms.js': [
        ["'1 room' : `${rooms.length} rooms`", "'1 Raum' : `${rooms.length} Räume`"],
        ['Loading rooms...', 'Räume werden geladen ...'],
        ["'Failed to fetch active rooms'", "'Die aktiven Räume konnten nicht geladen werden'"],
        ['No active rooms found.', 'Keine aktiven Räume gefunden.'],
        ["${peers === 1 ? 'peer' : 'peers'} connected", "${peers === 1 ? 'Person' : 'Personen'} verbunden"],
        ['</i> Join\n', '</i> Beitreten\n'],
    ],
};

function patchOtherJs() {
    for (const [rel, entries] of Object.entries(OTHER_JS_DE)) {
        let s = read(rel);
        for (const [old, nw, count = 1] of entries) s = sub(s, old, nw, `${rel}: ${old.slice(0, 50)}`, count);
        write(rel, s);
    }

    patchScreenReader();

    // common.js: dead "18+" link handler that opens an adult website (its trigger element does not exist in our views)
    {
        let s = read('js/common.js');
        s = sub(s, /if \(adultCnt\) \{\n    adultCnt\.onclick = \(e\) => \{\n        adultContent\(\);\n    \};\n\}\n\n/, '', 'common.js: remove adultCnt handler');
        s = sub(s, /function adultContent\(\) \{[\s\S]*?\n\}\n\n/, '', 'common.js: remove adultContent()');
        if (s.includes('luvlounge')) fail('common.js: adult link still present');
        write('js/common.js', s);
    }

    // testStunTurn.js: German texts, and test ONLY the configured servers (no Google STUN / metered.ca fallback,
    // no hardcoded credentials). The page has no server-side ICE endpoint; servers come from ?iceServers=<json>
    // (e.g. /icetest?iceServers=[{"urls":"stun:stun.example.org:3478"}]). Without them a German hint is shown.
    {
        let s = read('js/testStunTurn.js');
        s = sub(
            s,
            /let iceServers = filterXSS\(qs\.get\('iceServers'\)\);\n\nif \(iceServers\) \{\n    iceServers = JSON\.parse\(iceServers\);\n\} else \{[\s\S]*?\n    \];\n\}\n/,
            `let iceServers = [];
const iceParam = filterXSS(qs.get('iceServers'));
if (iceParam) {
    try {
        const parsed = JSON.parse(iceParam);
        if (Array.isArray(parsed)) iceServers = parsed;
    } catch (err) {
        console.error('Invalid iceServers parameter', err);
        Err.innerText = '⚠️ Der Parameter iceServers ist kein gültiges JSON.';
    }
}
`,
            'testStunTurn.js: only configured ICE servers'
        );
        s = sub(
            s,
            "// Test the connections\nconst pc = new RTCPeerConnection({\n    iceServers,\n});\n",
            `if (!iceServers.length) {
    Ice.innerText = '[]';
    Stun.innerText = 'Kein STUN/TURN-Server konfiguriert';
    Turn.innerText = '';
} else {
    runIceTest();
}

function runIceTest() {
// Test the connections
const pc = new RTCPeerConnection({
    iceServers,
});
`,
            'testStunTurn.js: wrap test in runIceTest'
        );
        s = sub(s, "'🟢 Your Public IP Address is '", "'🟢 Ihre öffentliche IP-Adresse lautet '", 'testStunTurn.js: IP text');
        s = sub(s, "'🟢 The STUN server is reachable!'", "'🟢 Der STUN-Server ist erreichbar!'", 'testStunTurn.js: STUN ok');
        s = sub(s, "'🟢 The TURN server is reachable!'", "'🟢 Der TURN-Server ist erreichbar!'", 'testStunTurn.js: TURN ok');
        s = sub(s, "pc.createOffer().then((offer) => pc.setLocalDescription(offer));\n", "pc.createOffer().then((offer) => pc.setLocalDescription(offer));\n}\n", 'testStunTurn.js: close runIceTest');
        write('js/testStunTurn.js', s);
    }
}

function findKey(json, key) {
    const hits = [];
    for (const [section, entries] of Object.entries(json)) {
        if (entries && typeof entries === 'object' && Object.prototype.hasOwnProperty.call(entries, key)) hits.push(section);
    }
    return hits;
}

function patchLang() {
    const de = JSON.parse(ctx.readBranding('lang/de.overrides.json'));
    const en = JSON.parse(ctx.readBranding('lang/en.overrides.json'));
    const files = pub.listFiles('lang').filter((f) => f.endsWith('.json'));
    for (const f of files) {
        const code = f.replace(/\.json$/, '');
        const rel = `lang/${f}`;
        let raw = read(rel);
        const json = JSON.parse(raw);
        const ov = code === 'de' ? de : code === 'en' ? en : de; // other languages: derived from the de definition
        for (const key of ov.remove) {
            const sections = findKey(json, key);
            if (sections.length !== 1) fail(`key to remove not found exactly once: "${key}" (found in ${sections.length} sections)`);
            delete json[sections[0]][key];
        }
        for (const r of ov.replace) {
            const sections = findKey(json, r.key);
            if (sections.length !== 1) fail(`key to replace not found exactly once: "${r.key}" (found in ${sections.length} sections)`);
            const sec = sections[0];
            const oldVal = json[sec][r.key];
            const rebuilt = {};
            let placed = false;
            for (const [k, v] of Object.entries(json[sec])) {
                if (k === r.key) {
                    let value;
                    if (code === 'de' || code === 'en') value = r.value;
                    else if (r.others === 'drop') value = null;
                    else {
                        if (!/MiroTalk/.test(oldVal)) fail(`value of "${r.key}" has no "MiroTalk" to substitute`);
                        value = oldVal.replace(/MiroTalk(?: P2P)?/g, 'CouchChat');
                    }
                    if (value !== null) rebuilt[r.newKey] = value;
                    placed = true;
                } else rebuilt[k] = v;
            }
            if (!placed) fail(`internal: key vanished "${r.key}"`);
            json[sec] = rebuilt;
        }
        if (code === 'de') {
            for (const t of ov.translate || []) {
                const sec = json[t.section];
                if (!sec || !Object.prototype.hasOwnProperty.call(sec, t.key)) fail(`translate: key not found in section "${t.section}": "${t.key}"`);
                sec[t.key] = t.value;
            }
        }
        write(rel, JSON.stringify(json, null, 4) + '\n');
    }
    ctx.log(`lang/*.json (${files.length} files): removed 3 sponsor/GitHub keys, replaced 2 MiroTalk keys (de/en from branding/lang/*.overrides.json, other languages derived)`);
    pub.remove('lang/README.md');
    return {
        share: de.replace.find((r) => r.key.startsWith('Free, open-source')),
        rate: de.replace.find((r) => r.key.startsWith('You can optionally rate')),
    };
}

// ---------------------------------------------------------------------------------------------------------
// Recording notice (consent), emoji picker locale, screen reader announcements
// ---------------------------------------------------------------------------------------------------------

// Upstream notifyRecording() hands the chat message to handleDataChannelChat() without the sender's peer id,
// which makes that function return immediately, and shows its toast only when "show chat on message" is off
// (default: on). Result: other participants never saw the recording notice. The replacement always shows a
// toast (also for late joiners: loadRemoteMediaStream() calls it with 'Started') and a chat message.
const NOTIFY_RECORDING_DE = `function notifyRecording(fromId, from, fromAvatar, action) {
    // CouchChat: the notice is always shown (toast) and logged in the chat; the consent hint is part of the text
    const recStopped = action === 'Stop';
    const who = from || 'Teilnehmer';
    const msg = recStopped
        ? '⚪ ' + who + ' hat die Aufzeichnung beendet.'
        : '🔴 ' + who + ' hat die Aufzeichnung gestartet. Mit Ihrer Anwesenheit stimmen Sie der Aufzeichnung zu.';
    try {
        handleDataChannelChat(
            {
                from: from,
                fromAvatar: fromAvatar,
                fromId: fromId,
                to: myPeerName,
                msg: msg,
                privateMsg: false,
            },
            fromId
        );
    } catch (err) {
        console.warn('Recording notice (chat) failed', err);
    }
    showSwalToast(
        {
            background: swBg,
            position: 'top-end',
            icon: recStopped ? 'info' : 'warning',
            timer: recStopped ? 6000 : 12000,
            html: '<span>' + filterXSS(msg) + '</span>',
        },
        { immediate: true }
    );
    screenReaderAccessibility.announceMessage(msg, 'assertive');
}
`;

function patchRecordingNotice(j) {
    return sub(j, /function notifyRecording\(fromId, from, fromAvatar, action\) \{[\s\S]*?\n\}\n/, () => NOTIFY_RECORDING_DE, 'notifyRecording: always notify (toast + chat)');
}

// emoji-mart 5.x ships locale data only as separate files; the German UI strings are inlined here.
// 'i18n' is inserted AFTER "theme: 'dark'," because 50-vendor.mjs anchors on "theme: 'dark'," directly after the brace.
const EMOJI_I18N_FN = `
/**
 * German UI strings for emoji-mart (i18n option); the emoji names used for search stay English.
 */
function emojiMartI18nDe() {
    return {
        search: 'Suchen',
        search_no_results_1: 'Keine Treffer',
        search_no_results_2: 'Dieses Emoji wurde nicht gefunden',
        pick: 'Emoji auswählen …',
        add_custom: 'Eigenes Emoji hinzufügen',
        categories: {
            activity: 'Aktivitäten',
            custom: 'Eigene',
            flags: 'Flaggen',
            foods: 'Essen & Trinken',
            frequent: 'Häufig verwendet',
            nature: 'Tiere & Natur',
            objects: 'Objekte',
            people: 'Smileys & Personen',
            places: 'Reisen & Orte',
            search: 'Suchergebnisse',
            symbols: 'Symbole',
        },
        skins: {
            choose: 'Standard-Hautton wählen',
            1: 'Standard',
            2: 'Hell',
            3: 'Mittelhell',
            4: 'Mittel',
            5: 'Mitteldunkel',
            6: 'Dunkel',
        },
    };
}
`;

function patchEmojiPicker(j) {
    j = sub(j, /(const picker\w*Options = \{\n(\s*)theme: 'dark',)/g, (m, a, ind) => `${a}\n${ind}i18n: emojiMartI18nDe(),`, 'emoji-mart: German i18n option', 3);
    return j + EMOJI_I18N_FN;
}

// Screen reader live region: translate announcements through a table (exact strings + name patterns).
function patchScreenReader() {
    let s = read('js/screenReader.js');
    s = sub(
        s,
        "    announceMessage(message, priority = 'polite') {\n",
        "    announceMessage(message, priority = 'polite') {\n        message = translateAnnouncementDe(message);\n",
        'screenReader.js: translate announcements'
    );
    s += `
// CouchChat: German announcements (table from scripts/patches/data/screenreader-de.json)
const ANNOUNCEMENTS_DE = ${JSON.stringify(SR_DE.exact)};
const ANNOUNCEMENT_PATTERNS_DE = ${JSON.stringify(SR_DE.patterns)};

function translateAnnouncementDe(message) {
    if (typeof message !== 'string') return message;
    if (Object.prototype.hasOwnProperty.call(ANNOUNCEMENTS_DE, message)) return ANNOUNCEMENTS_DE[message];
    for (const [pattern, replacement] of ANNOUNCEMENT_PATTERNS_DE) {
        const re = new RegExp(pattern);
        if (re.test(message)) return message.replace(re, replacement);
    }
    return message;
}
`;
    write('js/screenReader.js', s);
}
