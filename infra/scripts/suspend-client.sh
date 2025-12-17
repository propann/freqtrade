#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client_id>" >&2
  exit 1
fi

CLIENT_ID="$1"
PREFIX="fta-job-${CLIENT_ID}-"

mapfile -t CONTAINERS < <(docker ps --format '{{.Names}}' | grep "^${PREFIX}" || true)

if [[ ${#CONTAINERS[@]} -eq 0 ]]; then
  echo "Aucun job en cours pour ${CLIENT_ID}."
  exit 0
fi

echo "Arrêt des conteneurs en cours pour ${CLIENT_ID}..."
for c in "${CONTAINERS[@]}"; do
  docker stop "$c" >/dev/null && docker rm "$c" >/dev/null
  echo " - $c stoppé"
done
