#!/usr/bin/env bash
# Konvertiert Bilder (jpg/jpeg/png/webp) in Raumhintergruende: WebP, max. 1920x1080, sichere Dateinamen.
# Nutzt ImageMagick in einem Wegwerf-Container (nichts wird installiert).
#
#   scripts/prepare-backgrounds.sh <zielverzeichnis> <bild> [<bild> ...]
#   scripts/prepare-backgrounds.sh <zielverzeichnis> <bild>=<name>      # expliziter Zielname (ohne Endung)
#
# Beispiel: scripts/prepare-backgrounds.sh branding/backgrounds Foto1.jpg=buero-ausblick Foto2.png
# Ohne "=name" wird der Dateiname klein geschrieben und auf [a-z0-9-] reduziert.
# Die Bilder werden zur Laufzeit aus einem gemounteten Verzeichnis ausgeliefert (nie im Image).
# Lizenz der Bilder selbst pruefen: das Verzeichnis ist in .gitignore und wird nicht veroeffentlicht.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

DEST="$1"; shift
mkdir -p "$DEST"
DEST_ABS="$(cd "$DEST" && pwd)"
# Arbeitsverzeichnis im Ziel (funktioniert mit Docker Desktop/Windows; /tmp waere dort kein gueltiger Mount)
WORK="$DEST_ABS/.prepare-tmp"
rm -rf "$WORK"; mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

list=""
for arg in "$@"; do
  src="${arg%%=*}"
  [ -f "$src" ] || { echo "FEHLER: Datei nicht gefunden: $src" >&2; exit 1; }
  if [[ "$arg" == *=* ]]; then name="${arg#*=}"; else
    base="$(basename "$src")"; name="${base%.*}"
  fi
  name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  [ -n "$name" ] || { echo "FEHLER: kein gueltiger Zielname fuer $src" >&2; exit 1; }
  ext="${src##*.}"; cp "$src" "$WORK/$name.$ext"
  list="$list $name.$ext"
done

MSYS_NO_PATHCONV=1 docker run --rm -v "$WORK:/in" -v "$DEST_ABS:/out" alpine:3.20 sh -c '
  set -e
  apk add --no-cache imagemagick imagemagick-webp imagemagick-jpeg imagemagick-heic >/dev/null 2>&1 || apk add --no-cache imagemagick imagemagick-webp imagemagick-jpeg >/dev/null
  for f in '"$list"'; do
    n="${f%.*}"
    magick "/in/$f" -auto-orient -resize "1920x1080>" -strip -quality 82 "/out/$n.webp"
    echo "  $n.webp"
  done
'
echo "Fertig: $DEST"
