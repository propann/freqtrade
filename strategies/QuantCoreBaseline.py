"""Baseline spot strategy for research and dry-run validation only."""

from pandas import DataFrame
import talib.abstract as ta
from technical import qtpylib

from freqtrade.strategy import DecimalParameter, IStrategy, IntParameter


class QuantCoreBaseline(IStrategy):
    """Simple trend/pullback baseline with explicit risk protections.

    This is deliberately small: every indicator has a clear role and every
    parameter must earn its place through out-of-sample validation.
    """

    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    process_only_new_candles = True
    startup_candle_count = 240

    minimal_roi = {
        "240": 0.0,
        "120": 0.01,
        "60": 0.02,
        "0": 0.04,
    }
    stoploss = -0.08
    trailing_stop = False
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    buy_rsi = IntParameter(38, 52, default=45, space="buy", optimize=True, load=True)
    buy_adx = IntParameter(18, 35, default=23, space="buy", optimize=True, load=True)
    exit_rsi = IntParameter(62, 80, default=70, space="sell", optimize=True, load=True)
    volume_factor = DecimalParameter(0.8, 1.5, default=1.0, decimals=2, space="buy", optimize=True, load=True)

    order_types = {
        "entry": "limit",
        "exit": "limit",
        "stoploss": "market",
        "stoploss_on_exchange": False,
    }
    order_time_in_force = {"entry": "GTC", "exit": "GTC"}

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
            {
                "method": "LowProfitPairs",
                "lookback_period_candles": 48,
                "trade_limit": 3,
                "stop_duration_candles": 12,
                "required_profit": 0.0,
                "only_per_pair": True,
            },
        ]

    plot_config = {
        "main_plot": {
            "ema50": {"color": "#38bdf8"},
            "ema200": {"color": "#f59e0b"},
        },
        "subplots": {
            "RSI": {"rsi": {"color": "#a78bfa"}},
            "ADX": {"adx": {"color": "#10b981"}},
        },
    }

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        dataframe["volume_mean_20"] = dataframe["volume"].rolling(20).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe["ema50"] > dataframe["ema200"])
            & (dataframe["close"] > dataframe["ema50"])
            & qtpylib.crossed_above(dataframe["rsi"], self.buy_rsi.value)
            & (dataframe["adx"] > self.buy_adx.value)
            & (dataframe["volume"] > dataframe["volume_mean_20"] * self.volume_factor.value)
            & (dataframe["volume"] > 0)
        )
        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "trend_pullback")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        momentum_exit = qtpylib.crossed_above(dataframe["rsi"], self.exit_rsi.value)
        trend_exit = qtpylib.crossed_below(dataframe["close"], dataframe["ema50"])
        dataframe.loc[
            (momentum_exit | trend_exit) & (dataframe["volume"] > 0),
            ["exit_long", "exit_tag"],
        ] = (1, "momentum_or_trend_exit")
        return dataframe
