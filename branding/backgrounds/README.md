# Raumhintergründe (Standardvorlagen)

Die `*.webp`-Dateien in diesem Verzeichnis sind **eigenes Markenmaterial** der Allgäu Informatik GmbH (im Auftrag
KI-generiert), versioniert im Repository und vom Dockerfile als eingebaute Vorlagen nach `/src/backgrounds` ins Image
kopiert (NOTICE.md, Punkt 2: proprietär, alle Rechte vorbehalten; als KI-generierte Bilder ist der Urheberrechtsschutz
möglicherweise eingeschränkt, Nutzungsrechte über den Zweck des Quellcode-Angebots hinaus werden trotzdem nicht
eingeräumt). Nur `_originals/` (Quelldateien) ist per `.gitignore` und `.dockerignore` ausgeschlossen.
Die Upstream-Presets von MiroTalk sind entfernt.

## Laufzeit

Der Server liefert die Bilder aus zwei Verzeichnissen:

* `COUCHCHAT_BACKGROUNDS_DIR` (Standard `/src/backgrounds`): eingebaute Vorlagen aus dem Image,
* `COUCHCHAT_BACKGROUNDS_EXTRA_DIR` (Standard `/src/backgrounds-extra`): optionales, gemountetes Verzeichnis des
  Betreibers. Dessen Dateien werden **hinzugefügt**; bei gleichem Dateinamen gewinnt das Extra-Verzeichnis.

Endpunkte: `GET /images/room-background/manifest.json` listet alle `*.webp|*.jpg|*.jpeg|*.png` beider Verzeichnisse
(nur Dateinamen aus `[A-Za-z0-9._-]`), `GET /images/room-background/<datei>` liefert das Bild (Cache 1 Stunde).
Der Browser lädt die Liste beim Start; dieselben Bilder erscheinen in der Auswahl für den virtuellen Kamerahintergrund.
Der eigene Upload (nur im Browser, nichts geht zum Server) funktioniert unabhängig davon.

* Lokal: keine Konfiguration nötig, die Vorlagen sind im Image. Zum Testen weiterer Bilder in
  `docker-compose.local.yml` den auskommentierten Mount `./backgrounds-extra` aktivieren.
* Produktion: optional `./backgrounds-extra` neben `docker-compose.yml` (siehe `docker-compose.prod.yml`, auskommentiert).
  Bilder im Extra-Verzeichnis können Drittanbieter-Lizenzen unterliegen (Prüfung beim Betreiber) und gehören
  **nie** ins Repository oder Image.

## Bilder vorbereiten

```bash
scripts/prepare-backgrounds.sh <zielverzeichnis> <bild>[=<name>] ...
# Beispiel: neue eigene Vorlage fürs Repository
scripts/prepare-backgrounds.sh branding/backgrounds foto1.jpg=buero-ausblick
```

Das Skript wandelt in WebP um (max. 1920x1080, ohne Metadaten) und vergibt sichere Kleinbuchstaben-Namen.
Originale gehören nach `_originals/` (ignoriert). Nur Bilder verwenden, an denen die Rechte vorliegen.
