"""Trend Retracement with ATR Filter - 15min, robust and simple.

Recovered from an external chat session (2026-08-23), not yet backtested or
reviewed in this repo. Treat as a research candidate only: run it through
scripts/researchctl (plan / validate / oos) before any dry-run activation.
"""
from pandas import DataFrame
import talib.abstract as ta
from technical import qtpylib
from freqtrade.strategy import DecimalParameter, IStrategy, IntParameter


class TrendRetracementATR(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    process_only_new_candles = True
    startup_candle_count = 200

    minimal_roi = {
        "180": 0.0,
        "90": 0.01,
        "45": 0.025,
        "0": 0.05,
    }
    stoploss = -0.10
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.03
    trailing_only_offset_is_reached = True
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    buy_rsi = IntParameter(30, 50, default=40, space="buy", optimize=True)
    buy_macd_hist = DecimalParameter(0.001, 0.05, default=0.01, decimals=3, space="buy", optimize=True)
    atr_multiplier = DecimalParameter(0.5, 2.0, default=1.0, decimals=1, space="buy", optimize=True)
    exit_rsi = IntParameter(65, 85, default=75, space="sell", optimize=True)

    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 2},
            {"method": "StoplossGuard", "lookback_period_candles": 48, "trade_limit": 3,
             "stop_duration_candles": 8, "only_per_pair": False},
            {"method": "MaxDrawdown", "calculation_mode": "equity", "lookback_period_candles": 96,
             "trade_limit": 10, "stop_duration_candles": 12, "max_allowed_drawdown": 0.15},
        ]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        macd = ta.MACD(dataframe)
        dataframe["macd"] = macd["macd"]
        dataframe["signal"] = macd["macdsignal"]
        dataframe["macd_hist"] = macd["macdhist"]
        # Bande ATR autour de l'EMA50
        dataframe["atr_upper"] = dataframe["ema50"] + self.atr_multiplier.value * dataframe["atr"]
        dataframe["atr_lower"] = dataframe["ema50"] - self.atr_multiplier.value * dataframe["atr"]
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe["ema50"] > dataframe["ema200"])
            & (dataframe["close"] <= dataframe["atr_upper"])
            & (dataframe["close"] >= dataframe["atr_lower"])
            & qtpylib.crossed_above(dataframe["macd"], dataframe["signal"])
            & (dataframe["macd_hist"] > self.buy_macd_hist.value)
            & (dataframe["rsi"] < self.buy_rsi.value)
            & (dataframe["volume"] > 0)
        )
        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "trend_retracement")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            ((dataframe["rsi"] > self.exit_rsi.value) | (dataframe["close"] < dataframe["ema50"]))
            & (dataframe["volume"] > 0)
        )
        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "exit_rsi_or_trend")
        return dataframe
