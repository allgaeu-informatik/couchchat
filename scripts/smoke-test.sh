#!/usr/bin/env bash
# Smoke-Test fuer CouchChat. Zwei Teile:
#   1. Image-Check: /src/public und /src/app/src werden aus dem gebauten Image kopiert und gegen verbotene
#      Marken-/Werbe-/Telemetrie-Muster geprueft (scripts/check-branding.mjs), dazu Struktur-Pruefungen
#      (geloeschte Dateien sind wirklich weg, Upstream-.env entschaerft, OCI-Labels).
#   2. HTTP-Check gegen die laufende Instanz: alle nutzersichtbaren Seiten laden und dieselben Regeln anwenden.
#
#   scripts/smoke-test.sh                     # beides, IMAGE=couchchat:local, BASE_URL=http://localhost:3020
#   IMAGE=ghcr.io/...:tag BASE_URL=http://localhost:3000 scripts/smoke-test.sh
#   scripts/smoke-test.sh --image-only        # nur Teil 1 (kein laufender Server noetig)
#   scripts/smoke-test.sh --http-only         # nur Teil 2 (z. B. gegen https://couchchat.de)
#
# Voraussetzungen: bash, curl, node (>= 20), docker (nur fuer Teil 1). Exit-Code != 0 bei Verstoessen.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE_URL="${BASE_URL:-http://localhost:3020}"
BASE_URL="${BASE_URL%/}"
IMAGE="${IMAGE:-couchchat:local}"
MODE="all"
case "${1:-}" in --image-only|--files-only) MODE="image" ;; --http-only) MODE="http" ;; "") ;; *) echo "Unbekannte Option: $1"; exit 2 ;; esac

FAIL=0
fail() { echo "FAIL: $*"; FAIL=1; }
ok() { echo "ok:   $*"; }
command -v node >/dev/null 2>&1 || { echo "FAIL: node nicht gefunden"; exit 1; }

# Temp dir inside the repo (build/ is git-ignored): docker.exe on Windows cannot write to MSYS /tmp paths.
REL_TMP="build/.smoke.$$"
mkdir -p "$REL_TMP"
TMP="$ROOT/$REL_TMP"
cleanup() { rm -rf "$TMP"; [ -n "${CID:-}" ] && docker rm -f "$CID" >/dev/null 2>&1; true; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------------------
# Teil 0: Repo-Texte (Env-Beispiele und Marken-Konstanten liegen nicht im Image). CouchChat ist ein Business-SaaS:
# keine Versprechen wie "ohne Konto" / "kostenlos".
# ---------------------------------------------------------------------------------------------------------
if [ "$MODE" != "http" ]; then
  echo "== Repo-Texte =="
  if grep -nEi 'ohne[[:space:]]+Konto|keine?[[:space:]]+Registrierung|Registrierung[[:space:]]+(ist[[:space:]]+)?nicht|ohne[[:space:]]+Anmeldung|kostenlos'        couchchat.env*.example couchchat.env scripts/lib/brand.mjs 2>/dev/null; then
    fail "verbotene Konto-/Kostenlos-Aussage in Env-Dateien oder brand.mjs (siehe oben)"
  else
    ok "keine Konto-/Kostenlos-Aussagen in Env-Beispielen und brand.mjs"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
# Teil 1: Image-Check
# ---------------------------------------------------------------------------------------------------------
if [ "$MODE" != "http" ]; then
  echo "== Image-Check $IMAGE =="
  command -v docker >/dev/null 2>&1 || { fail "docker nicht gefunden"; exit 1; }
  if ! CID="$(docker create "$IMAGE" 2>"$TMP/docker.err")"; then fail "Image $IMAGE nicht gefunden: $(cat "$TMP/docker.err")"; exit 1; fi
  mkdir -p "$TMP/image/app"
  MSYS_NO_PATHCONV=1 docker cp "$CID:/src/public" "$REL_TMP/image/public" >/dev/null || fail "/src/public nicht kopierbar"
  MSYS_NO_PATHCONV=1 docker cp "$CID:/src/app/src" "$REL_TMP/image/app/src" >/dev/null || fail "/src/app/src nicht kopierbar"
  MSYS_NO_PATHCONV=1 docker cp "$CID:/src/backgrounds" "$REL_TMP/image/backgrounds" >/dev/null || fail "/src/backgrounds nicht kopierbar"
  MSYS_NO_PATHCONV=1 docker cp "$CID:/src/.env" "$REL_TMP/image/dot-env" >/dev/null || fail "/src/.env nicht kopierbar"

  if node scripts/check-branding.mjs "$TMP/image/public" --app "$TMP/image/app/src" --hosts; then
    ok "keine verbotenen Muster in public/ und app/src des Images"
  else
    fail "Verstoesse im Image (siehe oben)"
  fi

  # Geloeschte Upstream-Dateien muessen im Image wirklich fehlen (Final-Stage ersetzt die Baeume komplett)
  for f in public/js/widget.js public/js/stats.js public/js/appSwitcher.js public/images/sponsors app/src/config.template.js; do
    [ -e "$TMP/image/$f" ] && fail "$f ist noch im Image" || ok "$f ist nicht im Image"
  done
  # Texte/Aufraeumen: Sponsor-/Werbe-Assets und ungenutzte Upstream-Bilder muessen weg sein
  for f in public/sponsors public/advertisers public/images/miroslav-pejic.png public/images/github.png \
           public/images/mirotalk-mc.png public/images/mirotalk-header.png public/svg/livePolls.svg public/svg/totalPrivacy.svg; do
    [ -e "$TMP/image/$f" ] && fail "$f ist noch im Image" || ok "$f ist nicht im Image"
  done
  # Eingebaute Raumhintergruende (eigenes Markenmaterial) im Image, Upstream-Presets entfernt
  n_bg="$(ls "$TMP/image/backgrounds"/*.webp 2>/dev/null | wc -l)"
  if [ "$n_bg" -ge 1 ]; then ok "Image enthaelt $n_bg Raumhintergruende unter /src/backgrounds"; else fail "keine Raumhintergruende unter /src/backgrounds"; fi
  [ -e "$TMP/image/backgrounds/_originals" ] && fail "_originals ist im Image" || ok "_originals nicht im Image"
  [ -e "$TMP/image/public/images/room-background" ] && fail "Upstream-Presets (public/images/room-background) im Image" || ok "Upstream-Presets nicht im Image"
  # Landing: deutscher Funktionsblock mit 6 Eintraegen
  if [ "$(grep -c 'class="cc-feature"' "$TMP/image/public/views/landing.html")" = "6" ]; then ok "landing.html: 6 Funktionskarten"; else fail "landing.html: Funktionsblock fehlt oder hat nicht 6 Eintraege"; fi
  # Statische Views duerfen keinen englischen Upstream-Resttext mehr enthalten
  for pat in 'Make the room yours' 'Room details' 'Meeting defaults' 'Back to home' 'Join room' 'placeholder="Username"' 'placeholder="Password"' 'Waiting for host' 'Back to top'; do
    if grep -rqF "$pat" "$TMP/image/public/views/"; then fail "englischer Resttext in views/: $pat"; else ok "views/ ohne '$pat'"; fi
  done
  # Neutrale Alt-Texte
  if grep -rqiE 'alt="mirotalk|imageAlt: .mirotalk' "$TMP/image/public/views" "$TMP/image/public/js"; then fail "alt-Text mit mirotalk-* im Image"; else ok "keine mirotalk-* alt-Texte"; fi
  # E-Mail-Einladung folgt SHOW_EMAIL_INVITE (Teilen-Dialog, Teilnehmer-Menue, handleRules)
  if grep -qF 'showDenyButton: !!buttons.settings.showTabEmailInvitation' "$TMP/image/public/js/client.js" \
     && ! grep -qF 'buttons.settings.showTabEmailInvitation = true;' "$TMP/image/public/js/client.js" \
     && grep -qF 'element: participantsEmailInviteBtn' "$TMP/image/public/js/client.js"; then ok "E-Mail-Einladung folgt SHOW_EMAIL_INVITE"; else fail "E-Mail-Einladung wird nicht von SHOW_EMAIL_INVITE gesteuert"; fi
  # Keine Upstream-Akzentfarben (SweetAlert-Standardblau) in Dialog-Skripten
  if grep -qiE '#315bd6|#1a84f5' "$TMP/image/public/js/swal.js" "$TMP/image/public/js/utils.js"; then fail "Upstream-Blau in swal.js/utils.js"; else ok "swal.js/utils.js im Markenton"; fi
  # Upstream-.env (oeffentlicher TURN-Account, OIDC-Secret) darf nicht mehr enthalten sein
  if grep -qE 'TURN_SERVER_CREDENTIAL|SESSION_SECRET|metered' "$TMP/image/dot-env"; then fail "/src/.env enthaelt noch Upstream-Defaults"; else ok "/src/.env ist entschaerft"; fi
  # Keine externen Hosts in den Views (CDN-frei)
  if node scripts/check-branding.mjs "$TMP/image/public" --hosts | sed -n '/External hosts/,$p' | grep -E '^\s+[a-z0-9.-]+\.[a-z]+ ' | grep -v 'allgaeu-informatik.de\|couchchat.de'; then
    fail "Views laden externe Hosts (siehe oben)"
  else
    ok "Views laden keine externen Hosts"
  fi

  # Metadaten
  src="$(docker inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.source"}}')"
  ver="$(docker inspect "$IMAGE" --format '{{index .Config.Labels "de.allgaeu-informatik.couchchat.upstream.version"}}')"
  [ "$src" = "https://github.com/allgaeu-informatik/couchchat" ] && ok "Label image.source" || fail "Label org.opencontainers.image.source fehlt/falsch: '$src'"
  { [ -n "$ver" ] && [ "$ver" != "unknown" ]; } && ok "Label upstream.version=$ver" || fail "Label upstream.version fehlt"
  user="$(docker inspect "$IMAGE" --format '{{.Config.User}}')"
  [ "$user" = "node" ] && ok "Image laeuft als node" || fail "Image-User ist '$user' (erwartet node)"
fi

# ---------------------------------------------------------------------------------------------------------
# Teil 2: HTTP-Check
# ---------------------------------------------------------------------------------------------------------
if [ "$MODE" != "image" ]; then
  echo "== HTTP-Check $BASE_URL =="
  command -v curl >/dev/null 2>&1 || { fail "curl nicht gefunden"; exit 1; }
  mkdir -p "$TMP/pages/views"

  # fetch NAME PATH EXPECTED_STATUS  -> $TMP/NAME.out
  fetch() {
    local name="$1" path="$2" want="$3" out="$TMP/$1.out" code
    code="$(curl -sS -o "$out" -w '%{http_code}' --max-time 20 "$BASE_URL$path" 2>"$TMP/curl.err")" || { fail "$path nicht erreichbar: $(cat "$TMP/curl.err")"; return 1; }
    case "|$want|" in *"|$code|"*) ;; *) fail "$path: HTTP $code (erwartet $want)"; return 1 ;; esac
    ok "$path -> $code"
    return 0
  }
  page() { # HTML-Seite holen und fuer die Muster-Pruefung ablegen
    if fetch "$1" "$2" "${3:-200}" && grep -qi "<html" "$TMP/$1.out"; then # Redirect-Antworten (302) haben keinen Seiteninhalt
      cp "$TMP/$1.out" "$TMP/pages/views/$1.html"
      if grep -q '{{' "$TMP/$1.out"; then fail "$2: unaufgeloeste {{...}}-Platzhalter"; fi
      if ! grep -q 'href="/css/couchchat.css"' "$TMP/$1.out" && [ "$1" != "privacy" ]; then fail "$2: couchchat.css nicht eingebunden"; fi
    fi
  }

  page landing "/" "200|302"
  page newcall "/newcall" "200|302"
  page room "/join/smoke-test-room"
  page icetest "/icetest"
  page notfound "/smoke/test/does-not-exist" "200|404"   # upstream liefert die 404-Seite mit Status 200
  page customize "/customizeRoom"
  # Texte: Funktionsblock auf der Landing, deutsche Raum-Anpassung ohne englischen Resttext
  if [ -f "$TMP/pages/views/landing.html" ]; then
    if [ "$(grep -c 'class="cc-feature"' "$TMP/pages/views/landing.html")" = "6" ]; then ok "Landing: 6 Funktionskarten"; else fail "Landing: Funktionsblock fehlt (SHOW_FEATURES=true gesetzt?)"; fi
  fi
  if [ -f "$TMP/pages/views/customize.html" ]; then
    for pat in 'Make the room yours' 'Meeting defaults' 'Copy join link' 'Your room link'; do
      if grep -qF "$pat" "$TMP/pages/views/customize.html"; then fail "/customizeRoom: englischer Resttext '$pat'"; else ok "/customizeRoom ohne '$pat'"; fi
    done
  fi
  page privacy "/privacy"
  # Warteraum/Login: keine eigenen Seiten mehr (Dialog im Raum); der Image-Check in Teil 1 deckt waitingRoom.html ab.

  if fetch brand "/brand" 200; then
    grep -q 'CouchChat' "$TMP/brand.out" || fail "/brand: kein CouchChat gefunden (BRAND_HTML_INJECTION=true? couchchat.env gelesen?)"
    # Only app+site are checked: the other keys (about/widget/html flags such as topSponsors) are internal names of upstream
    # that the frontend never shows with the SHOW_* flags set to false.
    node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).message||{};fs.writeFileSync(process.argv[2],JSON.stringify({app:j.app,site:j.site},null,1));" "$TMP/brand.out" "$TMP/pages/brand.json" || fail "/brand: keine gueltige JSON-Antwort"
  fi
  # Host-Schutz (HOST_PROTECTED=true) ist Jitsi-aehnlich: Startseite, /newcall und /join/<raum> sind IMMER offen (der Host-Login
  # laeuft als Dialog im Raum, die Sperre sitzt im Socket.IO-Join), /login ist keine Seite mehr (Redirect), Robots/Sitemap
  # bleiben fuer die Startseite offen.
  loc="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$BASE_URL/newcall" || true)"
  case "$loc" in
    "200 "*) ok "/newcall offen" ;;
    *) fail "/newcall: unerwartet '$loc' (erwartet 200, kein Redirect auf /login)" ;;
  esac
  loc="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$BASE_URL/login?room=smoke-test-room" || true)"
  case "$loc" in
    "302 "*/join/smoke-test-room) ok "/login?room=... -> /join/smoke-test-room" ;;
    *) fail "/login?room=smoke-test-room: unerwartet '$loc'" ;;
  esac
  loc="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$BASE_URL/login" || true)"
  case "$loc" in
    "302 "*) ok "/login -> Startseite (keine eigene Seite)" ;;
    *) fail "/login: unerwartet '$loc' (erwartet 302)" ;;
  esac
  if fetch robots "/robots.txt" 200; then
    grep -q '^Sitemap: ' "$TMP/robots.out" || fail "/robots.txt: keine Sitemap-Zeile (OG_URL gesetzt?)"
    grep -q '^Disallow: /join' "$TMP/robots.out" || fail "/robots.txt sperrt /join nicht"
    grep -q '^Disallow: /login' "$TMP/robots.out" || fail "/robots.txt sperrt /login nicht"
    if grep -qx 'Disallow: /' "$TMP/robots.out"; then fail "/robots.txt sperrt alles (Startseite soll indexierbar sein)"; fi
  fi
  if fetch sitemap "/sitemap.xml" 200; then
    grep -q '<loc>' "$TMP/sitemap.out" || fail "/sitemap.xml: keine <loc>-Eintraege"
    grep -qi 'mirotalk' "$TMP/sitemap.out" && fail "/sitemap.xml enthaelt mirotalk"
  fi
  # Raumhintergruende: Manifest listet die eingebauten Vorlagen, ein Bild ist abrufbar
  if fetch bgmanifest "/images/room-background/manifest.json" 200; then
    first="$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(Array.isArray(j)&&j.length?j[0]:'')" "$TMP/bgmanifest.out" 2>/dev/null)"
    if [ -n "$first" ]; then
      ct="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 20 "$BASE_URL/images/room-background/$first")"
      case "$ct" in "200 image/"*) ok "Raumhintergrund $first -> $ct" ;; *) fail "Raumhintergrund $first: $ct" ;; esac
    else fail "Raumhintergrund-Manifest leer"; fi
  fi
  fetch themes "/themes" 200 >/dev/null && ok "/themes erreichbar"

  # /privacy: Seite leitet per meta refresh auf die Datenschutzerklaerung des Betreibers
  grep -q 'allgaeu-informatik.de/datenschutz' "$TMP/privacy.out" 2>/dev/null || fail "/privacy verweist nicht auf allgaeu-informatik.de/datenschutz"

  # JSON-LD der Landing: neutral
  if grep -q 'application/ld+json' "$TMP/landing.out"; then
    grep -q 'Allg' "$TMP/landing.out" || fail "Landing: JSON-LD ohne Allgaeu Informatik GmbH als Anbieter (seo.js nicht ersetzt?)"
    grep -qi 'isAccessibleForFree\|codeRepository\|"price"' "$TMP/landing.out" && fail "Landing: JSON-LD enthaelt Upstream-Felder (seo.js nicht ersetzt)"
  fi

  # Statische Assets, die Views/Brand brauchen
  for a in /css/couchchat.css /css/fonts.css /fonts/inter-latin-400-normal.woff2 /images/logo.svg /images/couchchat.svg /images/couchchat-touch.png /images/favicon.ico /images/favicon.png /images/preview.png /images/couchchat-logo.png; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL$a" || true)"; code="${code:-000}"
    if [ "$code" = "200" ]; then ok "$a"; else fail "$a: HTTP $code"; fi
  done

  # Telemetrie: /stats darf keine Upstream-URL/ID liefern
  if fetch stats "/stats" 200; then
    if grep -q '"enabled":false' "$TMP/stats.out" && ! grep -qiE 'mirotalk|"src"|"id"' "$TMP/stats.out"; then ok "/stats liefert nur {enabled:false}"; else fail "/stats liefert Telemetrie-Daten: $(head -c 200 "$TMP/stats.out")"; fi
  fi

  # /about: serverseitig auf die Homepage des Betreibers (302); hinter Caddy ist der Pfad gesperrt (404), beides ok
  code="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$BASE_URL/about" || true)"
  case "$code" in
    "302 https://allgaeu-informatik.de"*|404*) ok "/about -> $code" ;;
    *) fail "/about: unerwartet '$code' (erwartet 302 auf allgaeu-informatik.de oder 404)" ;;
  esac

  echo "== Muster-Pruefung der geladenen Seiten =="
  if node scripts/check-branding.mjs "$TMP/pages" --no-structure; then
    ok "keine verbotenen Muster in den ausgelieferten Seiten und /brand"
  else
    fail "Verstoesse in den ausgelieferten Seiten (siehe oben)"
  fi
fi

echo
if [ "$FAIL" -ne 0 ]; then echo "SMOKE TEST FEHLGESCHLAGEN"; exit 1; fi
echo "SMOKE TEST OK"
