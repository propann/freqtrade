"""Research-only 15m retracement strategy with a 4h market-regime filter."""

from pandas import DataFrame
import talib.abstract as ta
from technical import qtpylib

from freqtrade.strategy import IStrategy, DecimalParameter, IntParameter, informative


class GenesisRelic(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    process_only_new_candles = True
    startup_candle_count = 200
    minimal_roi = {"720": 0.02, "360": 0.04, "180": 0.08, "60": 0.15, "0": 0.25}
    stoploss = -0.08
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.03
    trailing_only_offset_is_reached = True
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    buy_rsi = IntParameter(25, 40, default=32, space="buy", optimize=True)
    buy_fib_level = DecimalParameter(0.5, 0.8, default=0.618, decimals=3, space="buy", optimize=True)
    sell_rsi = IntParameter(65, 80, default=72, space="sell", optimize=True)

    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 2},
            {"method": "StoplossGuard", "lookback_period_candles": 48, "trade_limit": 3, "stop_duration_candles": 8, "only_per_pair": False},
            {"method": "MaxDrawdown", "calculation_mode": "equity", "lookback_period_candles": 96, "trade_limit": 10, "stop_duration_candles": 12, "max_allowed_drawdown": 0.15},
        ]

    @informative("4h")
    def populate_indicators_4h(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)
        return dataframe

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        macd = ta.MACD(dataframe)
        dataframe["macd"] = macd["macd"]
        dataframe["macd_signal"] = macd["macdsignal"]
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        bands = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=2)
        dataframe["bb_lower"] = bands["lower"]
        dataframe["bb_upper"] = bands["upper"]
        max_price = dataframe["high"].rolling(200).max()
        min_price = dataframe["low"].rolling(200).min()
        dataframe["fib_level"] = max_price - (max_price - min_price) * self.buy_fib_level.value
        dataframe["volume_mean_50"] = dataframe["volume"].rolling(50).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe["ema50_4h"] > dataframe["ema200_4h"] * 0.98)
            & (dataframe["close"] <= dataframe["fib_level"] * 1.01)
            & (dataframe["rsi"] < self.buy_rsi.value)
            & (dataframe["close"] <= dataframe["bb_lower"] * 1.02)
            & qtpylib.crossed_above(dataframe["macd"], dataframe["macd_signal"])
            & (dataframe["volume"] > dataframe["volume_mean_50"])
            & (dataframe["volume"] > 0)
        )
        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "retrace_with_regime")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = ((dataframe["rsi"] > self.sell_rsi.value) | (dataframe["close"] >= dataframe["bb_upper"]) | qtpylib.crossed_below(dataframe["macd"], dataframe["macd_signal"])) & (dataframe["volume"] > 0)
        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "retrace_exit")
        return dataframe
