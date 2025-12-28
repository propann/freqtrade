# Plan d'exécution par étapes

1. **Baseline infra** : installer Docker/Compose via `infra/scripts/install-ec2.sh`, déployer Postgres + docker-socket-proxy + portail placeholder (Nginx système en frontal, hors Docker).
2. **Orchestrateur** : déployer le service FastAPI (port 9000) avec stockage JSON local, connectable à Postgres ultérieurement.
3. **Templates/validators** : finaliser les templates config Freqtrade et les limites de risque (`templates/validators.yaml`).
4. **Intégration AWS** : ajouter les appels SSM/Secrets Manager dans l'entrée du conteneur (env/volumes) sans exposer les valeurs dans les logs.
5. **Console Next.js** : connecter les pages Overview/Performance/Risk/Events/Actions aux endpoints orchestrateur, ajouter auth JWT.
6. **Billing** : brancher le webhook PayPal existant, refuser les actions si `subscription_status != active`.
7. **Sauvegarde/restore** : tester `backup-client.sh` et `restore-client.sh` avec un tenant de test.
8. **Durcissement** : valider les quotas CPU/RAM/PIDs, activer `read_only` sur les conteneurs bots quand applicable.
9. **Migration ECS/Fargate (option)** : translater les jobs vers des tâches Fargate avec IAM Task Role et stockage EFS.
