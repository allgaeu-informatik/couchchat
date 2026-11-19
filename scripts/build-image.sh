#!/usr/bin/env bash
# Local image build. Reads upstream.env (single source of truth) and runs docker build.
#
#   scripts/build-image.sh                 # builds couchchat:local
#   IMAGE=couchchat:test scripts/build-image.sh
#   EXTRA_ARGS="--no-cache" scripts/build-image.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
set -a; . ./upstream.env; set +a
: "${MIROTALK_IMAGE:?upstream.env: MIROTALK_IMAGE fehlt}"
: "${MIROTALK_VERSION:?upstream.env: MIROTALK_VERSION fehlt}"
: "${MIROTALK_COMMIT:?upstream.env: MIROTALK_COMMIT fehlt}"

IMAGE="${IMAGE:-couchchat:local}"
VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# shellcheck disable=SC2086
docker build ${EXTRA_ARGS:-} \
  --build-arg "UPSTREAM_IMAGE=$MIROTALK_IMAGE" \
  --build-arg "UPSTREAM_VERSION=$MIROTALK_VERSION" \
  --build-arg "UPSTREAM_DIGEST=${MIROTALK_IMAGE##*@}" \
  --build-arg "UPSTREAM_COMMIT=$MIROTALK_COMMIT" \
  --build-arg "VCS_REF=$VCS_REF" \
  --build-arg "BUILD_DATE=$BUILD_DATE" \
  -t "$IMAGE" .

echo "Fertig: $IMAGE (Upstream $MIROTALK_VERSION, $MIROTALK_COMMIT)"
