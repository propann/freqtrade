"""
Genesis-Relic - Stratégie multi-timeframe (4h/15m) pensée à l'origine pour
PEPE/USDT dans une conversation externe (2026-08-23).

CAVEAT: la conversation source justifie l'entrée/sortie par des lectures de
"psychologie humaine" (panique/FOMO) sans données à l'appui, et projette un
+520%/mois sur la seule base d'un décompte manuel de mouvements passés (pas
un backtest). Traiter comme une candidate de recherche brute : à passer par
scripts/researchctl (plan / validate / oos) avant toute activation, et sur
un actif aussi volatil qu'un memecoin, s'attendre à un slippage et des gaps
que ce fichier ne modélise pas.
"""

from pandas import DataFrame
import talib.abstract as ta
from freqtrade.strategy import IStrategy, IntParameter, DecimalParameter, informative
from freqtrade.vendor.qtpylib import indicators as qtpylib


class GenesisRelic(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False

    # ----- Timeframes -----
    timeframe = '4h'  # Pour la tendance
    process_only_new_candles = True
    startup_candle_count = 200

    # ----- Gestion des gains -----
    minimal_roi = {
        "0": 0.02,
        "60": 0.04,
        "180": 0.08,
        "360": 0.15,
        "720": 0.25,
    }

    # ----- Protection contre les pertes -----
    stoploss = -0.08
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.03
    trailing_only_offset_is_reached = True

    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    # ----- Paramètres -----
    buy_rsi = IntParameter(25, 40, default=32, space='buy', optimize=True)
    buy_fib_level = DecimalParameter(0.5, 0.8, default=0.618, decimals=3, space='buy', optimize=True)
    sell_rsi = IntParameter(65, 80, default=72, space='sell', optimize=True)

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
        macd = ta.MACD(dataframe)
        dataframe['macd'] = macd['macd']
        dataframe['macd_signal'] = macd['macd_signal']
        dataframe['macd_hist'] = macd['macd_hist']
        dataframe['rsi_15m'] = ta.RSI(dataframe, timeperiod=14)
        dataframe['atr_15m'] = ta.ATR(dataframe, timeperiod=14)
        return dataframe

    # ---------- Indicateurs sur le timeframe principal (4h) ----------
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe['ema50'] = ta.EMA(dataframe, timeperiod=50)
        dataframe['ema200'] = ta.EMA(dataframe, timeperiod=200)

        bollinger = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=2)
        dataframe['bb_lower'] = bollinger['lower']
        dataframe['bb_mid'] = bollinger['mid']
        dataframe['bb_upper'] = bollinger['upper']

        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        dataframe['atr'] = ta.ATR(dataframe, timeperiod=14)

        # Retracement de Fibonacci sur les 200 dernières bougies
        max_price = dataframe['high'].rolling(200).max()
        min_price = dataframe['low'].rolling(200).min()
        range_price = max_price - min_price
        dataframe['fib_0618'] = max_price - range_price * self.buy_fib_level.value

        dataframe['volume_mean_50'] = dataframe['volume'].rolling(50).mean()

        return dataframe

    # ---------- Signal d'entrée ----------
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe['close'] <= dataframe['fib_0618'] * 1.01)
            & (dataframe['rsi'] < self.buy_rsi.value)
            & (dataframe['close'] <= dataframe['bb_lower'] * 1.02)
            & qtpylib.crossed_above(dataframe['macd_15m'], dataframe['macd_signal_15m'])
            & (dataframe['volume'] > dataframe['volume_mean_50'])
            & (dataframe['ema50'] > dataframe['ema200'] * 0.98)
            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "human_panic_buy")
        return dataframe

    # ---------- Signal de sortie ----------
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (
                (dataframe['rsi'] > self.sell_rsi.value)
                | (dataframe['close'] >= dataframe['bb_upper'])
                | qtpylib.crossed_below(dataframe['macd_15m'], dataframe['macd_signal_15m'])
            )
            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "human_fomo_sell")
        return dataframe
