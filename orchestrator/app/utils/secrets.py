import json
import logging
from typing import Dict, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class VaultService:
    """Service de gestion des secrets via AWS Secrets Manager et SSM."""

    def __init__(self, region_name: str = "eu-west-3") -> None:
        self.region_name = region_name
        self.session = boto3.Session(region_name=self.region_name)
        self.secrets_client = self.session.client("secretsmanager")
        self.ssm_client = self.session.client("ssm")

    def get_exchange_keys(self, tenant_id: str) -> Optional[Dict[str, str]]:
        """
        Récupère les clés d'API d'un tenant spécifique.
        Format attendu dans Secrets Manager : {"api_key": "...", "api_secret": "..."}
        """
        secret_id = f"fta/clients/{tenant_id}/exchange_config"
        try:
            response = self.secrets_client.get_secret_value(SecretId=secret_id)
            if "SecretString" in response:
                return json.loads(response["SecretString"])
            return None
        except ClientError as exc:
            logger.error("Erreur lors de la récupération du secret pour le tenant %s: %s", tenant_id, exc)
            return None

    def get_global_param(self, param_path: str) -> Optional[str]:
        """Récupère un paramètre global (ex: URL de webhook) via SSM Parameter Store."""
        try:
            response = self.ssm_client.get_parameter(Name=param_path, WithDecryption=True)
            return response["Parameter"]["Value"]
        except ClientError as exc:
            logger.error("Erreur SSM sur %s: %s", param_path, exc)
            return None


vault = VaultService()
