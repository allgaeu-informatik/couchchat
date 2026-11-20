// 20-views: HTML views (landing, newcall, login, ...), small replaced pages, brand fallback object is in 30-texts.
// Also CSS: removes external font imports and remaps hardcoded upstream blues to the petrol palette.
// Anchors are strict (expected counts); see scripts/patches/README.md.

import fs from 'node:fs';
import { DESCRIPTION_DE } from '../lib/brand.mjs';
import { translateStatic } from '../lib/translate.mjs';

export const name = '20-views';

// Module-level shims bound to the ctx of the current run (patch.mjs runs one pass per process).
let ctx;
let pub;
const sub = (...a) => ctx.replaceN(...a);
const fail = (m) => ctx.fail(m);
const read = (r) => pub.read(r);
const write = (r, c) => pub.write(r, c);
const setInner = (...a) => ctx.setInner(...a);
const removeSection = (...a) => ctx.removeSection(...a);

export default async function (c) {
    ctx = c;
    pub = ctx.scope('public');
    const footer = ctx.readBranding('partials/footer.html');
    patchViews(footer);
    patchCss();
}

const BRAND_BLOCK =
    '<div class="brand"><div class="m-0"><a href="/" class="cc-brand">' +
    '<img src="../images/logo.svg" alt="" width="32" height="32" />' +
    '<span class="cc-brand-name">CouchChat</span></a></div></div>';

const CSS_LINKS =
    '<link rel="stylesheet" href="/css/fonts.css" />\n        <link rel="stylesheet" href="/css/couchchat.css" />\n    ';

const TITLES = {
    'landing.html': 'CouchChat - Videochat im Browser',
    'newcall.html': 'CouchChat - Neuer Raum',
    'login.html': 'CouchChat - Anmeldung',
    'waitingRoom.html': 'CouchChat - Warteraum',
    'client.html': 'CouchChat - Videochat',
    'customizeRoom.html': 'CouchChat - Raum anpassen',
    'activeRooms.html': 'CouchChat - Aktive Räume',
    'testStunTurn.html': 'CouchChat - Verbindungstest',
};

// Hardcoded upstream blues / accents -> petrol palette (see Doku/branding.md). Applied to CSS (+ a few JS/SVG files).
const HEX_MAP = {
    '#4678f9': '#0a86ad',
    '#376df9': '#006e96',
    '#2a5ad6': '#0c4c66',
    '#315bd6': '#006e96',
    '#6991fa': '#56b8de',
    '#5a8aff': '#56b8de',
    '#8aa9ff': '#56b8de',
    '#d9e3ff': '#cfeaf5',
    '#eef3ff': '#eaf6fb',
    '#e5e9ff': '#dff1f8',
    '#66beff': '#56b8de',
    '#6fb4ff': '#56b8de',
    '#1d8ecd': '#006e96',
    '#3b82f6': '#0a86ad',
    '#2563eb': '#006e96',
    '#ff5fa0': '#e5a407',
    '#ffc55a': '#e5a407',
    // remaining blues in dialogs / focus rings / buttons
    '#007bff': '#0a86ad',
    '#2495ff': '#0a86ad',
    '#6ab3ff': '#56b8de',
    '#8cc8ff': '#56b8de',
    '#5aa8ff': '#56b8de',
    '#8dc8ff': '#56b8de',
    '#294da8': '#0c4c66',
    '#345dbc': '#006e96',
    '#2859dc': '#006e96',
    '#4a74f5': '#0a86ad',
    '#a8c0ff': '#56b8de',
    // share dialog highlight / file transfer accent (green upstream)
    '#59d7a5': '#56b8de',
};
// [r, g, b] -> [r, g, b]
const RGB_MAP = [
    [[70, 120, 249], [10, 134, 173]],
    [[55, 109, 249], [0, 110, 150]],
    [[59, 130, 246], [10, 134, 173]],
    [[22, 140, 255], [86, 184, 222]],
    [[111, 180, 255], [86, 184, 222]],
    [[102, 190, 255], [86, 184, 222]],
    [[90, 138, 255], [86, 184, 222]],
    [[255, 95, 160], [229, 164, 7]],
    [[255, 197, 90], [229, 164, 7]],
    [[106, 179, 255], [86, 184, 222]],
    [[102, 170, 255], [86, 184, 222]],
    [[95, 152, 255], [86, 184, 222]],
    [[53, 125, 255], [10, 134, 173]],
    [[105, 145, 250], [10, 134, 173]],
    [[8, 189, 89], [86, 184, 222]], // .share-room-modal-highlight (green upstream)
    [[89, 215, 165], [86, 184, 222]],
];
// Dark landing-page neutrals -> navy (only for the "site" stylesheets, not for the in-room client.css)
const NEUTRAL_MAP = {
    '#1d2026': '#233749',
    '#16171b': '#16222f',
    '#1c1d22': '#1b2a3d',
    '#0e0e0e': '#16222f',
    '#0d0e12': '#16222f',
    '#171717': '#1b2a3d',
    '#292b32': '#233749',
    '#959cb1': '#a9b8c6',
};
const SITE_CSS = ['landing.css', 'login.css', 'waitingRoom.css', 'customizeRoom.css', 'newcall.css', 'activeRooms.css'];

function remapColors(text, withNeutrals) {
    let n = 0;
    const hexes = withNeutrals ? { ...HEX_MAP, ...NEUTRAL_MAP } : HEX_MAP;
    text = text.replace(/#[0-9a-fA-F]{6}\b/g, (m) => {
        const to = hexes[m.toLowerCase()];
        if (!to) return m;
        n++;
        return m === m.toUpperCase() ? to.toUpperCase() : to;
    });
    for (const [from, to] of RGB_MAP) {
        const re = new RegExp(`rgba?\\(\\s*${from[0]}\\s*,\\s*${from[1]}\\s*,\\s*${from[2]}\\s*(,[^)]*)?\\)`, 'g');
        text = text.replace(re, (m, rest) => {
            n++;
            return rest ? `rgba(${to.join(', ')}${rest})` : `rgb(${to.join(', ')})`;
        });
    }
    return [text, n];
}
function commonHead(html, file, { stats = true, gh = true, gfonts = false, desc = false, themeColor = false } = {}) {
    html = sub(html, /<html\b[^>]*>/, (m) => (/\blang=/.test(m) ? m.replace(/lang="[^"]*"/, 'lang="de"') : m.replace('<html', '<html lang="de"')), 'html lang=de');
    if (stats) html = sub(html, /[ \t]*<script async src="\.\.\/js\/stats\.js"><\/script>\r?\n/, '', 'remove stats.js (telemetry)');
    if (gh) html = sub(html, /[ \t]*<script async defer src="https:\/\/buttons\.github\.io\/buttons\.js"><\/script>\r?\n/, '', 'remove buttons.github.io');
    if (gfonts) html = sub(html, /[ \t]*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*" \/>\r?\n/, '', 'remove Google Fonts link');
    if (desc) {
        html = sub(html, /(<meta\s+name="description"\s+content=")[^"]*(")/, (m, a, b) => `${a}${DESCRIPTION_DE}${b}`, 'meta description (de)');
    }
    if (themeColor) html = sub(html, /(<meta name="theme-color" content=")#[0-9a-fA-F]{6}(")/, (m, a, b) => `${a}#16222f${b}`, 'theme-color navy');
    // static icon defaults (brand.js overrides them from SITE_ICON_PATH / APPLE_TOUCH_ICON_PATH)
    html = sub(html, /(<link id="(?:shortcutIcon|icon)" rel="shortcut icon" href=")\.\.\/images\/logo\.svg(")/, (m, a, b) => `${a}../images/couchchat.svg${b}`, 'shortcut icon');
    html = sub(html, /(<link id="appleTouchIcon" rel="apple-touch-icon" href=")\.\.\/images\/logo\.svg(")/, (m, a, b) => `${a}../images/couchchat-touch.png${b}`, 'apple-touch icon');
    // title text (brand.js replaces it from env, this is the no-JS / failure fallback)
    {
        const he = html.indexOf('</head>');
        if (he < 0) fail('</head> not found');
        // only the <head> title (inline SVGs in the body may carry <title> elements, too)
        html =
            sub(html.slice(0, he), /(<title\b[^>]*>)[^<]*(<\/title>)/, (m, a, b) => `${a}${TITLES[file]}${b}`, 'title (de)') +
            html.slice(he);
    }
    // our stylesheets: LAST stylesheet in <head>
    html = sub(html, /<\/head>/, `${CSS_LINKS}</head>`, 'inject couchchat.css (last stylesheet)');
    return html;
}

function replaceBrandInHeader(html) {
    const hs = html.indexOf('<header class="site-header');
    if (hs < 0) fail('site header not found');
    const he = html.indexOf('</header>', hs);
    let header = html.slice(hs, he);
    header = sub(header, /<div class="brand">\s*<div class="m-0">[\s\S]*?<\/div>\s*<\/div>/, BRAND_BLOCK, 'header brand = logo mark + CouchChat');
    return html.slice(0, hs) + header + html.slice(he);
}

function replaceFooter(html, footer) {
    return sub(html, /<footer id="footer"[\s\S]*?<\/footer>/, footer.trim(), 'footer -> branding/partials/footer.html');
}

function localizeJoinForm(html, { landing }) {
    html = sub(html, 'Skip to main content', 'Zum Inhalt springen', 'skip link (de)');
    html = sub(html, /(<label class="form-label screen-reader" for="roomName">)Room name(<\/label>)/, (m, a, b) => `${a}Raumname${b}`, 'label roomName (de)');
    html = sub(html, 'Generate a new room name', 'Neuen Raumnamen erzeugen', 'gen room labels (de)', 2);
    html = sub(html, 'value="mirotalk"', 'value="couchchat"', 'default room name');
    html = setInner(html, 'joinRoomButton', 'Raum beitreten', 'joinRoomButton (de)');
    html = setInner(html, 'customizeRoomButton', 'Raum anpassen', 'customizeRoomButton (de)');
    html = setInner(html, 'appJoinLastRoom', 'Letzter Raum:', 'appJoinLastRoom (de)');
    html = setInner(html, 'appJoinDescription', 'Raumname eingeben oder<br />einen neuen Raum starten.', 'appJoinDescription (de)');
    if (landing) {
        html = setInner(
            html,
            'appTitle',
            'CouchChat<br />Videochats im Browser.<br />Einfach, sicher, schnell.',
            'appTitle (de)'
        );
        html = setInner(html, 'appDescription', DESCRIPTION_DE, 'appDescription (de)');
    } else {
        html = setInner(html, 'newCallRoomTitle', 'Raumname wählen.<br />Link teilen.<br />Gespräch starten.', 'newCallRoomTitle (de)');
        html = setInner(
            html,
            'newCallRoomDescription',
            'Jeder Raum hat eine eigene Adresse. Wählen Sie einen Raumnamen und teilen Sie den Link mit Ihren Gesprächspartnern.',
            'newCallRoomDescription (de)'
        );
    }
    return html;
}

const FEATURES_SECTION = `<section id="features" class="cc-features section center-content">
                    <div class="container">
                        <div class="section-header">
                            <h2 class="mt-0 mb-16">Videochat ohne Umwege</h2>
                            <p class="m-0">Raum öffnen, Link teilen, loslegen.</p>
                        </div>
                        <div class="cc-features-grid">
                            <div class="cc-feature">
                                <h3>Direkt im Browser</h3>
                                <p>Keine Installation nötig. Es genügt ein aktueller Browser auf Computer, Tablet oder Smartphone.</p>
                            </div>
                            <div class="cc-feature">
                                <h3>Einladen per Link</h3>
                                <p>Teilnehmer treten einfach über den Meeting-Link bei, direkt im Browser.</p>
                            </div>
                            <div class="cc-feature">
                                <h3>Bildschirm teilen</h3>
                                <p>Präsentieren Sie Ihren Bildschirm oder ein einzelnes Fenster, damit alle mitverfolgen können.</p>
                            </div>
                            <div class="cc-feature">
                                <h3>Chat</h3>
                                <p>Schreiben Sie parallel zum Gespräch Nachrichten und senden Sie Dateien direkt im Raum.</p>
                            </div>
                            <div class="cc-feature">
                                <h3>Whiteboard</h3>
                                <p>Skizzieren und erklären Sie gemeinsam auf einer Zeichenfläche, die alle sehen.</p>
                            </div>
                            <div class="cc-feature">
                                <h3>Verschlüsselte P2P-Verbindung</h3>
                                <p>Audio und Video werden verschlüsselt und laufen direkt zwischen den Teilnehmenden.</p>
                            </div>
                        </div>
                    </div>
                </section>`;

// Static English text of customizeRoom.html (the page does not load i18n.js). [english, german, count]
const CUSTOMIZE_ROOM_DE = [
    ['Room setup', 'Raum einrichten'],
    ['Make the room yours', 'Gestalten Sie Ihren Raum'],
    ['Choose how you enter, what starts enabled, and share one ready-to-use link.', 'Legen Sie fest, wie Sie beitreten und was beim Start aktiviert ist, und teilen Sie einen fertigen Link.'],
    ['Room details', 'Raumdetails'],
    ['Name your meeting space and choose how others see you.', 'Benennen Sie Ihren Raum und legen Sie fest, wie andere Sie sehen.'],
    ['Room name', 'Raumname'],
    ['Design sync', 'Teambesprechung'],
    ['Generate', 'Erzeugen'],
    ['Display name', 'Anzeigename'],
    ['How others see you', 'So sehen andere Sie'],
    ['Meeting defaults', 'Voreinstellungen', 2],
    ['Set what happens when you enter the room.', 'Legen Sie fest, was beim Betreten des Raums passiert.'],
    ['Microphone', 'Mikrofon'],
    ['Join with audio on', 'Mit Ton beitreten'],
    ['Camera', 'Kamera'],
    ['Join with video on', 'Mit Video beitreten'],
    ['Share screen', 'Bildschirm teilen'],
    ['Present on entry', 'Beim Beitritt präsentieren'],
    ['Open chat', 'Chat öffnen'],
    ['Show chat on entry', 'Chat beim Beitritt anzeigen'],
    ['Hide self', 'Eigenes Bild ausblenden'],
    ['Hide your video tile', 'Eigene Videokachel ausblenden'],
    ['Notify room', 'Raum benachrichtigen'],
    ['Announce shared media', 'Geteilte Medien ankündigen'],
    ['Meeting duration', 'Dauer des Meetings'],
    ['Optional', 'Optional', 2],
    ['No time limit', 'Keine Zeitbegrenzung'],
    ['15 minutes', '15 Minuten'],
    ['30 minutes', '30 Minuten'],
    ['45 minutes', '45 Minuten'],
    ['1 hour', '1 Stunde'],
    ['1 hour 30 minutes', '1 Stunde 30 Minuten'],
    ['2 hours', '2 Stunden'],
    ['3 hours', '3 Stunden'],
    ['4 hours', '4 Stunden'],
    ['8 hours', '8 Stunden'],
    ['Custom...', 'Benutzerdefiniert ...'],
    ['hours', 'Stunden'],
    ['minutes', 'Minuten'],
    ['The room closes automatically when the time runs out.', 'Der Raum schließt automatisch, sobald die Zeit abgelaufen ist.'],
    ['Noise suppression', 'Rauschunterdrückung'],
    ['Default (server setting)', 'Standard (Servereinstellung)'],
    ['On', 'Ein'],
    ['Off', 'Aus'],
    ['Initial state for participants, they can still change it.', 'Anfangszustand für Teilnehmende, sie können ihn weiterhin ändern.'],
    ['Advanced access', 'Erweiterter Zugang'],
    ['Avatar and authentication token', 'Avatar und Zugangstoken'],
    ['Avatar URL', 'Avatar-URL'],
    ['Access token', 'Zugangstoken'],
    ['Required for protected hosts', 'Für geschützte Gastgeber erforderlich'],
    ['Ready when you are', 'Bereit, wenn Sie es sind'],
    ['Your room link', 'Ihr Raumlink'],
    ['Updates as you change the settings.', 'Wird bei jeder Änderung der Einstellungen aktualisiert.'],
    ['Join link', 'Beitrittslink'],
    ['Link actions', 'Aktionen für den Link'],
    ['Copy join link', 'Beitrittslink kopieren'],
    ['Copy', 'Kopieren'],
    ['Share join link', 'Beitrittslink teilen'],
    ['Share', 'Teilen'],
    ['Join link QR code', 'QR-Code des Beitrittslinks'],
    ['Scan to open on another device.', 'Zum Öffnen auf einem anderen Gerät scannen.'],
    ['Join room', 'Raum beitreten'],
    ['Your settings are encoded in the link and are not saved here.', 'Ihre Einstellungen sind im Link enthalten und werden hier nicht gespeichert.'],
];

const LOGIN_DE = [
    ['Username', 'Benutzername'],
    ['Password', 'Passwort'],
    ['Enter room name', 'Raumnamen eingeben'],
    ['Generate random room name', 'Zufälligen Raumnamen erzeugen'],
    ['Share room link', 'Raumlink teilen'],
];

const WAITING_ROOM_DE = [
    ['Play music', 'Musik abspielen'],
    ['Mute', 'Stummschalten'],
];

const ACTIVE_ROOMS_DE = [
    ['Active Rooms', 'Aktive Räume'],
    ['0 rooms', '0 Räume'],
    ['Refresh', 'Aktualisieren'],
    ['Search rooms...', 'Räume suchen ...'],
    ['Rooms', 'Räume'],
    ['Total Peers', 'Teilnehmende gesamt'],
];

const LANDING_NAV =`<nav class="landing-nav" aria-label="Hauptnavigation">
                            <a id="navFeaturesLink" class="landing-nav-link" href="#features">Funktionen</a>
                            <a id="startMeetingLink" class="landing-nav-cta" href="#roomName">Meeting starten</a>
                        </nav>`;

function patchViews(footer) {
    // --- landing.html
    let h = read('views/landing.html');
    h = commonHead(h, 'landing.html', { desc: true, themeColor: true });
    h = sub(h, /[ \t]*<meta name="author" content="[^"]*" \/>\r?\n/, '', 'remove meta author');
    h = sub(h, 'content="en_US"', 'content="de_DE"', 'og:locale de_DE');
    h = sub(h, /[ \t]*<script id="faqJsonLd" type="application\/ld\+json">[\s\S]*?<\/script>\r?\n/, '', 'remove FAQ JSON-LD');
    h = sub(h, /[ \t]*<!-- MiroTalk P2P Widget -->\r?\n\s*<script defer src="\.\.\/js\/widget\.js"><\/script>\r?\n/, '', 'remove widget.js');
    h = sub(h, /[ \t]*<script defer src="\.\.\/js\/appSwitcher\.js"><\/script>\r?\n/, '', 'remove appSwitcher.js');
    h = replaceBrandInHeader(h);
    h = sub(h, /<nav class="landing-nav"[\s\S]*?<\/nav>/, LANDING_NAV, 'landing nav (de, no support/github/app switcher)');
    for (const id of ['topSponsors', 'about', 'teams', 'faq', 'tryEasier', 'poweredBy', 'sponsors', 'pastSponsors', 'advertisers', 'supportUs']) {
        h = removeSection(h, id);
    }
    // features: replace the (English, MiroTalk-specific) block by a short German section
    {
        const start = h.search(/<section id="features"/);
        const end = h.indexOf('</section>', start);
        if (start < 0 || end < 0) fail('section #features not found');
        if (h.slice(start + 8, end).includes('<section')) fail('section #features contains nested sections');
        h = h.slice(0, start) + FEATURES_SECTION + h.slice(end + '</section>'.length);
        ctx.log('replaced section #features by German CouchChat block');
    }
    h = localizeJoinForm(h, { landing: true });
    h = replaceFooter(h, footer);
    h = translateStatic(ctx, h, [['Back to top', 'Nach oben']], 'landing.html');
    write('views/landing.html', h);

    // --- newcall.html
    h = read('views/newcall.html');
    h = commonHead(h, 'newcall.html', { desc: true });
    h = replaceBrandInHeader(h);
    h = localizeJoinForm(h, { landing: false });
    h = replaceFooter(h, footer);
    write('views/newcall.html', h);

    // --- login.html
    h = read('views/login.html');
    h = commonHead(h, 'login.html', { desc: true, gfonts: true });
    h = replaceBrandInHeader(h);
    h = replaceFooter(h, footer);
    h = translateStatic(ctx, h, LOGIN_DE, 'login.html');
    // static fallbacks; brand.js overwrites them from /brand (env LOGIN_* / JOIN_ROOM_*)
    h = setInner(h, 'loginHeading', 'Willkommen zurück', 'loginHeading (de)');
    h = setInner(h, 'loginDescription', 'Bitte melden Sie sich an, um fortzufahren.', 'loginDescription (de)');
    h = setInner(h, 'loginButtonLabel', 'Anmelden', 'loginButtonLabel (de)');
    h = setInner(h, 'joinRoomTitle', 'Raumname wählen.<br />Link teilen.<br />Gespräch starten.', 'joinRoomTitle (de)');
    h = setInner(h, 'joinRoomButtonLabel', 'RAUM BEITRETEN', 'joinRoomButtonLabel (de)');
    write('views/login.html', h);

    // --- waitingRoom.html
    h = read('views/waitingRoom.html');
    h = commonHead(h, 'waitingRoom.html', { desc: true, gfonts: true });
    h = replaceBrandInHeader(h);
    h = replaceFooter(h, footer);
    h = translateStatic(ctx, h, WAITING_ROOM_DE, 'waitingRoom.html');
    h = setInner(h, 'waitingRoomHeading', 'Warten auf den Gastgeber ...', 'waitingRoomHeading (de)');
    h = setInner(
        h,
        'waitingRoomDescription',
        'Das Meeting hat noch nicht begonnen.<br />Sie treten automatisch bei, sobald der Gastgeber den Raum öffnet.',
        'waitingRoomDescription (de)'
    );
    h = setInner(h, 'waitingStatus', 'Raumstatus wird geprüft ...', 'waitingStatus (de)');
    h = setInner(h, 'waitingElapsedText', 'Gerade erst gestartet', 'waitingElapsedText (de)');
    h = setInner(h, 'waitingRoomHostLink', 'Sie sind der Gastgeber?', 'waitingRoomHostLink (de)');
    h = setInner(h, 'waitingRoomLoginLink', 'Hier anmelden', 'waitingRoomLoginLink (de)');
    write('views/waitingRoom.html', h);

    // --- customizeRoom.html (no site footer upstream)
    h = read('views/customizeRoom.html');
    h = commonHead(h, 'customizeRoom.html', { stats: false, gh: false, themeColor: true });
    h = sub(h, 'aria-label="MiroTalk home"', 'aria-label="CouchChat Startseite"', 'aria-label brand');
    h = sub(h, '<span id="customizeRoomBrandName">MiroTalk P2P</span>', '<span id="customizeRoomBrandName">CouchChat</span>', 'brand name');
    h = sub(h, 'Skip to main content', 'Zum Inhalt springen', 'skip link (de)');
    h = sub(h, /(<a class="cr-back" href="\/">)Back to home(<\/a>)/, (m, a, b) => `${a}Zur Startseite${b}`, 'back link (de)');
    h = translateStatic(ctx, h, CUSTOMIZE_ROOM_DE, 'customizeRoom.html');
    write('views/customizeRoom.html', h);

    // --- client.html (in-room; its <footer class="lobby-actions"> is NOT a site footer)
    h = read('views/client.html');
    h = commonHead(h, 'client.html', { gh: false, desc: true });
    h = sub(h, 'alt="mirotalk-share-send"', 'alt="Datei senden"', 'img alt share-send (de)');
    h = sub(h, 'alt="mirotalk-share-receive"', 'alt="Datei empfangen"', 'img alt share-receive (de)');
    // axios was loaded with async while client.js / common.js call it right away (race: 'axios is not defined'); defer keeps
    // document order, and the tag sits before common.js and client.js
    h = sub(h, '<script async src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>', '<script defer src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>', 'client.html: axios async -> defer');
    // Settings > Tastenkuerzel: the key-name words are plain text next to <strong>Toggle</strong>, i18n cannot translate them.
    // Rows become fully German: <strong>Object</strong> verb (infinitive).
    for (const [from, to] of [
        ['<strong>Toggle</strong> microphone', '<strong>Mikrofon</strong> umschalten'],
        ['<strong>Toggle</strong> camera', '<strong>Kamera</strong> umschalten'],
        ['<strong>Toggle</strong> screen', '<strong>Bildschirmfreigabe</strong> umschalten'],
        ['<strong>Toggle</strong> recording', '<strong>Aufzeichnung</strong> umschalten'],
        ['<strong>Snapshot</strong> screen/window/tab', '<strong>Schnappschuss</strong> von Bildschirm/Fenster/Tab'],
        ['<strong>Toggle</strong> raise hand', '<strong>Handzeichen</strong> umschalten'],
        ['<strong>Toggle</strong> chat', '<strong>Chat</strong> umschalten'],
        ['<strong>Toggle</strong> emoji', '<strong>Emoji</strong> umschalten'],
        ['<strong>Toggle</strong> captions', '<strong>Untertitel</strong> umschalten'],
        ['<strong>Toggle</strong> whiteboard', '<strong>Whiteboard</strong> umschalten'],
        ['<strong>Toggle</strong> document PIP', '<strong>Dokument-PiP</strong> umschalten'],
        ['<strong>Share</strong> the file', '<strong>Datei</strong> teilen'],
        ['<strong>Toggle</strong> settings', '<strong>Einstellungen</strong> umschalten'],
        ['<strong>Toggle</strong> hide myself', '<strong>Eigene Ansicht ausblenden</strong> umschalten'],
    ]) h = sub(h, from, to, `client.html hotkey row: ${from}`);
    // Static English alt/aria/noscript/banner text that i18n does not reach (alt is not an i18n attribute).
    h = sub(h, 'alt="Empty chat illustration"', 'alt="Leerer Chat (Illustration)"', 'client.html alt empty chat');
    h = sub(h, 'alt="Empty participants illustration"', 'alt="Keine Teilnehmenden (Illustration)"', 'client.html alt empty participants');
    h = sub(h, 'alt="Empty caption illustration"', 'alt="Keine Untertitel (Illustration)"', 'client.html alt empty caption');
    h = sub(h, 'aria-label="Search GIFs"', 'aria-label="GIFs suchen"', 'client.html aria Search GIFs');
    h = sub(h, 'aria-label="Select microphone"', 'aria-label="Mikrofon auswählen"', 'client.html aria Select microphone', 2);
    h = sub(h, '<noscript>You need to enable JavaScript to run this app.</noscript>', '<noscript>Zum Ausführen dieser Anwendung muss JavaScript aktiviert sein.</noscript>', 'client.html noscript');
    h = sub(h, '<span id="disconnectBannerMsg">Reconnecting to signaling server&hellip;</span>', '<span id="disconnectBannerMsg">Verbindung zum Server wird wiederhergestellt&hellip;</span>', 'client.html disconnect banner text');
    // Profile tab: boolean shown as Ja/Nein
    h = sub(h, '<p id="isPeerPresenter">true</p>', '<p id="isPeerPresenter">Ja</p>', 'client.html profile moderator default');
    // Appearance tab: theme cards and custom theme colour would override the CouchChat brand theme, so both fields are
    // hidden (client.js pins the theme, see 40-server). The room background field below stays.
    h = sub(
        h,
        '<div class="settings-field">\n                            <div class="title">\n                                <i class="fa-solid fa-palette"></i>',
        '<div class="settings-field hidden">\n                            <div class="title">\n                                <i class="fa-solid fa-palette"></i>',
        'client.html: hide theme picker'
    );
    h = sub(
        h,
        '<div class="settings-field">\n                            <div class="title">\n                                <i class="fas fa-fill-drip"></i>',
        '<div class="settings-field hidden">\n                            <div class="title">\n                                <i class="fas fa-fill-drip"></i>',
        'client.html: hide custom theme colour'
    );
    write('views/client.html', h);

    // --- activeRooms.html
    h = read('views/activeRooms.html');
    h = commonHead(h, 'activeRooms.html', { stats: false, gh: false });
    h = translateStatic(ctx, h, ACTIVE_ROOMS_DE, 'activeRooms.html');
    write('views/activeRooms.html', h);

    // --- testStunTurn.html
    h = read('views/testStunTurn.html');
    h = commonHead(h, 'testStunTurn.html', { gh: false });
    h = sub(h, /(<meta name="description" content=")[^"]*(")/, (m, a, b) => `${a}CouchChat Verbindungstest für STUN- und TURN-Server${b}`, 'meta description (de)');
    h = sub(h, /[ \t]*<a href="https:\/\/github\.com\/miroslavpejic85[^>]*>\s*Check this out too<\/a\s*>\s*<hr \/>\r?\n/, '', 'remove external github link');
    h = translateStatic(
        ctx,
        h,
        [
            ['Test Stun/Turn Servers', 'STUN-/TURN-Server testen'],
            ['🔴 The STUN server is NOT reachable!', '🔴 Der STUN-Server ist NICHT erreichbar!'],
            ['🔴 The TURN server is NOT reachable!', '🔴 Der TURN-Server ist NICHT erreichbar!'],
        ],
        'testStunTurn.html'
    );
    write('views/testStunTurn.html', h);

    // --- fully replaced small pages (branding/views/*)
    for (const f of ['404.html', 'privacy.html', 'maintenance.html', 'iframe.html']) {
        ctx.currentFile = `views/${f}`;
        let t = ctx.readBranding(`views/${f}`);
        if (t.includes('{{CC_FOOTER}}')) t = t.replace('{{CC_FOOTER}}', footer.trim());
        write(`views/${f}`, t);
        ctx.log(`replaced by branding/views/${f}`);
    }
}

function patchCss() {
    const fontImport = /^@import url\('https:\/\/fonts\.googleapis\.com\/[^']*'\);\r?\n/m;
    for (const f of ['client.css', 'activeRooms.css', 'customizeRoom.css', 'landing.css']) {
        let css = read(`css/${f}`);
        css = sub(css, fontImport, '', 'remove Google Fonts @import');
        write(`css/${f}`, css);
    }
    // upstream hero background (blue artwork, 1.1 MB); couchchat.css draws a petrol gradient instead
    {
        let css = read('css/landing.css');
        css = sub(css, 'background-image: url(../images/header.png);', 'background-image: none;', 'landing hero background image removed');
        write('css/landing.css', css);
    }
    for (const f of pub.listFiles('css').filter((x) => x.endsWith('.css'))) {
        if (ctx.state.brandingFiles?.has(`css/${f}`)) continue; // our own css is already in the final palette
        let css = read(`css/${f}`);
        const [out, n] = remapColors(css, SITE_CSS.includes(f));
        if (n) ctx.log(`css/${f}: remapped ${n} hardcoded blue/accent colors`);
        write(`css/${f}`, out);
    }
    // JS files that hardcode the upstream accent (SweetAlert palette / default confirm button)
    for (const [f, from, to] of [
        ['js/swal.js', '#315bd6', '#006e96'],
        ['js/utils.js', '#1A84F5', '#0A86AD'],
    ]) {
        ctx.currentFile = `public/${f}`;
        write(f, sub(read(f), from, to, `${f}: accent ${from}`, f === 'js/swal.js' ? 5 : 1));
    }
    // landing-only SVG artwork contains the upstream blue
    for (const f of ['images/illustration-section-01.svg', 'images/illustration-section-02.svg']) {
        if (!pub.exists(f)) continue;
        ctx.currentFile = `public/${f}`;
        const [out, n] = remapColors(fs.readFileSync(pub.abs(f), 'utf8'), false);
        if (n) ctx.log(`${f}: remapped ${n} colors`);
        write(f, out);
    }
}
