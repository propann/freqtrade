# Estimation de coûts AWS (indicatif)

Hypothèses MVP (us-east-1 ou eu-west-3) :
- **EC2 t3.medium** (2 vCPU / 4 GiB) : ~ $35/mois (On-Demand) + stockage EBS gp3 50 GiB (~$5/mois).
- **S3** : snapshots et backups (~$0.023/Go/mois). Prévoir +10% pour PUT/GET selon fréquence.
- **Secrets Manager** : ~$0.40/secret/mois + appels API (tarif faible au MVP).
- **SSM Parameter Store** (standard) : $0.05/10k transactions.
- **Data transfer** : négligeable en interne VPC; surveiller les sorties Internet/CloudFront.

Optimisations :
- Instances réservées ou Savings Plans une fois la charge stabilisée.
- EBS gp3 ajusté (IOPS/throughput) selon besoins réels.
- Nettoyage automatique des backups S3 via lifecycle policies.
