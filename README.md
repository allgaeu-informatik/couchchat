# CouchChat

Videochat-Dienst (couchchat.de) der Allgäu Informatik GmbH für Geschäftskunden: Videokonferenzen im Browser ohne Installation. Technische Basis ist
MiroTalk P2P (AGPLv3). Das Repository enthält **keinen Upstream-Quelltext**, sondern einen Patcher, der beim
Image-Build auf das gepinnte offizielle Image angewendet wird.

## Architektur: warum ein eigenes Image

Das Image wird nicht über Bind-Mounts auf dem offiziellen Image zusammengesetzt, sondern selbst gebaut (GitHub Actions),
**weiter auf dem gepinnten offiziellen Image**. Bind-Mounts lassen sich nur für `public/` und einzelne Dateien sauber
umsetzen; Server-Code (`app/src`, `app/api`) und gelöschte Dateien sind damit nicht abbildbar:

```
upstream.env ──► Dockerfile
                  ├─ vendor  (node:24-alpine@sha256, gepinnt)  holt Fremdbibliotheken laut vendor.lock.json (Hashes geprüft)
                  ├─ patch   (FROM Upstream)   node scripts/patch.mjs --root /src   (public/ UND app/src/, app/api/)
                  └─ final   (FROM Upstream)   /src/public, /src/app, /src/.env durch die gepatchten Bäume ersetzt
                                               (gelöschte Dateien sind wirklich weg), USER node, Start-Guard
```

Vorteile: kein CDN (alle Skripte, Schriften und Modelle kommen aus dem eigenen Image), Server-Code ist patchbar
(Telemetrie, Redirects, Restart-Banner, Mail-Texte), Start-Guard gegen Platzhalter-Geheimnisse, reproduzierbar
und per Digest nachvollziehbar. Update-freundlich bleibt es, weil jeder Patch einen **Anker mit erwarteter
Trefferzahl** hat: Ändert Upstream die Stelle, bricht der Build laut ab (Exit 1) und nennt Datei und Muster.

## Repository-Layout

| Pfad | Inhalt |
|---|---|
| `upstream.env` | **Einzige Wahrheit** für den Upstream-Stand: `MIROTALK_IMAGE` (Digest), `MIROTALK_VERSION`, `MIROTALK_COMMIT` |
| `Dockerfile` | Multi-Stage-Build (vendor, patch, final), OCI-Labels, Entrypoint |
| `docker/couchchat-entrypoint.sh` | Start-Guard: bricht ab, wenn `REPLACE_ME` in `JWT_KEY`, `API_KEY_SECRET`, `TURN_SERVER_USERNAME`, `TURN_SERVER_CREDENTIAL` oder `HOST_USERS` steht; dann `exec` des Upstream-Befehls |
| `scripts/patch.mjs`, `scripts/patches/`, `scripts/lib/` | Patcher (Module `10-assets` bis `90-cleanup`), Details in `scripts/patches/README.md` |
| `scripts/patches/40-server.mjs` | Patches am Server-Code (`app/src`, `app/api`, `.env` des Images) |
| `scripts/check-branding.mjs` | Verbotene Marken-/Werbe-/Telemetrie-Muster in `public/` und in String-Literalen von `app/src` (bricht den Build) |
| `scripts/vendor.mjs`, `vendor.lock.json` | Fremdbibliotheken (gepinnt, mit Hash) |
| `scripts/gen-third-party.mjs`, `THIRD_PARTY_LICENSES.md` | erzeugt die Lizenztabelle der Fremdbibliotheken aus Lock und Paket-Metadaten (bricht bei Abweichung ab) |
| `scripts/prepare-backgrounds.sh` | konvertiert Bilder zu Raumhintergründen (WebP, max. 1920x1080) |
| `scripts/build-image.sh` | lokaler Image-Build, liest `upstream.env` |
| `scripts/smoke-test.sh` | prüft das Image (Dateien) und die laufende Instanz (HTTP) |
| `scripts/init-local-env.sh` | legt `.env` und `couchchat.env` für lokale Entwicklung an (Zufalls-Geheimnisse, zufälliges Passwort für den lokalen Host-Login `demo`) |
| `branding/` | Eigene Quell-Assets (Bilder, Raumhintergründe, CSS, Footer, Views, Übersetzungen, `seo.js`, Fonts) |
| `.gitattributes` | `* text=auto eol=lf`, Bilder und Fonts als binär |
| `docker-compose.yml` | Service `couchchat` mit `${COUCHCHAT_IMAGE}` (read-only Dateisystem, keine Mounts; optionales `backgrounds-extra` nur im Prod-Override) |
| `docker-compose.local.yml` | lokal: baut aus dem Dockerfile (`couchchat:local`), Port `${LOCAL_PORT:-3020}:3000` |
| `docker-compose.prod.yml` | Produktion: Netzwerk `${CADDY_NETWORK}`, optional coturn (Profil `turn`) |
| `.env.example` / `.env` | Compose-Ebene: `COMPOSE_FILE`, `COUCHCHAT_IMAGE`, Port, Caddy-Netzwerk |
| `couchchat.env.example` | App-Konfiguration **Produktion** (Platzhalter `REPLACE_ME`) |
| `couchchat.env.local.example` | App-Konfiguration **lokal** (localhost, TURN aus) |
| `Caddyfile.example` | Site-Block mit gesperrten Pfaden und Content-Security-Policy |
| `coturn/turnserver.conf.example` | TURN-Server-Konfiguration |
| `.github/workflows/`, `.github/dependabot.yml` | `build.yml`, `upstream-check.yml`, `mirror-fork.yml` (optional, aus); Dependabot für Actions und den Node-Basisimage-Digest |

`.env`, `couchchat.env`, `coturn/turnserver.conf` und `build/` sind in `.gitignore`.

## upstream.env

```
MIROTALK_IMAGE=mirotalk/p2p@sha256:...   # offizielles Image, per Digest gepinnt (Docker Hub kennt nur :latest)
MIROTALK_VERSION=2.3.22                  # aus /src/package.json des Images
MIROTALK_COMMIT=a20bfbf...               # Upstream-Commit, aus dem das Image stammt (für den Fork-Tag)
```

Dockerfile (Build-Args), `scripts/build-image.sh` und die Workflows lesen diese Datei. Zusätzlich steht der
Digest als Default von `ARG UPSTREAM_IMAGE` im Dockerfile (für `docker compose build`); `build.yml` prüft, dass
beide übereinstimmen.

## Lokal entwickeln

Voraussetzungen: Docker, Node (für den Smoke-Test), bash, curl.

```bash
scripts/init-local-env.sh          # .env + couchchat.env (aus couchchat.env.local.example, Zufalls-Geheimnisse)
scripts/build-image.sh             # baut couchchat:local aus upstream.env (oder: docker compose build)
docker compose up -d               # http://localhost:3020 (nutzt COMPOSE_FILE aus .env, s. u.)
scripts/smoke-test.sh              # Image-Check + HTTP-Check (IMAGE=couchchat:local, BASE_URL=http://localhost:3020)
```

`docker compose up -d` funktioniert nur im Repo-Verzeichnis und nur mit der `.env` aus `scripts/init-local-env.sh`
(Kopie von `.env.example`): Dort setzt `COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml` die beiden
Compose-Dateien. Ohne diese `.env` (oder mit überschriebenem `COMPOSE_FILE`) müssen beide Dateien explizit genannt werden:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

`-f docker-compose.local.yml` allein reicht nicht: Die Basisdatei bindet `couchchat.env` ein, ohne sie startet der
Container mit „JWT_KEY is not set“.

Nur den Patcher prüfen, ohne Docker: Upstream-Baum aus dem Image holen und patchen.

```bash
id=$(docker create "$(. ./upstream.env; echo $MIROTALK_IMAGE)")
mkdir -p build/upstream-src && docker cp $id:/src/app build/upstream-src/app && docker cp $id:/src/public build/upstream-src/public && docker rm $id
node scripts/patch.mjs --root build/upstream-src --out build/new-out    # Quelle bleibt unberührt
```

**STUN/TURN lokal aus:** `couchchat.env.local.example` setzt `STUN_SERVER_ENABLED=false` und `TURN_SERVER_ENABLED=false`.
P2P zwischen zwei Tabs oder Geräten im selben Netz funktioniert über Host-Kandidaten ohne Server; es werden keine
IP-Adressen an Dritte (z. B. Google-STUN) gesendet. Für NAT-Tests einen eigenen coturn eintragen. In Produktion läuft
ein eigener coturn.

### Zugang / Host-Login

CouchChat ist ein Dienst für zahlende Geschäftskunden: Räume dürfen nur angemeldete Hosts anlegen, Gäste betreten
bestehende Räume per Link ohne Login. Dafür setzt die Konfiguration (Produktion und lokal) `HOST_PROTECTED=true`
und `HOST_USER_AUTH=false`:

- `HOST_PROTECTED=true` (Verhalten wie bei Jitsi): Startseite, `/newcall` und `/join/<raum>` sind **immer** erreichbar,
  es gibt keine eigene Login-Seite. Einen **neuen** Raum eröffnet nur, wer ein gültiges Host-Token hat; die Sperre sitzt
  im Socket.IO-`join` (`peer_token` Pflicht für einen neuen Raum). Ist der Raum noch nicht offen, erscheint im Raum ein
  Dialog: oben der Wartestatus (Prüfung per `POST /isRoomActive` alle 3 Sekunden, bei geöffnetem Raum wird automatisch
  beigetreten), darunter "Sie sind der Gastgeber?" mit Benutzername/Passwort und "Anmelden und Raum öffnen"
  (`POST /login`, Token in `sessionStorage.peer_token`, danach Neuladen). Wer einen Link zu einem **bestehenden** Raum
  aufruft, kommt ohne Login hinein. `GET /login` leitet auf `/join/<raum>` (mit `?room=`) bzw. `/`, `GET /logged` auf `/`.
  Nach erfolgreicher Anmeldung (und wenn der Raum während des Wartens geöffnet wurde) tritt der Browser automatisch bei:
  Anzeigename und Mikro/Kamera-Auswahl werden in `sessionStorage.cc_gate_autojoin` gemerkt und nach dem Neuladen einmalig
  verwendet (Prejoin entfällt, kein Schleifen-Risiko). Der eingegebene Name bleibt erhalten; `displayname` aus `HOST_USERS`
  gilt nur, wenn kein Name gesendet wurde. `GET /join?room=...&token=...` mit ungültigem Token leitet auf `/join/<raum>`
  (bzw. `/`); keine Route liefert mehr eine eigene Login-Seite.
- `HOST_USER_AUTH=false` muss gesetzt bleiben: `true` würde **jeden** Teilnehmer zur Anmeldung zwingen.
- `HOST_USERS` ist ein JSON-Array (Passwort 1 bis 36 Zeichen, `allowed_rooms` `["*"]` = alle Räume):
  `HOST_USERS=[{"username":"anna","password":"...","displayname":"Anna","allowed_rooms":["*"]}]`. Werte stehen ohne umschliessende Anführungszeichen, weil `docker run --env-file` Quotes wörtlich übernimmt.
  Der Container startet nicht, solange `REPLACE_ME` darin steht (Start-Guard).
- Das ist eine **Zwischenlösung**: Die Anmeldung über eine zentrale Benutzerverwaltung (eigener OIDC-Dienst) ist
  geplant und ersetzt `HOST_USERS`. Bis dahin Zugangsdaten pro Kunde in `couchchat.env` pflegen und mit
  `docker compose up -d` neu laden.
- SEO: Die Startseite ist auch mit Host-Schutz indexierbar (`/robots.txt` sperrt nur `/join`, `/login` usw., `/sitemap.xml`
  liefert die Startseite); nur OIDC sperrt weiterhin alles. Upstream führt den Anmeldestatus (`hostCfg.authenticated`)
  global pro Server-Instanz und IP; er steuert den Raumzugang nicht mehr, das tut allein die Token-Prüfung im Socket.
  Hinter Caddy ist `TRUST_PROXY=true` Pflicht, damit die echte Client-IP verwendet wird (Rate-Limit von `/login`).
- Lokal: `scripts/init-local-env.sh` legt den Benutzer `demo` mit zufälligem Passwort in `couchchat.env` an
  (`HOST_USERS`); die Datei ist nicht versioniert.

### Raumhintergründe

Die Standardvorlagen (`branding/backgrounds/*.webp`, 25 Bilder) sind eigenes Markenmaterial der Allgäu Informatik GmbH
(KI-generiert im Auftrag, siehe `NOTICE.md`), liegen im Repository und werden vom Dockerfile nach `/src/backgrounds`
ins Image kopiert; die Upstream-Presets von MiroTalk sind entfernt. Lokal und in Produktion gilt dasselbe Verhalten,
es ist kein Mount nötig. Nur `branding/backgrounds/_originals/` (Quelldateien) bleibt lokal und ist per `.gitignore`
und `.dockerignore` ausgeschlossen.

Optional zusätzliche, serverprivate Bilder (z. B. mit Drittanbieter-Lizenz, die **nie** ins Repository oder Image
gehören): Verzeichnis `./backgrounds-extra` nach `/src/backgrounds-extra` mounten (`docker-compose.prod.yml`,
auskommentiert; Pfad überschreibbar mit `COUCHCHAT_BACKGROUNDS_EXTRA_DIR`, Standardvorlagen mit
`COUCHCHAT_BACKGROUNDS_DIR`). Die Dateien werden den eingebauten Vorlagen hinzugefügt, bei gleichem Dateinamen gewinnt
das Extra-Verzeichnis. Änderungen wirken nach Neuladen der Seite ohne Neustart. Bilder vorbereiten:
`scripts/prepare-backgrounds.sh <zielverzeichnis> <bild>[=<name>] ...` (WebP, max. 1920x1080, sichere Dateinamen).
Details in `branding/backgrounds/README.md`.

## CI (GitHub Actions)

Alle Actions sind per vollem Commit-SHA gepinnt (Version im Kommentar). Prüfung der Workflows mit
`docker run --rm -v "$PWD/.github/workflows:/wf" rhysd/actionlint:latest /wf/build.yml ...`.

- **`build.yml`**: bei Push auf `main`, Pull Requests, Tags `v*` und manuell. Baut das Image (linux/amd64),
  prüft den Start-Guard, startet den Container mit Zufalls-Geheimnissen und führt `scripts/smoke-test.sh` aus.
  Nur auf `main` und Tags wird nach `ghcr.io/allgaeu-informatik/couchchat` gepusht (`GITHUB_TOKEN`,
  `packages: write`). Tags: `<upstream-version>-<git-sha7>` immer, zusätzlich `<upstream-version>` und `latest`
  auf `main`, bei Git-Tags der Tag-Name. arm64: siehe Kommentar im Workflow (QEMU ergänzen).
- **`upstream-check.yml`**: montags (und manuell). Vergleicht den Digest von `mirotalk/p2p:latest` mit
  `upstream.env`. Bei Abweichung: Version aus dem neuen Image lesen, Commit bestimmen, `upstream.env` und
  Dockerfile-Default ändern und einen Pull Request öffnen. Der PR-Build zeigt sofort, ob Anker brechen.
  Hinweis zum Commit: Upstream veröffentlicht keine Tags, eingetragen wird `HEAD` von
  `miroslavpejic85/mirotalk` zum Prüfzeitpunkt. Das kann neuer sein als der Image-Stand und ist im PR-Text als
  manuell zu prüfen markiert. Secret `UPSTREAM_PR_TOKEN` (PAT/App-Token) sorgt dafür, dass der PR-Build
  automatisch startet; mit dem Standard-`GITHUB_TOKEN` startet er nicht. Außerdem in den Repository-Einstellungen
  „Allow GitHub Actions to create and approve pull requests“ aktivieren.
- **`mirror-fork.yml`** (optional, standardmäßig aus): setzt den Tag `couchchat-v<version>` im Fork. Aktivierung:
  Repository-Variable `ENABLE_FORK_MIRROR=true` und Secret `FORK_PUSH_TOKEN` (nur Schreibrecht auf den Fork).

## Erste Einrichtung auf GitHub

1. Repository `allgaeu-informatik/couchchat` anlegen, Code pushen (Branch `main`).
2. Settings, Actions, General, Workflow permissions: **Allow GitHub Actions to create and approve pull requests**
   aktivieren (für `upstream-check.yml`).
3. Optional Secret `UPSTREAM_PR_TOKEN` (PAT/App-Token mit contents und pull requests write), damit der Build des
   Upstream-PR automatisch startet. Optional Variable `ENABLE_FORK_MIRROR=true` und Secret `FORK_PUSH_TOKEN`.
4. Nach dem ersten Push auf `main` erscheint das Paket `ghcr.io/allgaeu-informatik/couchchat`. **Öffentlich stellen**
   (Organisation, Packages, `couchchat`, Package settings, Change visibility): das ist unbedenklich, weil das Image
   nur eigene Marken-Assets (inkl. der selbst erzeugten Raumhintergründe), Oberflächen-Icons und Bilder aus dem
   AGPL-lizenzierten MiroTalk-Upstream sowie die gepinnten Fremdbibliotheken (siehe `THIRD_PARTY_LICENSES.md`) enthält,
   aber keine Bilder mit ungeklärter Lizenz. Dann reicht
   `docker compose pull` ohne Login. Alternativ privat lassen und auf dem Server mit einem PAT (`read:packages`)
   anmelden.
5. Dependabot (`.github/dependabot.yml`) schlägt wöchentlich Updates für Actions (SHA-gepinnt) und den
   Node-Basisimage-Digest vor.

## Update-Prozedur (neue MiroTalk-Version)

1. **Pull Request** von `upstream-check.yml` abwarten (oder manuell: neuen Digest mit
   `docker buildx imagetools inspect mirotalk/p2p:latest --format '{{.Manifest.Digest}}'` ermitteln, `upstream.env`
   und `ARG UPSTREAM_IMAGE` im Dockerfile anpassen). Der Workflow prüft, dass `package.json` im eingetragenen Commit die neue Version hat, und bricht sonst ab; der Commit kann trotzdem neuer sein als der Image-Stand.
2. **Build des PR ansehen.** Grün: weiter mit 4. Rot mit `anchor mismatch ...` oder `PATCH FAILED`: Upstream hat die
   Stelle geändert.
3. **Anker reparieren**: Meldung nennt Datei, Label und Muster. Upstream-Baum wie oben extrahieren, Muster in
   `scripts/patches/<modul>.mjs` anpassen, lokal `node scripts/patch.mjs --root build/upstream-src --out build/new-out`
   bis `OK`. Neue sichtbare Texte meldet `scripts/check-branding.mjs`; Ausnahmen nur mit Begründung in
   `APP_ALLOW` bzw. `FILE_ALLOW` eintragen. Neue Sprachschlüssel in `branding/lang/*.overrides.json` prüfen.
   Dann `scripts/build-image.sh && scripts/smoke-test.sh`, committen, pushen.
4. **Mergen** (Branch `main`). `build.yml` pusht das Image mit den Tags `<version>-<sha7>`, `<version>`, `latest`.
5. **Fork-Mirror** (manuell, sofern `mirror-fork.yml` aus ist), Quelle für die AGPL-Pflicht:
   ```bash
   gh repo sync allgaeu-informatik/mirotalk                       # Fork auf Upstream-Stand bringen
   git clone https://github.com/allgaeu-informatik/mirotalk && cd mirotalk
   git tag couchchat-v<version> <MIROTALK_COMMIT>                 # Commit aus upstream.env
   git push origin couchchat-v<version>
   ```
6. **Server aktualisieren**: in `.env` `COUCHCHAT_IMAGE=ghcr.io/allgaeu-informatik/couchchat:<version>-<sha7>`
   setzen, dann `docker compose pull && docker compose up -d`. Danach
   `BASE_URL=https://couchchat.de scripts/smoke-test.sh --http-only`.

### Release-Checkliste

- [ ] PR/Commit auf `main` gemergt, `build.yml` grün (das Image wird genau so gepusht, wie es getestet wurde)
- [ ] Tag `couchchat-v<version>` im Fork `allgaeu-informatik/mirotalk` auf `MIROTALK_COMMIT` gesetzt (Schritt 5 oben
      oder `mirror-fork.yml`) und im Browser geprüft
- [ ] `THIRD_PARTY_LICENSES.md` aktuell (`node scripts/gen-third-party.mjs`, wenn sich `vendor.lock.json` geändert hat)
- [ ] GHCR-Paket erreichbar (`docker pull` ohne Login, falls öffentlich)
- [ ] `COUCHCHAT_IMAGE` auf dem Server auf den neuen Tag gesetzt, `docker compose pull && docker compose up -d`
- [ ] `BASE_URL=https://couchchat.de scripts/smoke-test.sh --http-only`, Browser-Konsole ohne CSP-Verstöße
- [ ] Impressum verweist weiterhin auf `https://github.com/allgaeu-informatik/couchchat`

Beim Neustart zeigt der Server verbundenen Clients kurz einen Hinweis „CouchChat wird aktualisiert ...“ (Server-Patch).

## Erstinstallation auf dem Server

1. **DNS**: `couchchat.de`, `www.couchchat.de` und `turn.couchchat.de` auf den Server. `turn.` ohne CDN-Proxy.
2. **Caddy-Netzwerk** (einmalig): `docker network create caddy`; der Caddy-Container muss darin hängen.
3. Auf den Server kopieren: `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, `couchchat.env.example`,
   `coturn/` (das Image wird gezogen, nicht gebaut; optional `backgrounds-extra/` für zusätzliche Raumhintergründe). Dann:
   ```bash
   cp .env.example .env              # COMPOSE_FILE auf prod umstellen, COUCHCHAT_IMAGE auf Tag oder Digest setzen
   cp couchchat.env.example couchchat.env
   ```
4. **GHCR**: Das Paket `ghcr.io/allgaeu-informatik/couchchat` ist nach dem ersten Push standardmäßig privat.
   - *Öffentlich* (empfohlen, der Code ist ohnehin AGPL-Quelle): GitHub, Organisation, Packages, `couchchat`,
     Package settings, Change visibility. Dann reicht `docker compose pull` ohne Login.
   - *Privat*: auf dem Server mit einem Personal Access Token (nur `read:packages`) anmelden:
     `echo $TOKEN | docker login ghcr.io -u <github-user> --password-stdin`.
5. **Geheimnisse** in `couchchat.env` setzen: `JWT_KEY`, `API_KEY_SECRET` (je `openssl rand -hex 32`),
   `TURN_SERVER_USERNAME`, `TURN_SERVER_CREDENTIAL` sowie `HOST_USERS` (Host-Logins, siehe "Zugang / Host-Login"). Der Container startet nicht, solange `REPLACE_ME` darin steht.
   TURN-Zugangsdaten sind im Browser sichtbar, daher eigene Werte nur für TURN. `TRUST_PROXY=true` bleibt in
   Produktion gesetzt. `CORS_ORIGIN` ist ein JSON-Array (`["https://couchchat.de"]`), nicht ändern; Werte stehen ohne umschliessende Anführungszeichen, weil `docker run --env-file` Quotes wörtlich übernimmt.
6. **coturn**: `cp coturn/turnserver.conf.example coturn/turnserver.conf`, IP, Zugangsdaten (identisch zu
   `couchchat.env`) und Zertifikatspfade eintragen, im Compose-Mount das Zertifikatsverzeichnis einkommentieren.
   Firewall: 3478 UDP/TCP, 5349 TCP, Relay-Range 49152-49300 UDP. Start mit
   `docker compose --profile turn up -d coturn`. Empfehlung: coturn auf separatem Host; nach
   Zertifikatserneuerung neu starten.
7. **Caddy**: Block aus `Caddyfile.example` übernehmen, Caddy neu laden. **CSP-Rollout:** zuerst den Header-Namen auf
   `Content-Security-Policy-Report-Only` stellen, einige Räume inkl. Bildschirmfreigabe, Hintergrundunschärfe, Whiteboard
   und Chat testen und die Browser-Konsole auf `Refused ...`/Report-Meldungen prüfen, erst danach auf
   `Content-Security-Policy` umstellen. Der Block sperrt nicht benötigte Pfade
   (Integrationen, API und Swagger, `/about`, `/stats`, `/icetest`, `/iframe`, `/widget`), leitet `/privacy` auf
   die Datenschutzerklärung und setzt eine Content-Security-Policy ohne Drittanbieter-Hosts (Begründung je
   Direktive im Block). Für TURN-Tests `/icetest` zeitweise aus der Sperrliste nehmen. Validierung:
   `docker run --rm -v "$PWD/Caddyfile.example:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`.
8. `docker compose pull && docker compose up -d`, dann `BASE_URL=https://couchchat.de scripts/smoke-test.sh --http-only`.

## Was die Patcher ändern (Überblick)

- `public/`: Footer, Sponsoren, Werbung, Support, GitHub, Autor, App-Switcher, Docs und Social entfernt;
  `couchchat.css`, Bilder, Fonts, deutsche Texte; Fremdbibliotheken aus dem eigenen Image statt vom CDN.
- `app/src/seo.js` durch `branding/seo.js` ersetzt (neutrales JSON-LD, gleiche Exporte).
- `app/src` (Modul `40-server`): Telemetrie dauerhaft aus (`/stats` liefert nur `{"enabled":false}`), `/about` leitet
  auf `https://allgaeu-informatik.de`, Defaults in `config.js` (Marke, Titel, Open Graph, Sprache `de`, nur
  native Übersetzungen), Restart-Banner, Admin-Mail-Texte, Fallbacks im HTML-Injector, API-Doku-Titel,
  `config.template.js` entfernt.
- `/src/.env` des Upstream-Images (Entwicklungs-Defaults inklusive öffentlichem TURN-Account und OIDC-Secret) wird
  durch eine leere Datei ersetzt; Konfiguration kommt ausschließlich aus `couchchat.env`.
- Nicht geändert (intern, nicht sichtbar): JWT-Label, Deny-Liste bekannter Standard-Geheimnisse, Logger-Name, CSS-Klassen
  und Storage-Keys mit `mirotalk`. Die Ausnahmen stehen kommentiert in `scripts/check-branding.mjs`.

## Lizenz (AGPLv3) und Quellcode-Angebot

MiroTalk P2P steht unter der AGPLv3; es wird keine kommerzielle Lizenz verwendet. Der Dienst wird über das Netzwerk
bereitgestellt, daher muss Nutzern der Quelltext **der laufenden Version** angeboten werden:

- **Quelle der Anpassungen**: dieses Repository, `https://github.com/allgaeu-informatik/couchchat` (Patcher,
  Dockerfile, Branding, Konfiguration; ohne Geheimnisse). Das Image trägt das Label
  `org.opencontainers.image.source` mit dieser URL und `org.opencontainers.image.revision` mit dem Commit.
- **Quelle von Upstream**: Fork `https://github.com/allgaeu-informatik/mirotalk`, Tag `couchchat-v<version>` auf dem
  Upstream-Commit des laufenden Stands (Label `de.allgaeu-informatik.couchchat.upstream.source`).
- **Hinweis im Impressum** der Allgäu Informatik GmbH: Link auf `https://github.com/allgaeu-informatik/couchchat`.
  Nach jedem Release prüfen, dass Tag im Fork und Commit im Code-Repository existieren.

Die Entfernung der MiroTalk-Marke ist bewusst; Urheberrechts- und Lizenzhinweise in Quelldateien bleiben unverändert.
Marken, Logos und Texte von CouchChat sind nicht unter der AGPL, siehe `NOTICE.md`.

**Lizenz-Überblick** (verbindlich ist `NOTICE.md`):

| Bestandteil | Lizenz |
|---|---|
| Code (Patcher, Dockerfile, Skripte, Workflows, Konfiguration) | AGPL-3.0, `LICENSE` |
| Name und Marke CouchChat / Allgäu Informatik, Logos und Bilder (`branding/images/`), Raumhintergründe (`branding/backgrounds/*.webp`), eigene Markentexte | proprietär, © 2026 Allgäu Informatik GmbH, alle Rechte vorbehalten; keine Markenrechte nach AGPLv3 §7(e) |
| aus Upstream abgeleitete Übersetzungen | AGPL-3.0 |
| Schrift Inter | SIL OFL 1.1 |
| Fremdbibliotheken (`vendor.lock.json`) | je eigene Lizenz, Tabelle in `THIRD_PARTY_LICENSES.md`; darunter GPL-3.0 (`qrious`, `scrollreveal`) |
| Zusätzliche Raumhintergründe des Betreibers (`backgrounds-extra`) | nie im Repository/Image, Lizenz liegt beim Betreiber |

Das Image trägt das Label `org.opencontainers.image.licenses=AGPL-3.0-only AND LicenseRef-CouchChat-Brand`.

**Impressum-Text für den Quellcode-Link:**

> **Quellcode CouchChat**
> CouchChat basiert auf freier Software, die unter der GNU Affero General Public License v3 (AGPLv3) steht. Den vollständigen Quellcode der eingesetzten Version einschließlich unserer Anpassungen finden Sie hier: https://github.com/allgaeu-informatik/couchchat

Der Link muss auf einen existierenden Stand zeigen; Upstream-Quelle siehe Fork-Tag oben.

## Fehlersuche

| Symptom | Ursache und Lösung |
|---|---|
| Build bricht mit `anchor mismatch for "..." : expected N match(es), found M` ab | Upstream hat die Stelle geändert. Muster in `scripts/patches/*.mjs` anpassen (Update-Prozedur, Schritt 3). |
| Build bricht mit `forbidden "..." in string literal` oder `branding problem(s)` ab | Neuer sichtbarer Marken-/Werbetext. Im passenden Patch ersetzen oder, wenn intern, begründet in die Allow-Liste von `check-branding.mjs`. |
| `vendor: FAIL: integrity mismatch` | Gepinnte Fremdbibliothek hat sich geändert oder ist nicht erreichbar. `vendor.lock.json` prüfen (`node scripts/vendor.mjs --lock vendor.lock.json --update-lock`). |
| Container beendet sich sofort, Log: `Platzhalter REPLACE_ME` | `couchchat.env` enthält noch Platzhalter (Start-Guard). Echte Werte eintragen. |
| Container beendet sich mit JWT-/Secret-Fehler | `JWT_KEY` zu kurz oder bekannt unsicher: `openssl rand -hex 32`. |
| `docker compose pull`: `denied` / `unauthorized` | GHCR-Paket ist privat: Sichtbarkeit ändern oder `docker login ghcr.io` (Erstinstallation, Schritt 4). |
| `COUCHCHAT_IMAGE in .env setzen` | Variable fehlt in `.env` (lokal `couchchat:local`, Produktion Tag oder Digest). |
| Browser-Konsole: `Refused to load ... Content Security Policy` | Neues Feature lädt einen externen Host. Host gezielt in der passenden CSP-Direktive des Caddyfiles ergänzen oder das Feature abschalten (CSP zunächst als `Content-Security-Policy-Report-Only` testen). |
| Anrufe verbinden nicht über NAT | TURN: Zugangsdaten identisch in `couchchat.env` und `coturn/turnserver.conf`, Firewall-Ports, `/icetest` (zeitweise freigeben). |
| Schreibzugriff-Fehler im Container | Das Dateisystem ist read-only, `/tmp` ist tmpfs. Die App schreibt sonst nirgends; bei neuer Upstream-Version Log prüfen. |
| PR von `upstream-check.yml` hat keinen Build | PR wurde mit `GITHUB_TOKEN` erstellt: Secret `UPSTREAM_PR_TOKEN` setzen oder `build.yml` per `workflow_dispatch` auf dem Branch starten. |
