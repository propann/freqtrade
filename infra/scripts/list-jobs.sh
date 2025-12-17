#!/usr/bin/env bash
set -euo pipefail

echo "Jobs (fta-job-*) en cours ou terminés récemment"
docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep '^fta-job-' || echo "Aucun job trouvé"
