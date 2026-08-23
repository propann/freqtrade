"""
HumanConfluenceStrategy - Stratégie qui imite l'analyse d'un trader humain.
- Timeframe principal : 1h pour la tendance.
- Timeframe informatif : 15min pour la confirmation d'entrée.
- Achète les replis en tendance haussière.
- Gère le risque avec un trailing stop et des protections.

Recovered from an external chat session (2026-08-23), not yet backtested or
reviewed in this repo. Treat as a research candidate only. The "human
psychology" framing in the comments is marketing language from the source
conversation, not a validated market-microstructure claim.
"""

from pandas import DataFrame
import talib.abstract as ta
from freqtrade.strategy import IStrategy, IntParameter, DecimalParameter, informative
from freqtrade.vendor.qtpylib import indicators as qtpylib


class HumanConfluenceStrategy(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False

    # Timeframe principal pour la tendance
    timeframe = '1h'
    process_only_new_candles = True
    startup_candle_count = 200

    # Stop et ROI (humain : on laisse courir les gagnants avec un trailing stop)
    minimal_roi = {
        "240": 0.0,    # Pas d'objectif fixe, on sort sur signal ou trailing
        "120": 0.02,   # 2% après 2h, mais le trailing stop est prioritaire
        "60": 0.04,    # 4% après 1h (coup de pouce)
        "0": 0.08,     # Maxi 8% (mais le trailing stop limitera)
    }
    stoploss = -0.10   # Stop large pour éviter d'être sorti par le bruit
    trailing_stop = True
    trailing_stop_positive = 0.015   # Sécurise les gains à +1.5%
    trailing_stop_positive_offset = 0.02  # Déclenché à +2%
    trailing_only_offset_is_reached = True

    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    # Paramètres optimisables (mais les valeurs par défaut sont déjà bonnes)
    buy_rsi = IntParameter(30, 50, default=40, space='buy', optimize=True)
    buy_bb_position = DecimalParameter(0.8, 1.2, default=1.0, decimals=1, space='buy', optimize=True)
    sell_rsi = IntParameter(70, 85, default=75, space='sell', optimize=True)

    # Protections (MaxDrawdown est vital pour un humain qui limite ses pertes)
    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 2},
            {
                "method": "StoplossGuard",
                "lookback_period_candles": 48,
                "trade_limit": 3,
                "stop_duration_candles": 8,
                "only_per_pair": False,
            },
            {
                "method": "MaxDrawdown",
                "calculation_mode": "equity",
                "lookback_period_candles": 96,
                "trade_limit": 10,
                "stop_duration_candles": 12,
                "max_allowed_drawdown": 0.15,
            },
        ]

    # ---------- Indicateurs sur le timeframe informatif (15min) ----------
    @informative('15m')
    def populate_indicators_15m(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Le trader humain regarde le graphique 15min pour le momentum d'entrée
        macd = ta.MACD(dataframe)
        dataframe['macd'] = macd['macd']
        dataframe['macd_signal'] = macd['macd_signal']
        dataframe['macd_hist'] = macd['macd_hist']
        dataframe['rsi_15m'] = ta.RSI(dataframe, timeperiod=14)
        return dataframe

    # ---------- Indicateurs sur le timeframe principal (1h) ----------
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Tendance (le trader humain sait où il met les pieds)
        dataframe['ema50'] = ta.EMA(dataframe, timeperiod=50)
        dataframe['ema200'] = ta.EMA(dataframe, timeperiod=200)
        dataframe['trend'] = (dataframe['ema50'] > dataframe['ema200']).astype(int)

        # Support / Résistance (les zones psychologiques)
        bollinger = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=2)
        dataframe['bb_lower'] = bollinger['lower']
        dataframe['bb_mid'] = bollinger['mid']
        dataframe['bb_upper'] = bollinger['upper']

        # Momentum (le pouls du marché)
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        dataframe['atr'] = ta.ATR(dataframe, timeperiod=14)

        # Volume (l'intérêt des autres traders)
        dataframe['volume_mean_50'] = dataframe['volume'].rolling(50).mean()

        # La zone de support "humaine" : le prix est-il proche de la BB basse ou de l'EMA50 ?
        dataframe['support_zone'] = dataframe[['bb_lower', 'ema50']].min(axis=1)
        return dataframe

    # ---------- Signal d'entrée (le déclic humain) ----------
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            # 1. Tendance : Le contexte est haussier (le trader ne va pas à contre-courant)
            (dataframe['ema50'] > dataframe['ema200'])
            & (dataframe['close'] > dataframe['ema200'])

            # 2. Support : Le prix touche sa zone de support (BB_lower ou EMA50)
            & (dataframe['close'] <= dataframe['support_zone'] * 1.01)

            # 3. Momentum (15min) : Le momentum repart à la hausse
            & (dataframe['rsi_15m'] < self.buy_rsi.value)
            & qtpylib.crossed_above(dataframe['macd_15m'], dataframe['macd_signal_15m'])

            # 4. RSI (1h) : pas de surachat sur la tendance
            & (dataframe['rsi'] < 60)

            # 5. Volume : Les acheteurs sont intéressés
            & (dataframe['volume'] > dataframe['volume_mean_50'])

            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "human_confluence_buy")
        return dataframe

    # ---------- Signal de sortie (la discipline humaine) ----------
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (
                (dataframe['rsi'] > self.sell_rsi.value)
                | (dataframe['close'] < dataframe['ema50'])
            )
            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "human_confluence_sell")
        return dataframe
