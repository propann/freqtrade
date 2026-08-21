#!/usr/bin/env bash
# ==============================================================================
# QuantApex Pro | Freqtrade Autonomous Trading Station - 1-Click Deployment
# ==============================================================================
# Supports: Ubuntu 20.04/22.04/24.04, Debian 11/12, CentOS/RHEL 9, Coolify, VPS
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}   ⚡ QuantApex Pro - Déploiement Automatisé 1-Click (Docker / VPS)   ${NC}"
echo -e "${BLUE}======================================================================${NC}"

# Check root/sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}⚠️ Exécution sans privilèges root. Certaines commandes sudo peuvent être demandées.${NC}"
fi

# Step 1: Check Docker
echo -e "\n${BLUE}[1/5] Vérification de l'environnement Docker & Compose...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker n'est pas installé. Installation automatique...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo -e "${GREEN}✓ Docker installé avec succès.${NC}"
else
    echo -e "${GREEN}✓ Docker est déjà installé ($(docker --version))${NC}"
fi

# Step 2: Directories & Permissions
echo -e "\n${BLUE}[2/5] Initialisation des répertoires de données Freqtrade...${NC}"
mkdir -p user_data/strategies
mkdir -p user_data/data
mkdir -p user_data/logs
mkdir -p user_data/backtest_results
mkdir -p user_data/hyperopts

chmod -R 775 user_data

# Step 3: Default Configuration check
echo -e "\n${BLUE}[3/5] Vérification du fichier de configuration (/user_data/config.json)...${NC}"
if [ ! -f "user_data/config.json" ]; then
    echo -e "${YELLOW}Création d'un config.json par défaut (Dry-Run / Binance)...${NC}"
    cat << 'EOF' > user_data/config.json
{
  "max_open_trades": 5,
  "stake_currency": "USDT",
  "stake_amount": 100,
  "tradable_balance_ratio": 0.99,
  "fiat_display_currency": "EUR",
  "dry_run": true,
  "dry_run_wallet": 1000,
  "cancel_open_orders_on_exit": false,
  "timeframe": "5m",
  "trailing_stop": true,
  "trailing_stop_positive": 0.015,
  "trailing_stop_positive_offset": 0.03,
  "trailing_only_offset_is_reached": true,
  "use_exit_signal": true,
  "exit_profit_only": false,
  "exit_profit_offset": 0.0,
  "ignore_roi_if_entry_signal": false,
  "minimal_roi": {
    "0": 0.05,
    "30": 0.03,
    "60": 0.015,
    "120": 0.005
  },
  "stoploss": -0.07,
  "unfilledtimeout": {
    "entry": 10,
    "exit": 10,
    "unit": "minutes"
  },
  "exchange": {
    "name": "binance",
    "key": "",
    "secret": "",
    "ccxt_config": { "enableRateLimit": true },
    "ccxt_async_config": { "enableRateLimit": true, "rateLimit": 200 },
    "pair_whitelist": [
      "BTC/USDT",
      "ETH/USDT",
      "SOL/USDT",
      "BNB/USDT",
      "AVAX/USDT",
      "NEAR/USDT",
      "LINK/USDT",
      "RENDER/USDT",
      "SUI/USDT",
      "INJ/USDT"
    ],
    "pair_blacklist": [
      ".*(BNB)/.*",
      ".*(BUSD|FDUSD|TUSD|USDC|EUR|DAI)/.*",
      ".*(UP|DOWN|BULL|BEAR)/.*"
    ]
  },
  "api_server": {
    "enabled": true,
    "listen_ip_address": "0.0.0.0",
    "listen_port": 8080,
    "verbosity": "info",
    "enable_openapi": false,
    "jwt_secret_key": "quant-apex-ultra-secure-jwt-key-2026-coolify",
    "CORS_origins": ["*"],
    "username": "freqtrade_user",
    "password": "SuperSecretQuantPassword2026!"
  },
  "bot_name": "QuantApex-Pro",
  "initial_state": "running",
  "force_entry_enable": true
}
EOF
    echo -e "${GREEN}✓ Fichier user_data/config.json généré.${NC}"
else
    echo -e "${GREEN}✓ Fichier user_data/config.json détecté.${NC}"
fi

# Step 4: Environment file check
echo -e "\n${BLUE}[4/5] Configuration des variables d'environnement (.env)...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ .env initialisé depuis .env.example${NC}"
    else
        cat << 'EOF' > .env
FREQTRADE_API_URL=http://freqtrade:8080
FREQTRADE_USERNAME=freqtrade_user
FREQTRADE_PASSWORD=SuperSecretQuantPassword2026!
FREQTRADE_ADMIN_USER=admin
FREQTRADE_ADMIN_PASSWORD=quant2026
FREQTRADE_PIN_CODE=2026
FREQTRADE_JWT_SECRET=quant-apex-ultra-secure-jwt-key-2026-coolify
NODE_ENV=production
EOF
        echo -e "${GREEN}✓ Fichier .env généré.${NC}"
    fi
fi

# Step 5: Launch Stack with Docker Compose
echo -e "\n${BLUE}[5/5] Lancement de la stack Freqtrade + Console Web SaaS...${NC}"
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

$COMPOSE_CMD -f docker-compose.coolify.yml up -d --build

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}   🚀 QuantApex Pro est Déployé & Opérationnel avec Succès !          ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "• Console Web & Station de Contrôle : http://localhost:3000"
echo -e "• API Freqtrade Gateway :              http://localhost:8080"
echo -e "• Identifiants par défaut :             admin / quant2026 (PIN: 2026)"
echo -e "• Suivre les logs en direct :           $COMPOSE_CMD -f docker-compose.coolify.yml logs -f"
echo -e "${BLUE}======================================================================${NC}\n"
