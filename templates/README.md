# Templates de configuration

Ces fichiers servent de base pour générer des configurations Freqtrade. Aucun secret réel n'est stocké ici. Les placeholders doivent être remplacés à l'exécution par le mécanisme de secrets choisi pour le déploiement (par exemple secrets Coolify ou Docker secrets).

- `freqtrade-config.template.json` : configuration Freqtrade avec placeholders.
- `validators.yaml` : limites de risque et quotas appliquées par l'orchestrateur.
