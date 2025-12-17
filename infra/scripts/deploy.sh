#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "Fichier .env manquant. Copie depuis .env.example" >&2
  cp .env.example .env
fi

echo "Démarrage des services de contrôle..."
docker compose -f infra/docker-compose.yml --env-file .env up -d --build

echo "Attente de la base Postgres (healthcheck)..."
docker compose -f infra/docker-compose.yml --env-file .env ps

echo "Deployment terminé. Portail disponible via Nginx (freqtrade-aws.${PUBLIC_DOMAIN})"
