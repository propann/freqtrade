#!/usr/bin/env bash
set -euo pipefail

profile="${1:-baseline}"
timerange="${2:-20250101-20260101}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${script_dir}/researchctl" validate "${profile}" --timerange "${timerange}" --confirm VALIDATE
