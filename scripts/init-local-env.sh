#!/usr/bin/env bash
# Creates .env and couchchat.env for local development from the examples and fills in random secrets.
# Existing files are never overwritten.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

randpw() { node -e "process.stdout.write(require('crypto').randomBytes(12).toString('hex'))"; }
rand() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }

if [ ! -f .env ]; then cp .env.example .env; echo "angelegt: .env"; fi
if [ ! -f couchchat.env ]; then
  cp couchchat.env.local.example couchchat.env
  sed -i "s/^JWT_KEY=REPLACE_ME/JWT_KEY=$(rand)/; s/^API_KEY_SECRET=REPLACE_ME/API_KEY_SECRET=$(rand)/; s/\"password\":\"REPLACE_ME\"/\"password\":\"$(randpw)\"/" couchchat.env
  echo "angelegt: couchchat.env (lokale Werte, Zufalls-Geheimnisse)"
  echo "Host-Login lokal: Benutzer demo, Passwort in couchchat.env (HOST_USERS)"
fi
