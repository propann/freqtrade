"""
StratyxAdaptedStrategy
======================

Cette stratégie illustre comment mettre en pratique les principes de base de
Freqtrade tout en réduisant les écarts entre les performances obtenues en
backtest et la réalité du marché.  Elle combine des indicateurs classiques
(moyennes mobiles exponentielles et RSI) et ajoute plusieurs paramètres pour
mieux gérer l’exécution des ordres en situation réelle.

Points clés :
-------------

* **Indicateurs :** La stratégie utilise un croisement de deux moyennes
  exponentielles (EMA 12 et EMA 26) pour identifier la tendance et un RSI
  (Relative Strength Index) sur 14 périodes pour détecter les zones de
  survente/surachat.
* **Entrées :** Un signal d’achat est déclenché lorsque la tendance est
  haussière (EMA 12 > EMA 26) et que le RSI est inférieur à 30 (survente).
* **Sorties :** Un signal de vente est déclenché lorsque la tendance se
  retourne à la baisse (EMA 12 < EMA 26) ou lorsque le RSI dépasse 70
  (surachat).
* **Gestion du risque :** Un stop loss fixe à −5 % protège le capital.  La
  structure `minimal_roi` fixe des objectifs de profits progressifs (2 % dès
  l’ouverture, 1 % après une heure, puis plus aucun objectif au bout de trois
  heures).
* **Exécution des ordres :** L’utilisation d’ordres **market** à l’entrée
  réduit les problèmes de non-exécution ou de remplissage partiel relevés en
  condition live.  Les ordres de sortie restent des ordres **limit** afin
  d’obtenir de meilleurs prix.  La politique `IOC` (Immediate or Cancel) pour
  les ordres d’entrée évite que l’ordre reste longtemps sur le carnet.
* **Ignorer les signaux expirés :** La clé `ignore_buying_expired_candle_after`
  indique qu’un signal d’achat ne doit être pris en compte que durant les 5
  premières minutes d’une bougie d’une heure.  Au-delà, il est ignoré pour
  éviter les achats tardifs qui dégradent les performances en réel【88187527129371†L1319-L1340】.
* **Précautions anti‑look‑ahead :** La stratégie n’utilise pas de décalage
  (`shift(-1)`) ni d’indexation absolue, conformément aux bonnes pratiques pour
  éviter les biais de regard vers le futur【740490925197765†L1575-L1600】.

Il est conseillé de tester cette stratégie en backtest puis en dry‑run avant
de la déployer sur un compte réel.  N’hésitez pas à ajuster les paramètres
selon votre tolérance au risque et les caractéristiques des paires tradées.
"""

from typing import Dict, Any
import numpy  # noqa: F401  # Freqtrade ajoute automatiquement numpy
import pandas as pd
from freqtrade.strategy.interface import IStrategy
from pandas import DataFrame


class StratyxAdaptedStrategy(IStrategy):
    """Stratégie EMA/RSI avec paramètres adaptés au trading en conditions réelles."""

    # ==== Configuration de base ====
    # La stratégie utilise des bougies de 1 heure pour l’analyse.  Pour
    # améliorer la précision des backtests, utilisez l’option
    # `--timeframe-detail 5m` pour charger également des bougies en 5 minutes.
    timeframe = "1h"

    # Répartition du capital : nombre maximum de positions ouvertes en même temps
    max_open_trades = 5

    # Définition du plan de sortie (ROI).  Dès l’entrée, un premier objectif à
    # 2 % est fixé, puis 1 % après 60 minutes, et plus aucun objectif au bout de
    # 3 heures.  Au‑delà, on laisse courir la position jusqu’au signal de sortie.
    minimal_roi = {
        "0": 0.02,
        "60": 0.01,
        "180": 0.0,
    }

    # Stop loss fixe à −5 %.  Les frais étant ajoutés automatiquement, le risque
    # réel sera légèrement supérieur.
    stoploss = -0.05

    # Le trailing stop est désactivé pour cette stratégie simple.  Vous pouvez
    # l’activer en définissant `trailing_stop = True` et en ajustant les
    # paramètres correspondants.
    trailing_stop = False

    # ==== Paramètres d’exécution des ordres ====
    # Utiliser des ordres Market pour l’entrée permet de réduire les problèmes
    # d’exécution tardive relevés dans les discussions du projet.  L’ordre est
    # exécuté immédiatement ou annulé (IOC).  Les sorties restent en limit.
    order_types = {
        "entry": "market",
        "exit": "limit",
        "emergency_exit": "market",
        "force_entry": "market",
        "force_exit": "market",
        "stoploss": "market",
        "stoploss_on_exchange": False,
    }

    order_time_in_force = {
        "entry": "IOC",
        "exit": "GTC",
    }

    # Ignore les signaux d’achat trop anciens : 300 s = 5 minutes sur une
    # bougie horaire【88187527129371†L1319-L1340】.
    ignore_buying_expired_candle_after: int = 300

    # ==== Indicateurs personnalisés ====
    ema_fast_period: int = 12
    ema_slow_period: int = 26
    rsi_period: int = 14

    def populate_indicators(self, dataframe: DataFrame, metadata: Dict[str, Any]) -> DataFrame:
        """Calcule les indicateurs nécessaires à la stratégie."""
        # Assurer que les colonnes existent
        if dataframe.empty:
            return dataframe

        # Moyennes mobiles exponentielles
        dataframe["ema_fast"] = dataframe["close"].ewm(span=self.ema_fast_period, adjust=False).mean()
        dataframe["ema_slow"] = dataframe["close"].ewm(span=self.ema_slow_period, adjust=False).mean()

        # RSI
        delta = dataframe["close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)
        roll_up = gain.rolling(self.rsi_period).mean()
        roll_down = loss.rolling(self.rsi_period).mean()
        rs = roll_up / roll_down
        dataframe["rsi"] = 100 - (100 / (1 + rs))

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: Dict[str, Any]) -> DataFrame:
        """Détermine les conditions d’entrée en position longue."""
        # Conditions : tendance haussière et RSI en survente
        dataframe["enter_long"] = (
            (dataframe["ema_fast"] > dataframe["ema_slow"]) &
            (dataframe["rsi"] < 30)
        ).astype(int)

        # Cette stratégie ne prend pas de positions short
        dataframe["enter_short"] = 0

        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: Dict[str, Any]) -> DataFrame:
        """Détermine les conditions de sortie de position longue."""
        # Sortie si la tendance s’inverse ou si le RSI indique une surachat
        dataframe["exit_long"] = (
            (dataframe["ema_fast"] < dataframe["ema_slow"]) |
            (dataframe["rsi"] > 70)
        ).astype(int)

        # Pas de positions short
        dataframe["exit_short"] = 0

        return dataframe