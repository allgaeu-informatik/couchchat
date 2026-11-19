# Regeneriert branding/images/* aus Assets/*.webp (Quellen liegen im Projekt-Root ../../Assets).
# Aufruf (Git Bash, im Projekt-Root): MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/w" node:24-alpine sh /w/Code/branding/images/generate.sh
set -e
apk add --no-cache imagemagick imagemagick-webp font-inter >/dev/null
fc-list | grep -i inter | head -3
cd /w/Assets
O=/w/Code/branding/images
T=/tmp/t; mkdir -p $T
magick logo.webp -crop 232x239+0+0 +repage -trim +repage $T/mark.png
magick logo-white.webp -crop 130x139+0+0 +repage -trim +repage $T/markw.png
magick $T/markw.png info:
# square mark 256 with 8px margin
magick $T/mark.png -filter Lanczos -resize 240x240 -background none -gravity center -extent 256x256 $T/m256.png
B64=$(base64 -w0 $T/m256.png)
printf '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="256" viewBox="0 0 256 256"><title>CouchChat</title><image width="256" height="256" xlink:href="data:image/png;base64,%s"/></svg>\n' "$B64" > $O/logo.svg
cp $O/logo.svg $O/couchchat.svg
# favicons
magick $T/mark.png -filter Lanczos -resize 30x30 -background none -gravity center -extent 32x32 $O/favicon.png
for s in 16 32 48; do magick $T/mark.png -filter Lanczos -resize ${s}x${s} -background none -gravity center -extent ${s}x${s} $T/f$s.png; done
magick $T/f16.png $T/f32.png $T/f48.png $O/favicon.ico
# avatar
magick -size 256x256 xc:white \( $T/mark.png -filter Lanczos -resize 200x200 \) -gravity center -composite $O/couchchat-logo.png
# touch
magick -size 180x180 xc:white \( $T/mark.png -filter Lanczos -resize 144x144 \) -gravity center -composite $O/couchchat-touch.png
# about gif (static)
magick logo.webp -background white -alpha remove -filter Lanczos -resize 640x300 -gravity center -extent 715x402 -background white $O/couchchat-logo.gif
# preview
magick -size 1200x630 xc:'#16222f' \
  \( $T/markw.png -filter Lanczos -resize 220x220 \) -gravity west -geometry +110-40 -composite \
  -font Inter-Bold -pointsize 120 -fill white -gravity west -annotate +390-70 'CouchChat' \
  -font Inter-Regular -pointsize 44 -fill '#56b8de' -annotate +394+50 'Videochat von Allgäu Informatik' \
  -fill '#006e96' -draw 'rectangle 0,614 1200,630' $O/preview.png
cd $O; magick identify *.png *.gif *.ico
mogrify -depth 8 -define png:compression-level=9 *.png
