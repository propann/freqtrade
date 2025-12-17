#!/usr/bin/env bash
set -euo pipefail

# Script d'initialisation pour une instance EC2 Ubuntu.
# - Installe Docker + plugin compose
# - Active un pare-feu UFW minimal
# - Prépare le dossier /opt/freqtrade-aws

if [[ "${EUID}" -ne 0 ]]; then
  echo "[!] Ce script doit être exécuté en root (sudo)." >&2
  exit 1
fi

apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

install -d -m 750 /opt/freqtrade-aws
chown ${SUDO_USER:-root}:${SUDO_USER:-root} /opt/freqtrade-aws

echo "[+] Docker et ufw installés. Placez les sources dans /opt/freqtrade-aws et exécutez infra/scripts/deploy.sh."
