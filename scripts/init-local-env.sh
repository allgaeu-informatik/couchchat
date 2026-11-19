#!/usr/bin/env bash
# Creates .env, couchchat.env and admin.env for local development from the examples and fills in random secrets.
# Existing files are never overwritten.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

rand() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }
# Meets the panel password policy (upper and lower case, digit, special character, 8-128 characters).
panelpw() { node -e "process.stdout.write('Cc!' + require('crypto').randomBytes(12).toString('hex') + 'X')"; }

if [ ! -f .env ]; then cp .env.example .env; echo "angelegt: .env"; fi
if [ ! -f couchchat.env ]; then
  cp couchchat.env.local.example couchchat.env
  sed -i "s/^JWT_KEY=REPLACE_ME/JWT_KEY=$(rand)/; s/^API_KEY_SECRET=REPLACE_ME/API_KEY_SECRET=$(rand)/" couchchat.env
  echo "angelegt: couchchat.env (lokale Werte, Zufalls-Geheimnisse)"
fi
if [ ! -f admin.env ]; then
  cp admin.env.local.example admin.env
  sed -i "s/^SESSION_SECRET=REPLACE_ME/SESSION_SECRET=$(rand)/; s/^BOOTSTRAP_ADMIN_PASSWORD=REPLACE_ME/BOOTSTRAP_ADMIN_PASSWORD=$(panelpw)/" admin.env
  echo "angelegt: admin.env (lokale Werte, Zufalls-Geheimnisse)"
  # Shared directories of the panel and CouchChat (kept out of git); the panel writes hostdata/host-users.json.
  mkdir -p hostdata admin-data
  echo "Admin-Panel lokal: http://localhost:3021 (Start: docker compose up -d --build)"
  echo "Erster Administrator: Benutzer admin, Passwort steht in admin.env (BOOTSTRAP_ADMIN_PASSWORD)."
  echo "Host-Logins für CouchChat (http://localhost:3020) legen Sie im Panel an; es schreibt hostdata/host-users.json."
  echo "Hinweis: hostdata/ und admin-data/ müssen für den Container-Benutzer (uid 1000) beschreibbar sein (lokal ggf. chmod 777)."
fi
