"""Modernized Ichimoku research strategy derived from the supplied ichiV1.py.

Research and dry-run only. This version keeps OHLCV intact, uses the Freqtrade
v3 signal interface and avoids indicators that are not part of a decision.
"""

from pandas import DataFrame
import talib.abstract as ta

from freqtrade.strategy import DecimalParameter, IStrategy, IntParameter
from freqtrade.vendor.qtpylib import indicators as qtpylib


class IchiV1Research(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    process_only_new_candles = True
    startup_candle_count = 240

    minimal_roi = {"180": 0.0, "90": 0.01, "45": 0.02, "0": 0.035}
    stoploss = -0.08
    trailing_stop = False
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    entry_adx = IntParameter(18, 35, default=22, space="buy", optimize=True, load=True)
    entry_gain = DecimalParameter(1.000, 1.010, default=1.002, decimals=3, space="buy", optimize=True, load=True)
    exit_rsi = IntParameter(60, 80, default=70, space="sell", optimize=True, load=True)

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

    plot_config = {
        "main_plot": {
            "ema_fast": {"color": "#38bdf8"},
            "ema_slow": {"color": "#f59e0b"},
            "senkou_a": {"color": "#10b981", "fill_to": "senkou_b", "fill_label": "Ichimoku"},
            "senkou_b": {"color": "#ef4444"},
        },
        "subplots": {
            "ADX": {"adx": {"color": "#a78bfa"}},
            "ATR": {"atr": {"color": "#f97316"}},
            "RSI": {"rsi": {"color": "#22d3ee"}},
        },
    }

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        heikin = qtpylib.heikinashi(dataframe)
        dataframe["ha_open"] = heikin["open"]
        dataframe["ha_close"] = heikin["close"]

        dataframe["ema_fast"] = ta.EMA(dataframe["ha_close"], timeperiod=30)
        dataframe["ema_slow"] = ta.EMA(dataframe["ha_close"], timeperiod=120)
        dataframe["trend_strength"] = dataframe["ema_fast"] / dataframe["ema_slow"]
        dataframe["trend_gain"] = dataframe["trend_strength"] / dataframe["trend_strength"].shift(1)

        conversion = (
            dataframe["high"].rolling(20).max() + dataframe["low"].rolling(20).min()
        ) / 2
        base = (
            dataframe["high"].rolling(60).max() + dataframe["low"].rolling(60).min()
        ) / 2
        dataframe["tenkan_sen"] = conversion
        dataframe["kijun_sen"] = base
        dataframe["senkou_a"] = ((conversion + base) / 2).shift(30)
        dataframe["senkou_b"] = (
            (dataframe["high"].rolling(120).max() + dataframe["low"].rolling(120).min()) / 2
        ).shift(30)

        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        dataframe["volume_mean_20"] = dataframe["volume"].rolling(20).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        entry = (
            (dataframe["close"] > dataframe["senkou_a"])
            & (dataframe["close"] > dataframe["senkou_b"])
            & (dataframe["close"] > dataframe["kijun_sen"])
            & (dataframe["ema_fast"] > dataframe["ema_slow"])
            & (dataframe["trend_gain"] >= self.entry_gain.value)
            & (dataframe["adx"] > self.entry_adx.value)
            & (dataframe["volume"] > dataframe["volume_mean_20"])
            & (dataframe["volume"] > 0)
        )
        dataframe.loc[entry, ["enter_long", "enter_tag"]] = (1, "ichi_trend")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        exit_signal = (
            qtpylib.crossed_below(dataframe["close"], dataframe["kijun_sen"])
            | qtpylib.crossed_above(dataframe["rsi"], self.exit_rsi.value)
        ) & (dataframe["volume"] > 0)
        dataframe.loc[exit_signal, ["exit_long", "exit_tag"]] = (1, "ichi_or_momentum_exit")
        return dataframe
