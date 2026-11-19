# syntax=docker/dockerfile:1
#
# CouchChat image: the pinned official MiroTalk P2P image, patched at build time by scripts/patch.mjs.
# Stages: vendor (pinned third-party libs) -> patch (run the patcher on /src) -> final (clean copy of the
# patched trees, so files deleted by the patcher are really gone).
#
# Build (local): scripts/build-image.sh      Build (CI): .github/workflows/build.yml
# The default of UPSTREAM_IMAGE must match upstream.env (CI and build-image.sh always pass it explicitly).

ARG UPSTREAM_IMAGE=mirotalk/p2p@sha256:7535807126eb7fbdc4b28f0a36647557a60c30b09d8617d0ed973a2381f563eb

# ---- vendor: fetch pinned third-party libraries (network only in this stage) -------------------------------
# Base pinned by digest (tag kept for readability; Dependabot bumps tag and digest together, see .github/dependabot.yml).
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS vendor
WORKDIR /build
COPY vendor.lock.json ./
COPY scripts/vendor.mjs ./scripts/vendor.mjs
RUN node scripts/vendor.mjs --lock vendor.lock.json --out /vendor

# ---- patch: apply the patcher to the upstream tree ---------------------------------------------------------
FROM ${UPSTREAM_IMAGE} AS patch
USER root
WORKDIR /patcher
COPY scripts/ ./scripts/
COPY branding/ ./branding/
COPY --from=vendor /vendor/ ./vendor/
# Fails (exit 1) if an anchor no longer matches the upstream code or a branding check fails.
RUN node scripts/patch.mjs --root /src --branding /patcher/branding --vendor /patcher/vendor

# ---- final -------------------------------------------------------------------------------------------------
FROM ${UPSTREAM_IMAGE} AS final
ARG UPSTREAM_VERSION=unknown
ARG UPSTREAM_DIGEST=unknown
ARG UPSTREAM_COMMIT=unknown
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

USER root
# Replace the trees instead of overlaying them: files removed by the patcher must not survive from the base image.
RUN rm -rf /src/public /src/app /src/.env
COPY --from=patch --chown=node:node /src/public /src/public
COPY --from=patch --chown=node:node /src/app /src/app
COPY --from=patch --chown=node:node /src/.env /src/.env
# Built-in room background presets (own brand material, see NOTICE.md); served by the 60-backgrounds server patch.
# Optional additions at runtime: mount a directory at /src/backgrounds-extra (COUCHCHAT_BACKGROUNDS_EXTRA_DIR).
COPY --chown=node:node branding/backgrounds/*.webp /src/backgrounds/
COPY --chown=root:root --chmod=0755 docker/couchchat-entrypoint.sh /usr/local/bin/couchchat-entrypoint.sh

LABEL org.opencontainers.image.title="CouchChat" \
      org.opencontainers.image.description="CouchChat (couchchat.de), Videochat der Allgaeu Informatik GmbH, based on MiroTalk P2P (AGPL-3.0)" \
      org.opencontainers.image.vendor="Allgaeu Informatik GmbH" \
      org.opencontainers.image.licenses="AGPL-3.0-only AND LicenseRef-CouchChat-Brand" \
      org.opencontainers.image.source="https://github.com/allgaeu-informatik/couchchat" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      de.allgaeu-informatik.couchchat.upstream.version="${UPSTREAM_VERSION}" \
      de.allgaeu-informatik.couchchat.upstream.digest="${UPSTREAM_DIGEST}" \
      de.allgaeu-informatik.couchchat.upstream.commit="${UPSTREAM_COMMIT}" \
      de.allgaeu-informatik.couchchat.upstream.source="https://github.com/allgaeu-informatik/mirotalk/tree/couchchat-v${UPSTREAM_VERSION}"

USER node
WORKDIR /src
# Same probe as docker-compose.yml (node is the only tool guaranteed in the image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/robots.txt',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/couchchat-entrypoint.sh"]
# Same command as upstream; the entrypoint ends with exec "$@", so node receives SIGTERM directly.
CMD ["node", "app/src/server.js"]
