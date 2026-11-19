# branding/images

Quelle: das farbige und das weiße Logo (`logo.webp`, `logo-white.webp`) aus den Markenquellen der Allgäu Informatik GmbH (nicht Teil des Repositorys). Das runde Zeichen wird per ImageMagick
(in einem Wegwerf-Container) links aus dem Logo ausgeschnitten (189x190 px bzw. 99x99 px, daher bei
großen Darstellungen leicht weich). Neu erzeugen: `generate.sh` (Aufruf im Kopf der Datei).
Der Patcher (`scripts/patches/10-assets.mjs`) kopiert diese Dateien beim Image-Build nach `public/images/` (teils unter
den Dateinamen von Upstream, damit feste Verweise weiter funktionieren).

| Datei | Größe | Inhalt | Upstream-Verwendung |
|---|---|---|---|
| logo.svg | 256x256 (quadratisch) | rundes Zeichen, PNG als Data-URI eingebettet (kein Vektor-Trace) | Header-Logo (32px, alle Views), Favicon/Apple-Touch via `SITE_ICON_PATH`-Default, Spinner im Raum, customizeRoom |
| couchchat.svg | 256x256 | identisch zu logo.svg | für `SITE_ICON_PATH=../images/couchchat.svg` |
| couchchat-touch.png | 180x180, weißer Hintergrund | Zeichen | für `APPLE_TOUCH_ICON_PATH` |
| favicon.png | 32x32 transparent | Zeichen | `<link rel=icon sizes=32x32>` in `client.html` |
| favicon.ico | 16/32/48 | Zeichen | Browser-Default `/favicon.ico` |
| couchchat-logo.png | 256x256, weißer Hintergrund | Zeichen | Standard-Avatar in Calls, iframe-Beispiel |
| couchchat-logo.gif | 715x402, statisch | komplettes Logo (Zeichen + Allgäu Informatik) auf weiß | "About"-Bild (bei SHOW_ABOUT=false nicht sichtbar) |
| preview.png | 1200x630 | Navy #16222f, weißes Zeichen, "CouchChat", "Videochat von Allgäu Informatik", petrol Balken | Open-Graph-Bild (`OG_IMAGE_URL`; Default zeigt sonst auf p2p.mirotalk.com!) |

Hinweise
- Eine Header-Wortmarke (`mirotalk-mc.png` in Upstream) wird nicht benutzt: Upstream referenziert sie nur in auskommentiertem HTML; `90-cleanup.mjs` entfernt die Upstream-Datei aus dem Image.
- Alle Upstream-Bilder, die nicht hier ersetzt werden (Sponsoren, Werbung, `mirotalk*.png`, `github.png`, `*-qr.png` usw.), löscht `scripts/patches/90-cleanup.mjs`, sofern nach dem Patchen nichts mehr darauf verweist.
- Zeichen ist Rasterbild; für bessere Qualität bei Bedarf eine Vektorvorlage des Zeichens liefern lassen.

# branding/fonts + css/fonts.css

Inter (latin, 400/500/600/700, woff2, SIL OFL 1.1, `@fontsource/inter@5.2.8` via `npm pack` im node-Container;
Lizenz: `fonts/LICENSE-Inter.txt`). `css/fonts.css` bindet sie per `@font-face` ein (Pfade relativ `../fonts/`) und aliasiert
zusätzlich die von Upstream hartkodierten Familien Montserrat, Lato, Fira Sans und IBM Plex Sans auf Inter, sodass nach
Entfernen der Google-Fonts-Links keine Fallback-Optik entsteht und nichts extern geladen wird.

Der Patcher kopiert `fonts/` und `css/` beim Build nach `public/fonts/` und `public/css/` (`10-assets.mjs`) und bindet
`/css/fonts.css` gefolgt von `/css/couchchat.css` als eigenes `<link>` in jede View ein (`20-views.mjs`); die
Google-Fonts-Links bzw. der `@import` in den Upstream-Dateien werden entfernt.
