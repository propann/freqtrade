# Templates de configuration

Ces fichiers servent de base pour générer les configs par tenant/bot. Aucun secret réel n'est stocké ici. Les secrets doivent être injectés au runtime via AWS Systems Manager Parameter Store ou AWS Secrets Manager.

- `freqtrade-config.template.json` : configuration Freqtrade avec placeholders.
- `client-template.env` : variables d'environnement attendues par les jobs.
- `validators.yaml` : limites de risque et quotas appliquées par l'orchestrateur.
