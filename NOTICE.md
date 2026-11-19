# Lizenzhinweise / License Notice

Dieses Repository enthält Bestandteile unter **unterschiedlichen Lizenzen**.

## 1. Code: GNU AGPLv3

Skripte, Patches, Konfiguration, Dockerfile, CI-Workflows und alle übrigen Dateien, die nicht unter Punkt 2 oder 3 fallen, stehen unter der **GNU Affero General Public License v3.0**, siehe [`LICENSE`](LICENSE).

Im Verzeichnis `branding/` sind **Code** und damit AGPLv3: `css/`, `views/`, `partials/`, `seo.js`, `lang/` (Übersetzungs-Overrides) sowie alle Skripte (`scripts/`, `branding/images/generate.sh`). Die darin enthaltenen eigenen Marketing- und Markentexte (z. B. Landingpage-Texte in `views/`) sind dagegen Inhalt nach Punkt 2. Reine **Inhalte** sind `branding/images/` und `branding/backgrounds/` (Punkt 2).

CouchChat basiert auf **MiroTalk P2P** von Miroslav Pejic (AGPLv3).
- Original: https://github.com/miroslavpejic85/mirotalk
- Exakt eingesetzte Version (Spiegel): https://github.com/allgaeu-informatik/mirotalk, Tag `couchchat-v<version>`, siehe `upstream.env`

## 2. Marke, Logos, Bilder und Markentexte: proprietär, alle Rechte vorbehalten

© 2026 Allgäu Informatik GmbH. Alle Rechte vorbehalten.

Folgende Bestandteile sind **nicht** Open Source und **nicht** von der AGPLv3 erfasst:

- der Name und die Marke **„CouchChat“** sowie der Name und die Marke **„Allgäu Informatik“**
- alle Logos, Bildzeichen, Icons, Favicons und Vorschaubilder unter `branding/images/`
- die Raumhintergründe unter `branding/backgrounds/*.webp`: im Auftrag der Allgäu Informatik GmbH KI-generiert und damit eigenes Markenmaterial. Hinweis: An KI-generierten Bildern kann der urheberrechtliche Schutz eingeschränkt oder nicht gegeben sein; Rechte an ihrer Nutzung über den Zweck des Quellcode-Angebots hinaus werden dennoch nicht eingeräumt. Die Quelldateien (`branding/backgrounds/_originals/`) sind nicht Teil des Repositorys.
- die Markenquellen der Allgäu Informatik GmbH (nicht Teil dieses Repositorys)
- die von Allgäu Informatik verfassten Marken- und Marketingtexte: Landingpage, Footer, Seitentitel, Beschreibungen und Vorschau-Texte in `branding/` und `couchchat.env*.example`

Die Nutzung, Vervielfältigung oder Verbreitung dieser Bestandteile ist ohne vorherige schriftliche Zustimmung der Allgäu Informatik GmbH nicht gestattet. Die Bereitstellung im Quellcode dient ausschließlich der Erfüllung der Quellcode-Pflichten der AGPLv3.

Nach AGPLv3 §7 Abs. 1 lit. e werden **keine Rechte an Marken, Handels- oder Dienstleistungsnamen** eingeräumt.

**Wer diesen Code selbst betreibt, muss sämtliche Bestandteile aus Punkt 2 durch eigene ersetzen.**

Ausgenommen sind Übersetzungen und Texte, die aus dem AGPL-lizenzierten Upstream-Projekt abgeleitet sind, etwa Anpassungen an `de.json`/`en.json`. Sie bleiben unter der AGPLv3.

## 3. Drittanbieter-Bestandteile

- **MiroTalk P2P** (Basis-Image, Upstream-Code): AGPL-3.0, siehe Punkt 1.
- **Schrift Inter** (`branding/fonts/`): SIL Open Font License 1.1, siehe `branding/fonts/LICENSE-Inter.txt`.
- **Selbst gehostete Bibliotheken** (`vendor.lock.json`, im Image unter `/src/public/vendor/`): jeweils unter ihrer eigenen Lizenz. Die vollständige, aus `vendor.lock.json` und den Paket-Metadaten erzeugte Tabelle steht in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) (erzeugen mit `node scripts/gen-third-party.mjs`). Überwiegend MIT, BSD-3-Clause und Apache-2.0; Font Awesome Free: CC-BY-4.0 AND OFL-1.1 AND MIT.
  - **GPL-3.0**: `qrious` 4.0.2 und `scrollreveal` 4.0.0 (laut Paket-`package.json` `GPL-3.0`). Sie werden unverändert als eigene Dateien ausgeliefert; ihr Quelltext ist das jeweilige öffentliche npm-Paket in der angegebenen Version. GPLv3 §13 erlaubt die Kombination mit AGPLv3-Code.
  - **Mediapipe-Modelle** (`selfie_segmenter`, `selfie_multiclass`): Apache-2.0, per URL mit SHA-256 gepinnt.
- **Zusätzliche Raumhintergründe des Betreibers** (`backgrounds-extra`, siehe README): werden zur Laufzeit aus einem Verzeichnis auf dem Server bereitgestellt und können Drittanbieter-Lizenzen unterliegen; die Lizenzprüfung liegt beim Betreiber. Sie sind weder im Repository noch im Image enthalten.

---

*Kontakt für Lizenzanfragen: Allgäu Informatik GmbH, https://allgaeu-informatik.de/kontakt*
