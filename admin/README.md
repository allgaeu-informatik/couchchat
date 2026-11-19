# CouchChat Admin

Verwaltungs-Panel für die Host-Benutzer von CouchChat (`https://admin.couchchat.de`). Das Panel ist die **einzige Wahrheit** für Host-Benutzer: Benutzer
werden hier angelegt und geändert und anschließend automatisch in eine Datei für CouchChat (MiroTalk) exportiert. Dieselben Zugangsdaten gelten also
für das Panel **und** für den Host-Login bei CouchChat.

Stack: Next.js (App Router, TypeScript strict, `output: "standalone"`), Tailwind CSS v4, lucide-react, zod, SQLite über das eingebaute `node:sqlite`
(Node 24, keine native Abhängigkeit), vitest.

## Rollen

| Rolle | Darf |
|---|---|
| `admin` | alle Benutzer anlegen, bearbeiten (Benutzername, Name, Rolle, erlaubte Räume, aktiv), löschen, Passwort setzen; Audit-Log ansehen |
| `user` | ausschließlich sich selbst: Benutzername, Anzeigename und eigenes Passwort (mit Eingabe des aktuellen Passworts) |

Die Rechte werden serverseitig erzwungen (Controller prüfen Rolle, der Service prüft Zielbenutzer und Felder). Der **letzte aktive Administrator** kann nicht
gelöscht, herabgestuft oder deaktiviert werden; ein Administrator kann sich nicht selbst löschen. Das eigene Passwort setzt auch ein Administrator
nur über „Passwort ändern“ (mit aktuellem Passwort).

## Oberfläche

Nur zwei Seiten: `/login` und `/` (Dashboard; für Administratoren mit den Reitern „Übersicht“ und „Benutzer“). Alles andere läuft in Modals: Benutzer anlegen, Benutzer bearbeiten, Passwort setzen/ändern (eigenes Modal),
Löschen bestätigen, eigenes Profil, Audit-Log (mit Paging und Filter nach Aktion). Das Look-and-Feel übernimmt Farben, Schrift (Inter, selbst gehostet)
und Radius von CouchChat (`branding/css/couchchat.css`).

Hinweis zu `public/images/` und `public/fonts/`: Logo und Favicon sind **Marke der Allgäu Informatik GmbH** und fallen unter [`NOTICE.md`](../NOTICE.md)
(Punkt 2, proprietär, alle Rechte vorbehalten); sie sind nicht von der AGPLv3 erfasst. Die Schrift Inter steht unter der SIL OFL 1.1
(`public/fonts/LICENSE-Inter.txt`).

## Schichten

```
src/app/api/**             Controller (dünn): Zugriffsstufe, Eingabevalidierung (zod), Aufruf des Service
src/server/http            Helfer: route() (CSRF, Session, Rolle, Fehlerabbildung), JSON-Antworten, Client-IP
src/server/services        Fachlogik: auth, users, permissions (reine Regeln), audit, hostSync, bootstrap, couchchat (API-Client), sampler, stats
src/server/repositories    SQL (users, sessions, audit, stats)
src/server/db              Verbindung (WAL), Migrationen (PRAGMA user_version)
src/server/security        scrypt-Hash (plus Prosody-SCRAM-SHA-1 nur zum Prüfen), Passwort-Policy, Session-Cookie, CSRF/Origin, Rate-Limit
src/proxy.ts               CSP mit Nonce und HSTS pro Anfrage; statische Header in next.config.ts
src/instrumentation.ts     Start: Bootstrap-Admin, Aufräumen, Host-Sync
```

## Sicherheit

- Passwörter: scrypt (`N=16384, r=8, p=1`, 64 Byte, 16 Byte Salt), Format `scrypt$N$r$p$saltB64$keyB64`. Policy: 8 bis 128 Zeichen, Klein- und Großbuchstabe, Ziffer, Sonderzeichen.
- Übernommene Jitsi-Passwörter: Format `scram-sha1$<Iterationen>$<Salt base64>$<StoredKey hex>` (RFC 5802 SCRAM-SHA-1, `saslprep` angenähert durch NFKC, höchstens 100000 Iterationen).
  Beim ersten **erfolgreichen Panel-Login** wird der Hash sofort auf scrypt umgestellt (Audit `password.rehash`, Host-Sync). Die Passwort-Policy gilt für übernommene Passwörter nicht, bis der Benutzer sie ändert.
  Bis dahin zeigt die Benutzertabelle das Kennzeichen „Altes Jitsi-Passwort“ (die API liefert nur das Feld `legacyPassword`, nie den Hash). CouchChat prüft beide Hash-Typen.
- Sitzungen: 32 Zufallsbytes, in der Datenbank nur als SHA-256. Cookie `__Host-cc_admin` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`), 8 h absolut, 2 h Leerlauf.
  Passwortwechsel beendet die anderen Sitzungen des Benutzers; Löschen, Deaktivieren, Rollenwechsel und Passwort-Reset durch einen Administrator beenden alle seine Sitzungen.
- CSRF: jede nicht-GET-Anfrage braucht `Origin == APP_ORIGIN` und `Content-Type: application/json` (zusätzlich `SameSite=Strict`).
- Login: generische Fehlermeldung, Scrypt-Vergleich auch für unbekannte/gesperrte Konten (Timing), Rate-Limit pro IP und Benutzername (im Speicher),
  Konto-Sperre 15 Minuten nach 10 Fehlversuchen in Folge. `X-Forwarded-For` (letzter Eintrag) zählt nur bei `TRUST_PROXY=true`.
- Header: strikte CSP (Skripte nur mit Nonce, kein `unsafe-eval` in Produktion), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS.
- Audit-Log (30 Tage, Bereinigung beim Start und stündlich): `login.success`, `login.failed`, `login.locked`, `logout`, `user.create`, `user.update` (nur Feldnamen),
  `user.delete`, `password.change`, `password.reset`, `password.rehash` (Umstellung eines Jitsi-Passworts auf scrypt), `user.import`
  (Import aus Jitsi/Prosody, Akteur `import-cli`), `hostsync.error`. Passwörter und Hashes werden nie protokolliert.

## Umgebungsvariablen

Siehe [`.env.example`](.env.example).

| Variable | Bedeutung | Standard |
|---|---|---|
| `APP_ORIGIN` | öffentliche URL (Origin-Prüfung), z. B. `https://admin.couchchat.de` | `http://localhost:3021` |
| `DATA_DIR` | Ordner der SQLite-Datei `admin.sqlite` | `/data` |
| `HOSTDATA_DIR` | Ordner für `host-users.json` | `/hostdata` |
| `COOKIE_SECURE` | `false` nur für lokales http (Cookie dann ohne `__Host-`-Präfix) | `true` |
| `TRUST_PROXY` | `true` hinter Caddy auf localhost | `false` |
| `COUCHCHAT_INTERNAL_URL` | interne URL von CouchChat im Docker-Netz, z. B. `http://couchchat:3000`; leer = keine Statistik | leer |
| `COUCHCHAT_API_KEY` | `API_KEY_SECRET` von CouchChat (Header `authorization`) | leer |
| `COUCHCHAT_IMAGE` | Anzeige in der Systemkarte; setzt `docker-compose.yml` aus der `.env` | `unbekannt` |
| `TURN_HOST`, `TURN_PORT` | optional: TCP-Erreichbarkeit des TURN-Servers in der Systemkarte (Timeout 2 s); ohne `TURN_HOST` entfällt die Zeile | `3478` |
| `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` | legen beim Start den ersten Administrator an, **nur wenn die Benutzertabelle leer ist** | leer |

Nach dem ersten Start die `BOOTSTRAP_ADMIN_*`-Variablen wieder entfernen (sie sind danach wirkungslos, das Passwort soll aber nicht in der Umgebung liegen bleiben). Ins Log gelangt nur der Benutzername.

## Host-Sync (Benutzer für CouchChat)

Nach **jeder** Änderung (anlegen, ändern, löschen, Passwort) und beim Start schreibt das Panel `host-users.json` atomar (Temp-Datei im selben Ordner,
`fsync`, `rename`, Modus 0644) nach `HOSTDATA_DIR`. Exportiert werden nur **aktive** Benutzer:

```json
{"version":1,"generated_at":"2026-01-01T00:00:00.000Z","users":[{"username":"alice","password_hash":"scrypt$16384$8$1$…$…","displayname":"Alice","allowed_rooms":["*"]}]}
```

CouchChat mountet **dasselbe Verzeichnis** schreibgeschützt unter `/hostdata` und liest `HOST_USERS_FILE=/hostdata/host-users.json`. Es wird bewusst das
Verzeichnis gemountet, nie die Einzeldatei (ein Bind-Mount einer einzelnen Datei behält nach dem `rename` den alten Inode). Schlägt der Export fehl, wird das
geloggt und als `hostsync.error` im Audit-Log vermerkt; die Änderung in der Datenbank bleibt erhalten. Das Panel merkt sich den Fehler und wiederholt den Export alle 30 Sekunden (und stündlich in der Wartung),
bis er klappt; solange meldet `/api/health` `status: "degraded"` (HTTP 200) und schreibende Endpunkte liefern ein `warning`-Feld, das die Oberfläche als Hinweis anzeigt.

## Nutzungsstatistik (nur Administratoren)

**Datenschutz:** Erfasst werden ausschließlich Anzahlen (Räume, Teilnehmer) und Raumnamen. Teilnehmernamen werden nie gespeichert, geloggt oder ausgeliefert: Der
API-Client (`services/couchchat.ts`) liest aus den CouchChat-Antworten nur Raum-ID und Zahl und verwirft alles andere; ein Test speist Antworten mit Namen ein und
prüft, dass keiner überlebt. Der Endpunkt `/api/v1/meetings` (mit Namen) wird nicht benutzt und bleibt in CouchChat über `API_DISABLED` abgeschaltet.

- **Quelle:** `GET /api/v1/stats` (`totalRooms`, `totalPeers`) und `GET /api/v1/activeRooms` (Raum-ID, Teilnehmerzahl) der internen CouchChat-API mit dem Header
  `authorization: <COUCHCHAT_API_KEY>`. Das Panel erreicht CouchChat über das Docker-Netz (`http://couchchat:3000`); Caddy sperrt `/api/*` öffentlich weiter.
  Das eigene CouchChat-Image gibt `activeRooms` auch bei `SHOW_ACTIVE_ROOMS=false` für gültige API-Keys frei (Patch in `scripts/patches/40-server.mjs`). Mit einem
  unveränderten Upstream-Image und `SHOW_ACTIVE_ROOMS=false` fehlt nur die Raumliste (Zahlen und Verlauf funktionieren), die Oberfläche weist darauf hin.
- **Messung:** alle 60 Sekunden (Timer in `instrumentation`, `unref`), Timeout 4 s. Tabelle `samples(ts, ok, rooms, peers)`; ist CouchChat nicht erreichbar, wird eine
  **Messlücke** gespeichert (`ok=0`, Werte `NULL`), nie eine 0. Raumsitzungen (`room_sessions`: Raumname, erstmals/zuletzt gesehen, höchste Teilnehmerzahl) liefern „offen seit“;
  eine Sitzung, die länger als 10 Minuten nicht gesehen wurde, gilt als beendet.
- **Aufbewahrung:** 30 Tage, Bereinigung in der stündlichen Wartung (zusammen mit Audit-Log und Sitzungen).
- **Kennzahlen:** Aktive Räume und Teilnehmer jetzt (Live), Spitze 24 Std. (höchste gleichzeitige Teilnehmerzahl einer Messung), **Teilnehmer-Minuten** 7 Tage
  (Summe der Teilnehmerzahlen aller erfolgreichen Minuten-Messungen; Lücken zählen nicht).
- **API** (nur `admin`, sonst 401/403): `GET /api/stats/overview` (Live, Kacheln, Systemdaten, Raumliste, Cache 5 s) und `GET /api/stats/history?range=24h|7d|30d`
  (Intervalle 15 Min. / 1 Std. / 6 Std. mit Maximum und Durchschnitt der Teilnehmer, Maximum der Räume, Lücken als `gap: true`; zusätzlich Spitze des Zeitraums).
- **Systemkarte:** CouchChat erreichbar und Antwortzeit, Image (`COUCHCHAT_IMAGE`), Panel-Version und Laufzeit, Last (`os.loadavg`), Arbeitsspeicher, freier Platz in `DATA_DIR`,
  TURN-Erreichbarkeit (nur mit `TURN_HOST`), Host-Sync-Status mit letzter erfolgreicher Zeit, Benutzerzahlen (gesamt, aktiv, Administratoren, Jitsi-Passwörter).
- **Oberfläche:** Reiter „Übersicht“ auf der Startseite, Diagramm als handgeschriebenes SVG ohne zusätzliche Abhängigkeit (keine Inline-Skripte, CSP unverändert), Raumliste und
  Kacheln aktualisieren sich alle 10 Sekunden, solange der Browser-Tab sichtbar ist.

## Übernommene Jitsi-Passwörter (scram-sha1)

Neben scrypt kennen Panel und CouchChat den Hash-Typ `scram-sha1$<Iterationen>$<Salt base64>$<StoredKey hex>` (SCRAM-SHA-1 nach RFC 5802, wie Prosody/Jitsi ihn speichert).
So funktionieren übernommene Konten mit ihrem bisherigen Passwort. Beim ersten Login im Panel wird das Passwort auf scrypt umgestellt (Audit `password.rehash`);
bis dahin zeigt die Benutzerliste „Altes Jitsi-Passwort“. Die einmalige Übernahme selbst ist nicht Teil dieses Repos.

**Reihenfolge beim Ausrollen:** Zuerst das CouchChat-Image mit `scram-sha1$`-Unterstützung ausrollen, erst danach solche Hashes in die Datenbank bringen. Ein älteres Image überspringt diese Einträge (Warnung im Log).

## Lokale Entwicklung

```bash
cd admin
cp .env.example .env.local     # Werte anpassen, Bootstrap-Admin eintragen
npm install
npm run dev                    # http://localhost:3021
npm run lint && npm run typecheck && npm test && npm run build
```

## Docker

```bash
docker build -t ghcr.io/allgaeu-informatik/couchchat-admin admin/
docker run --rm --read-only --tmpfs /tmp -p 3021:3000 \
  -v admin-data:/data -v hostdata:/hostdata \
  -e APP_ORIGIN=http://localhost:3021 -e COOKIE_SECURE=false \
  -e BOOTSTRAP_ADMIN_USERNAME=admin -e BOOTSTRAP_ADMIN_PASSWORD='<Passwort laut Policy>' \
  ghcr.io/allgaeu-informatik/couchchat-admin
```

Das Image läuft als Benutzer `node` mit schreibgeschütztem Root-Dateisystem; beschreibbar sind nur `/data`, `/hostdata` und `/tmp`. Container-Port 3000,
Healthcheck auf `/api/health`.

**Rechte der Verzeichnisse:** `/data` und `/hostdata` gehören im Container dem Benutzer `node` (uid/gid 1000). Bind-Mounts auf dem Host müssen ebenfalls dieser uid gehören, sonst
kann das Panel weder die Datenbank noch `host-users.json` schreiben (Docker legt fehlende Host-Verzeichnisse als root an):

```bash
install -d -o 1000 -g 1000 hostdata admin-data
```

Beim Start prüft das Panel beide Verzeichnisse und loggt bei fehlender Schreibberechtigung eine eindeutige Fehlermeldung (`[admin] FEHLER: DATA_DIR … nicht beschreibbar`) mit genau diesem Hinweis.
