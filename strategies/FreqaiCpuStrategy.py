"""CPU-only FreqAI execution candidate.

It is shipped dry-run only.  A live configuration is an operator decision made
on the VPS after independent validation, never a code default.
"""

from pandas import DataFrame
import talib.abstract as ta

from freqtrade.strategy import IStrategy


class FreqaiCpuStrategy(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "15m"
    startup_candle_count = 40
    process_only_new_candles = True
    minimal_roi = {"180": 0.0, "60": 0.015, "0": 0.03}
    stoploss = -0.04
    use_exit_signal = True

    def feature_engineering_expand_all(self, dataframe: DataFrame, period: int, metadata: dict, **kwargs) -> DataFrame:
        dataframe["%-rsi"] = ta.RSI(dataframe, timeperiod=period)
        dataframe["%-adx"] = ta.ADX(dataframe, timeperiod=period)
        dataframe["%-ema"] = ta.EMA(dataframe, timeperiod=period)
        dataframe["%-roc"] = ta.ROC(dataframe, timeperiod=period)
        return dataframe

    def feature_engineering_expand_basic(self, dataframe: DataFrame, metadata: dict, **kwargs) -> DataFrame:
        dataframe["%-pct_change"] = dataframe["close"].pct_change()
        dataframe["%-volume"] = dataframe["volume"]
        return dataframe

    def set_freqai_targets(self, dataframe: DataFrame, metadata: dict, **kwargs) -> DataFrame:
        horizon = self.freqai_info["feature_parameters"]["label_period_candles"]
        dataframe["&-return"] = dataframe["close"].shift(-horizon) / dataframe["close"] - 1
        return dataframe

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        return self.freqai.start(dataframe, metadata, self)

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[(dataframe["do_predict"] == 1) & (dataframe["&-return"] > 0.012) & (dataframe["volume"] > 0), ["enter_long", "enter_tag"]] = (1, "freqai_cpu_long")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[((dataframe["do_predict"] != 1) | (dataframe["&-return"] < -0.004)) & (dataframe["volume"] > 0), ["exit_long", "exit_tag"]] = (1, "freqai_cpu_exit")
        return dataframe
