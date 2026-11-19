# CouchChat Admin: multi-stage build, Next.js standalone output, non-root, read-only root filesystem capable.
# Build context: ./admin   (docker build -t ghcr.io/allgaeu-informatik/couchchat-admin admin/)
ARG NODE_IMAGE=node:24.22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp \
    DATA_DIR=/data \
    HOSTDATA_DIR=/hostdata
# Writable only: /data (SQLite), /hostdata (host-users.json), /tmp (tmpfs). Everything else can be read-only.
RUN mkdir -p /data /hostdata && chown node:node /data /hostdata
COPY --from=build --chown=root:root /app/.next/standalone ./
COPY --from=build --chown=root:root /app/.next/static ./.next/static
COPY --from=build --chown=root:root /app/public ./public
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
