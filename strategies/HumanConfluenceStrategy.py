"""Research-only 15m pullback strategy with a 1h trend filter.

Compatibility repair of an external candidate: the source's intended 15m
entry confirmation is now the base timeframe, with the 1h trend merged as
informative data in the direction supported by Freqtrade.
"""

from pandas import DataFrame
import talib.abstract as ta
from technical import qtpylib

from freqtrade.strategy import IStrategy, DecimalParameter, IntParameter, informative


class HumanConfluenceStrategy(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    process_only_new_candles = True
    startup_candle_count = 200
    minimal_roi = {"240": 0.0, "120": 0.02, "60": 0.04, "0": 0.08}
    stoploss = -0.10
    trailing_stop = True
    trailing_stop_positive = 0.015
    trailing_stop_positive_offset = 0.02
    trailing_only_offset_is_reached = True
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    buy_rsi = IntParameter(30, 50, default=40, space="buy", optimize=True)
    buy_bb_position = DecimalParameter(0.8, 1.2, default=1.0, decimals=1, space="buy", optimize=True)
    sell_rsi = IntParameter(70, 85, default=75, space="sell", optimize=True)

    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 2},
            {"method": "StoplossGuard", "lookback_period_candles": 48, "trade_limit": 3, "stop_duration_candles": 8, "only_per_pair": False},
            {"method": "MaxDrawdown", "calculation_mode": "equity", "lookback_period_candles": 96, "trade_limit": 10, "stop_duration_candles": 12, "max_allowed_drawdown": 0.15},
        ]

    @informative("1h")
    def populate_indicators_1h(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)
        return dataframe

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        macd = ta.MACD(dataframe)
        dataframe["macd"] = macd["macd"]
        dataframe["macd_signal"] = macd["macdsignal"]
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        dataframe["volume_mean_50"] = dataframe["volume"].rolling(50).mean()
        bands = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=2)
        dataframe["bb_lower"] = bands["lower"]
        dataframe["bb_mid"] = bands["mid"]
        dataframe["support_zone"] = dataframe[["bb_lower", "bb_mid"]].min(axis=1)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe["ema50_1h"] > dataframe["ema200_1h"])
            & (dataframe["close"] > dataframe["ema200_1h"])
            & (dataframe["close"] <= dataframe["support_zone"] * self.buy_bb_position.value)
            & (dataframe["rsi"] < self.buy_rsi.value)
            & qtpylib.crossed_above(dataframe["macd"], dataframe["macd_signal"])
            & (dataframe["volume"] > dataframe["volume_mean_50"])
            & (dataframe["volume"] > 0)
        )
        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "trend_pullback")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = ((dataframe["rsi"] > self.sell_rsi.value) | (dataframe["close"] < dataframe["bb_mid"])) & (dataframe["volume"] > 0)
        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "momentum_exit")
        return dataframe
