#!/usr/bin/env bash
# Déploie le code sur Hetzner SANS écraser storage/ (catalogues, photos, commandes).
set -euo pipefail

HOST="${HETZNER_HOST:-root@167.233.117.168}"
REMOTE_DIR="${HETZNER_DIR:-/opt/tradeplug255}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Sync code vers ${HOST}:${REMOTE_DIR} (storage/ préservé)…"
rsync -az \
  --exclude node_modules \
  --exclude .git \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'storage' \
  "${ROOT}/" "${HOST}:${REMOTE_DIR}/"

echo "→ Rebuild Docker…"
ssh "$HOST" "cd ${REMOTE_DIR} && docker compose -f docker-compose.prod.yml up -d --build"

echo "→ Santé…"
curl -fsS --max-time 15 "http://tradeplug255.167.233.117.168.sslip.io/healthz" | grep -q '"ok":true' \
  && echo "OK tradeplug255" \
  || echo "WARN: vérifiez /healthz"
