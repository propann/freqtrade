"""
Genesis-Micro - Version 1h/DOGE-USDT taillée pour un tout petit capital
(~60€), issue de la même conversation externe (2026-08-23) que GenesisRelic.

C'est la version la plus aboutie de la lignée "Genesis" dans cette
conversation (elle remplace un brouillon intermédiaire "GenesisRelicMini"
qui n'a pas été conservé ici pour éviter le doublon).

CAVEAT: la projection "+37.5% en 30 jours" citée dans la conversation source
est une simulation arithmétique (taux de réussite supposé à 60%, gains/
pertes moyens supposés), pas un résultat de backtest sur ce fichier. À
passer par scripts/researchctl avant toute activation via le Quant Rack, et
à re-tester spécifiquement avec stake_amount=10 / max_open_trades=1 tel que
décrit dans la conversation si l'intention reste un test à faible capital.
"""

from pandas import DataFrame
import talib.abstract as ta
from freqtrade.strategy import IStrategy, IntParameter
from freqtrade.vendor.qtpylib import indicators as qtpylib


class GenesisMicro(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False

    # ----- Timeframes -----
    timeframe = '1h'
    process_only_new_candles = True
    startup_candle_count = 100
    max_open_trades = 1  # Une seule position à la fois

    # ----- Gestion des gains -----
    minimal_roi = {
        "0": 0.01,
        "60": 0.02,
        "180": 0.04,
        "480": 0.08,
    }

    # ----- Gestion des pertes -----
    stoploss = -0.05
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.015
    trailing_only_offset_is_reached = True

    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    # ----- Paramètres -----
    buy_rsi = IntParameter(25, 40, default=30, space='buy')
    sell_rsi = IntParameter(65, 80, default=72, space='sell')
    bb_period = IntParameter(15, 25, default=20, space='buy')

    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 2},
            {"method": "MaxDrawdown", "calculation_mode": "equity", "lookback_period_candles": 48,
             "trade_limit": 5, "stop_duration_candles": 12, "max_allowed_drawdown": 0.10},
        ]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe['ema50'] = ta.EMA(dataframe, timeperiod=50)
        dataframe['ema200'] = ta.EMA(dataframe, timeperiod=200)

        bollinger = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=self.bb_period.value, stds=2)
        dataframe['bb_lower'] = bollinger['lower']
        dataframe['bb_upper'] = bollinger['upper']
        dataframe['bb_mid'] = bollinger['mid']

        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)

        macd = ta.MACD(dataframe)
        dataframe['macd'] = macd['macd']
        dataframe['macd_signal'] = macd['macd_signal']
        dataframe['macd_hist'] = macd['macd_hist']

        dataframe['volume_mean_20'] = dataframe['volume'].rolling(20).mean()
        dataframe['atr'] = ta.ATR(dataframe, timeperiod=14)

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe['close'] <= dataframe['bb_lower'] * 1.005)
            & (dataframe['rsi'] < self.buy_rsi.value)
            & qtpylib.crossed_above(dataframe['macd'], dataframe['macd_signal'])
            & (dataframe['macd_hist'] > dataframe['macd_hist'].shift(1))
            & (dataframe['volume'] > dataframe['volume_mean_20'])
            & (dataframe['volume'] < dataframe['volume_mean_20'] * 5)
            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "micro_buy")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (
                (dataframe['rsi'] > self.sell_rsi.value)
                | (dataframe['close'] >= dataframe['bb_upper'])
                | qtpylib.crossed_below(dataframe['macd'], dataframe['macd_signal'])
                | ((dataframe['rsi'] > 65) & (dataframe['close'] > dataframe['bb_mid'] * 1.02))
            )
            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "micro_sell")
        return dataframe
