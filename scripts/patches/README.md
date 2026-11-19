# Patch-Module

`scripts/patch.mjs` ist nur der Kern (CLI, Kontext, Modul-Lader, Abschlussprüfung). Die eigentlichen
Patches liegen als Module in diesem Verzeichnis. So können mehrere Personen parallel an
getrennten Dateien arbeiten.

## Aufruf

```bash
node scripts/patch.mjs --root <dir> [--out <dir>] [--branding branding] [--vendor <dir>]
```

| Option | Bedeutung |
|---|---|
| `--root` | Baum in der Form von `/src` des Upstream-Images: enthält `public/` und `app/src/`. Wird **in place** gepatcht (Dockerfile-Stage `patch`), außer `--out` ist gesetzt. |
| `--out` | Zielverzeichnis: `--root` wird dorthin kopiert und die Kopie gepatcht (`--root` bleibt unverändert; für lokale Tests/Diffs). |
| `--branding` | Quelle der Marken-Assets (Standard `<repo>/branding`). |
| `--vendor` | Optional: Verzeichnis mit den gepinnten Fremdbibliotheken (Ausgabe der Docker-Stage `vendor`). Nur für `50-vendor.mjs`. |

Exit-Codes: `0` ok, `1` Patch-Anker passt nicht / Branding-Prüfung fehlgeschlagen, `2` falsche Aufrufparameter.
Der Lauf ist deterministisch; ein zweiter Lauf **auf bereits gepatchtem Baum** scheitert absichtlich (Anker fehlen).
Immer vom unveränderten Upstream-Baum starten (`--out` oder frischer Container).

## Reihenfolge (fest)

| Modul | Zuständigkeit |
|---|---|
| `10-assets.mjs` | Branding-Dateien (`images/`, `fonts/`, `css/`) nach `public/` kopieren; `app/src/seo.js` ersetzen (Exports müssen identisch sein). Setzt `ctx.state.brandingFiles`. |
| `20-views.mjs` | HTML-Views (`public/views/*`), komplett ersetzte Seiten (`branding/views/*`), CSS (Google-Fonts-Import entfernen, harte Farben auf Petrol-Palette mappen). |
| `30-texts.mjs` | Sprachdateien (`public/lang/*.json`) und JS-Strings (`brand.js`-Fallback, `client.js`, ...). |
| `40-server.mjs` | Serverseitige Patches unter `app/src/` (Telemetrie, Redirects, config.js-Defaults, Mail-/API-Texte; Umfang im Kopfkommentar) und Host-Schutz, siehe Abschnitt „Host-Schutz“ unten. |
| `50-vendor.mjs` | CDN-Self-Hosting nach `public/vendor/`, Entfernen nicht selbst hostbarer Drittanbieter (Umfang im Kopfkommentar). |
| `60-backgrounds.mjs` | Raumhintergründe: Manifest und statische Auslieferung aus `/src/backgrounds` (im Image) plus optional `/src/backgrounds-extra` (Mount); Client lädt das Manifest. |
| `90-cleanup.mjs` | Nicht mehr referenzierte Upstream-Dateien löschen (läuft zuletzt, sieht alle anderen Patches). |

Fehlt ein Modul, wird es mit Hinweis übersprungen. Danach läuft immer `scripts/check-branding.mjs`
(`checkBuild` für `public/`, `checkApp` für `app/src/`); Funde brechen den Lauf mit Exit 1 ab.
Die `app/src`-Prüfung gilt nur für **nutzersichtbare String-Literale** und ist scharf (`APP_CHECK_ENFORCED = true`
in `check-branding.mjs`): Funde brechen den Lauf ab. Begründete Ausnahmen stehen in `APP_ALLOW`.

## Host-Schutz (40-server, data/client-gate.js)

Jitsi-ähnliches Verhalten bei `HOST_PROTECTED=true`:

- `/`, `/newcall` und `/join/:roomId` werden immer ausgeliefert (kein Warteraum, keine eigene Login-Seite). Die Sperre
  bleibt allein im Socket.IO-`join`. `/login` und `/logged` leiten um, Robots/Sitemap bleiben offen.
- `GET /join?room=&token=` leitet bei ungültigem Token auf `/join/<raum>` bzw. `/`; keine Route liefert `views.login`.
- Im Client ersetzt `data/client-gate.js` (`handleUnauthorized`) die Login-Weiterleitung durch einen Dialog: Wartestatus
  mit `/isRoomActive`-Polling und Host-Anmeldung per `POST /login`.
- Auto-Beitritt: `ccAutoJoinSave/Take` merken Name und Mikro/Kamera in `sessionStorage.cc_gate_autojoin` und speisen sie
  einmalig über `getPeerName`/`checkPeerAudioVideo` in den bestehenden Direct-Join-Pfad ein (das Flag wird beim Lesen
  gelöscht).
- Der getippte Name bleibt im `join` erhalten (`HOST_USERS.displayname` nur als Fallback bei leerem Namen);
  `GET /hostIdentity` liefert für `HOST_USERS` daher immer `locked:false`. OIDC-Verhalten ist unverändert.
- `handleRoomNotAllowed` ist deutsch mit Button „Zur Startseite“.

## Modul-Vertrag

```js
export const name = '20-views';            // Anzeigename im Log
export default async function (ctx) { ... }  // einzige Pflicht-Export
```

* Ein Modul besitzt **nur seine Dateien**; es ändert keine Dateien, die in einem anderen Modul behandelt werden.
* Jeder Patch hat einen expliziten Anker und eine erwartete Trefferzahl (`ctx.replaceN(..., expect)`).
  Abweichung = `ctx.fail()` = Abbruch mit klarer Meldung. Niemals still überspringen.
  Optionale Elemente nur mit `ctx.replaceOpt` (0 Treffer erlaubt, sonst exakt alle).
* Anker bevorzugen statt ganze Upstream-Dateien zu kopieren (Updates bleiben kompatibel).
* Kommentare im Code Englisch, nutzersichtbare Texte Deutsch.
* Keine Netzwerkzugriffe, keine Zufallswerte, keine Zeitstempel (Determinismus).
* Daten an spätere Module nur über `ctx.state` weitergeben und im Modulkopf dokumentieren.

### `ctx` API

Pfade sind relativ zu `ctx.root` (z. B. `public/js/client.js`, `app/src/server.js`).

| Member | Zweck |
|---|---|
| `root`, `branding`, `vendor` | absolute Verzeichnisse (`vendor` kann `null` sein) |
| `state` | freies Objekt zum Datenaustausch zwischen Modulen |
| `scope(prefix)` | liefert `{read, write, remove, exists, listFiles, abs}` relativ zu `prefix`, z. B. `ctx.scope('public')`, `ctx.scope('app/src')` |
| `read(rel)` / `write(rel, text)` | Textdatei lesen (CRLF wird zu LF normalisiert) / schreiben; `read` setzt `ctx.currentFile` für Fehlermeldungen |
| `exists`, `listFiles(rel)`, `abs(rel)` | Dateisystem-Helfer |
| `copyTree(srcAbs, dstRel)`, `deleteTree(rel)` / `remove(rel)` | Baum kopieren / löschen |
| `replaceOnce(str, find, repl, label)` | genau 1 Treffer (String oder RegExp) |
| `replaceN(str, find, repl, label, expect)` | genau `expect` Treffer |
| `replaceOpt(str, find, repl, label)` | 0 Treffer erlaubt |
| `removeBlock(str, startAnchor, endAnchor, label)` | Block von Start (genau 1 Treffer) bis einschliesslich End-Anker entfernen |
| `removeSection(html, id)` / `setInner(html, id, inner)` | HTML-Helfer (nicht verschachtelte Tags) |
| `injectBeforeHeadEnd(html, snippet, label)` | Snippet vor `</head>` einfügen |
| `setJsonKey(rel, 'a.b.c', value, {create})` | JSON-Schlüssel setzen |
| `readBranding(rel)` | Datei aus `branding/` lesen (Fehler, wenn sie fehlt) |
| `log(msg)`, `warn(msg)`, `fail(msg)` | Protokoll / Warnung / harter Abbruch |

Die Hilfsfunktionen stehen in `scripts/lib/helpers.mjs`, gemeinsame Marken-Konstanten in `scripts/lib/brand.mjs`.

## Neues Modul / Anker pflegen

1. Datei `NN-name.mjs` mit obigem Vertrag anlegen (die Namen und Reihenfolge stehen in `MODULES` in `patch.mjs`).
2. Gegen den unveränderten Upstream-Baum testen:
   `node scripts/patch.mjs --root build/upstream-src --out build/new-out`
   (`build/upstream-src` entsteht per `docker create` + `docker cp <id>:/src/public` und `:/src/app/src`).
3. Nach einem Upstream-Update: scheitert ein Anker, steht Datei, Label und erwartete/gefundene Trefferzahl in
   der Meldung; den Anker im zustaendigen Modul anpassen, nicht den Check lockern.

## 50-vendor und `vendor.lock.json` (kein CDN)

Alle Fremdbibliotheken (Views, `background-effects.js`, emoji-mart-Daten) werden selbst ausgeliefert.

* `vendor.lock.json` pinnt jede Bibliothek (`npm`-Paket + exakte Version + `integrity`, bzw. `url` + `sha256`).
* `scripts/vendor.mjs` (Dockerfile-Stage `vendor`, node:24-alpine) holt die Pakete per `npm pack`, prüft die Integritaet
  und legt die benötigten Dateien unter `/vendor/<name>/...` ab. Fehlende Datei oder falsche Prüfsumme = Abbruch.
  Neue/geänderte Einträge: Version eintragen, `integrity` löschen, `node scripts/vendor.mjs --lock vendor.lock.json --update-lock`.
* `50-vendor.mjs` kopiert nach `public/vendor/`, schreibt jede CDN-URL exakt um (Tabelle `HTML_MAP`, erwartete Views je URL)
  und scheitert, wenn nach dem Patchen noch ein verbotener Fremdhost oder eine extern geladene Ressource übrig ist
  (erlaubt: YouTube-Embed bei ausdrücklich geteiltem Link, eigene Domains). `--vendor` ist Pflicht.
* Entfernt statt gehostet: Google Translate (`translate.js` lädt das Skript nicht mehr), Gravatar und DiceBear
  (lokale Initialen-Avatare), KLIPY-GIF-Suche (`gifSearch.js` + Attribution).
* Abweichungen von Upstream (CDN lieferte `@latest`): ua-parser-js 1.0.41 (letzte MIT-Version; 2.x ist AGPL), pickr 1.9.1
  (letzte Version mit `pickr.es5.min.js`), Font Awesome einheitlich 6.4.2, webrtc-adapter 9.0.6, marked/xss/axios/emoji-mart auf aktuelle Version gepinnt.
* Ein Upstream-Update, das eine CDN-URL ändert oder neu hinzufuegt, bricht den Build (Anker bzw. Schlussabnahme) und muss
  hier nachgezogen werden.

## Texte, Übersetzungstabellen und Aufräumen (20-views, 30-texts, 90-cleanup)

- `lib/translate.mjs` (`translateStatic`): tabellengesteuerte Übersetzung statischer HTML-Texte. Jeder Eintrag
  `[englisch, deutsch, anzahl=1]` muss einen **vollständigen** Textknoten oder Attributwert (`placeholder`, `title`,
  `aria-label`, `alt`, `label`) genau `anzahl`-mal treffen, sonst bricht der Patcher ab. Tabellen: `CUSTOMIZE_ROOM_DE`,
  `LOGIN_DE`, `WAITING_ROOM_DE` in `20-views.mjs`. customizeRoom.html lädt kein `i18n.js`, deshalb dort statisch
  und zusätzlich die Meldungen in `customizeRoom.js` (Tabelle in `30-texts.mjs`).
- `data/client-js-de.json`: fest eincodierte englische Meldungen in `client.js`, die nicht durch `lang/de.json`
  laufen (Texte mit Platzhaltern, z. B. „X has raised the hand!"). Eintrag `{old, new, count}`, `old` ist der exakte
  Quelltext. Neue Upstream-Meldungen: Anker ergänzen. Anrede durchgängig **Sie**.
- `branding/lang/de.overrides.json` -> `translate`: korrigiert vorhandene Einträge in `public/lang/de.json`
  (Upstream lässt einige Texte unübersetzt bzw. duzt an wenigen Stellen). Schlüssel muss in der Sektion genau einmal
  vorkommen.
- E-Mail-Einladung: `SHOW_EMAIL_INVITE` steuerte upstream nur den Einstellungs-Tab. Der Patcher lässt den Button im
  Teilen-Dialog und den Eintrag im Teilnehmer-Menü dem Flag folgen und entfernt das Erzwingen in `handleRules()`.
- Landing-Funktionsblock (`FEATURES_SECTION`, 6 Karten) wird von `brand.js` je nach `SHOW_FEATURES` ein- oder
  ausgeblendet. Die `/brand`-Antwort liegt pro Tab im `sessionStorage`; der Patcher nutzt dafür einen eigenen
  Schlüssel (`couchchatBrandData`), damit alte Werte (z. B. `features:false`) den Block nicht verstecken.
- Farben: `HEX_MAP`/`RGB_MAP` (20-views) ersetzen restliche Upstream-Blautöne und das Grün der Teilen-Hervorhebung;
  `branding/css/couchchat.css` enthält Dialog-/Fokus-Overrides. Semantische Statusfarben (Erfolg grün, Fehler rot)
  bleiben bewusst.
- `90-cleanup.mjs`: löscht `public/sponsors`, `public/advertisers`, ungenutzte Feature-SVGs (`svg/*`) und Bilder
  nur, wenn nach allen Patches kein Text in `public/` oder `app/src/` mehr auf den Dateinamen verweist.
