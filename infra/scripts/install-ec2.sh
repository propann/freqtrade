#!/usr/bin/env bash
set -euo pipefail

# Installe Docker + plugin Compose sur Ubuntu (EC2) et prépare les dossiers.
# Usage: curl -sSL https://raw.githubusercontent.com/.../install-ec2.sh | bash

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être exécuté en root (sudo)." >&2
  exit 1
fi

apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list >/dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

# Pare-feu minimal : SSH seulement, tout le reste bloqué (ajuster si besoin)
ufw allow OpenSSH
ufw --force enable

echo "Création du dossier /opt/freqtrade-aws"
mkdir -p /opt/freqtrade-aws
chown "${SUDO_USER:-ubuntu}:${SUDO_USER:-ubuntu}" /opt/freqtrade-aws

echo "Installation terminée. Placez le dépôt dans /opt/freqtrade-aws et exécutez infra/scripts/deploy.sh"
