"""Mean-reversion strategy using Bollinger Bands and RSI, 15min.

Recovered from an external chat session (2026-08-23), not yet backtested or
reviewed in this repo. Treat as a research candidate only.
"""
from pandas import DataFrame
import talib.abstract as ta
from technical import qtpylib
from freqtrade.strategy import IStrategy, IntParameter, DecimalParameter


class RSIBollingerStrategy(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    process_only_new_candles = True
    startup_candle_count = 200

    minimal_roi = {
        "120": 0.0,
        "60": 0.01,
        "30": 0.02,
        "0": 0.04,
    }
    stoploss = -0.08
    trailing_stop = False
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    buy_rsi = IntParameter(20, 40, default=30, space="buy", optimize=True)
    sell_rsi = IntParameter(65, 80, default=70, space="sell", optimize=True)
    bb_std = DecimalParameter(1.5, 2.5, default=2.0, decimals=1, space="buy", optimize=True)

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
        bollinger = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=self.bb_std.value)
        dataframe['bb_lower'] = bollinger['lower']
        dataframe['bb_mid'] = bollinger['mid']
        dataframe['bb_upper'] = bollinger['upper']
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        macd = ta.MACD(dataframe)
        dataframe['macd_hist'] = macd['macdhist']
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe['close'] < dataframe['bb_lower'])
            & (dataframe['rsi'] < self.buy_rsi.value)
            & (dataframe['macd_hist'] > 0)  # début de retournement haussier
            & (dataframe['volume'] > 0)
        )
        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "bb_lower_rsi")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            ((dataframe['close'] > dataframe['bb_upper']) | (dataframe['rsi'] > self.sell_rsi.value))
            & (dataframe['volume'] > 0)
        )
        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "bb_upper_or_rsi")
        return dataframe
