#!/bin/sh
# CouchChat start guard. Refuses to start while example placeholders are still configured, then hands over
# to the upstream command with exec (signals reach node, graceful shutdown keeps working).
set -eu

bad=""
for name in JWT_KEY API_KEY_SECRET TURN_SERVER_USERNAME TURN_SERVER_CREDENTIAL HOST_USERS; do
    eval "value=\${$name:-}"
    case "$value" in
        *REPLACE_ME*) bad="$bad $name" ;;
    esac
done

if [ -n "$bad" ]; then
    echo "CouchChat: Start abgebrochen. Platzhalter REPLACE_ME ist noch gesetzt in:$bad" >&2
    echo "CouchChat: Bitte in couchchat.env echte Werte eintragen (Zufallswerte: openssl rand -hex 32)." >&2
    exit 1
fi

exec "$@"
