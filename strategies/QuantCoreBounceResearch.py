"""Conservative 5m capitulation-and-bounce research strategy.

This is an independent Quant Core implementation of a generic market
hypothesis: buy a confirmed short-term bounce after an unusually sharp move
below a volatility band, only while 30m and 1h regime filters are available
and non-bearish.  It is research-only and is not a promoted execution profile.
"""

from __future__ import annotations

from pandas import DataFrame
import talib.abstract as ta

from freqtrade.strategy import IStrategy, informative


class QuantCoreBounceResearch(IStrategy):
    """5m bounce candidate with conservative multi-timeframe readiness gates."""

    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "5m"
    # The 1h EMA200 needs roughly 2,400 five-minute candles before the regime
    # gate is reliable.  Starting earlier would make the indicator depend on
    # incomplete history during live boot or recursive validation.
    startup_candle_count = 2400

    minimal_roi = {"0": 0.02}
    stoploss = -0.03

    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 12},
            {
                "method": "StoplossGuard",
                "lookback_period_candles": 24,
                "trade_limit": 2,
                "stop_duration_candles": 48,
                "only_per_pair": True,
            },
        ]

    @informative("1h")
    def populate_indicators_1h(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema_50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema_200"] = ta.EMA(dataframe, timeperiod=200)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        ready = dataframe[["ema_50", "ema_200", "rsi", "adx"]].notna().all(axis=1)
        dataframe["regime_ready"] = ready.astype(int)
        dataframe["is_bear"] = (
            ready
            & (dataframe["close"] < dataframe["ema_200"])
            & (dataframe["ema_50"] < dataframe["ema_200"])
            & (dataframe["rsi"] < 50)
            & (dataframe["adx"] > 20)
        ).astype(int)
        return dataframe

    @informative("30m")
    def populate_indicators_30m(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema_20"] = ta.EMA(dataframe, timeperiod=20)
        dataframe["ema_50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        ready = dataframe[["ema_20", "ema_50", "rsi"]].notna().all(axis=1)
        dataframe["trend_ready"] = ready.astype(int)
        dataframe["in_downtrend"] = (
            ready
            & (dataframe["close"] < dataframe["ema_20"])
            & (dataframe["ema_20"] < dataframe["ema_50"])
            & (dataframe["rsi"] < 45)
        ).astype(int)
        return dataframe

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        bands = ta.BBANDS(dataframe, timeperiod=40, nbdevup=2.0, nbdevdn=2.0)
        dataframe["bb_lower"] = bands["lowerband"]
        dataframe["bb_middle"] = bands["middleband"]
        dataframe["bb_width"] = (bands["middleband"] - bands["lowerband"]).abs()
        dataframe["close_delta"] = (dataframe["close"] - dataframe["close"].shift(1)).abs()
        dataframe["lower_wick"] = (dataframe["close"] - dataframe["low"]).abs()
        dataframe["volume_mean_30"] = dataframe["volume"].rolling(30).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        capitulation = (
            (dataframe["bb_width"].shift(1) > dataframe["close"].shift(1) * 0.007)
            & (dataframe["close_delta"].shift(1) > dataframe["close"].shift(1) * 0.0175)
            & (dataframe["lower_wick"].shift(1) < dataframe["bb_width"].shift(1) * 0.25)
            & (dataframe["close"].shift(1) < dataframe["bb_lower"].shift(2))
            & (dataframe["close"].shift(1) <= dataframe["close"].shift(2))
            & (dataframe["volume"].shift(1) > 0)
            & (dataframe["volume"].shift(1) < dataframe["volume_mean_30"].shift(2) * 20)
        )
        bounce = dataframe["close"] > dataframe["close"].shift(1)
        regimes_ready = (
            (dataframe["regime_ready_1h"] == 1)
            & (dataframe["trend_ready_30m"] == 1)
            & (dataframe["is_bear_1h"] == 0)
            & (dataframe["in_downtrend_30m"] == 0)
        )
        dataframe.loc[capitulation & bounce & regimes_ready & (dataframe["volume"] > 0), "enter_long"] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["exit_long"] = 0
        return dataframe
