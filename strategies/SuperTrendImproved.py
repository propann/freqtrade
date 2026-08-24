"""SuperTrend strategy with volume and RSI filter, 1h timeframe.

Recovered from an external chat session (2026-08-23), not yet backtested or
reviewed in this repo. Treat as a research candidate only.

Known caveat carried over from the source: the Supertrend calculation below
is a plain Python loop over the whole dataframe (O(n), re-run every candle
by Freqtrade), not a vectorized pandas/numpy computation. It is functionally
correct but noticeably slower than the rest of the strategies in this repo
on long backtests. Left as-is pending a real validation pass; consider
vectorizing before hyperopt on large timeranges.
"""
from pandas import DataFrame
import pandas as pd
import talib.abstract as ta
from freqtrade.strategy import IStrategy, IntParameter
import numpy as np


class SuperTrendImproved(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = "1h"
    process_only_new_candles = True
    startup_candle_count = 200

    minimal_roi = {
        "360": 0.0,
        "180": 0.01,
        "90": 0.02,
        "0": 0.04,
    }
    stoploss = -0.08
    trailing_stop = False
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    # Paramètres optimisables
    st_period = IntParameter(7, 14, default=10, space="buy", optimize=True)
    st_multiplier = IntParameter(2, 4, default=3, space="buy", optimize=True)
    rsi_buy_threshold = IntParameter(30, 55, default=50, space="buy", optimize=True)
    rsi_sell_threshold = IntParameter(65, 80, default=70, space="sell", optimize=True)

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
        # Supertrend
        df = dataframe.copy()
        df['TR'] = ta.TRANGE(df)
        df['ATR'] = ta.SMA(df['TR'], self.st_period.value)
        # Calcul du Supertrend (code simplifié, adapté de la stratégie Supertrend.py)
        st_period = self.st_period.value
        multiplier = self.st_multiplier.value
        df['basic_ub'] = (df['high'] + df['low']) / 2 + multiplier * df['ATR']
        df['basic_lb'] = (df['high'] + df['low']) / 2 - multiplier * df['ATR']
        df['final_ub'] = 0.0
        df['final_lb'] = 0.0
        final_ub_index = df.columns.get_loc('final_ub')
        final_lb_index = df.columns.get_loc('final_lb')
        for i in range(st_period, len(df)):
            prev_ub = df['final_ub'].iat[i - 1]
            prev_lb = df['final_lb'].iat[i - 1]
            close_prev = df['close'].iat[i - 1]
            ub = df['basic_ub'].iat[i]
            lb = df['basic_lb'].iat[i]
            df.iat[i, final_ub_index] = ub if ub < prev_ub or close_prev > prev_ub else prev_ub
            df.iat[i, final_lb_index] = lb if lb > prev_lb or close_prev < prev_lb else prev_lb
        df['st'] = 0.0
        st_index = df.columns.get_loc('st')
        for i in range(st_period, len(df)):
            prev_st = df['st'].iat[i - 1]
            close = df['close'].iat[i]
            ub = df['final_ub'].iat[i]
            lb = df['final_lb'].iat[i]
            if prev_st == ub and close <= ub:
                df.iat[i, st_index] = ub
            elif prev_st == ub and close > ub:
                df.iat[i, st_index] = lb
            elif prev_st == lb and close >= lb:
                df.iat[i, st_index] = lb
            elif prev_st == lb and close < lb:
                df.iat[i, st_index] = ub
            else:
                df.iat[i, st_index] = 0.0
        # Direction
        # NOTE: source used the removed `np.NaN` alias (dropped in NumPy 2.x);
        # fixed to `np.nan` so this actually imports/runs.
        df['stx'] = pd.Series(
            np.where((df['st'] > 0.0), np.where((df['close'] < df['st']), 'down', 'up'), None),
            index=df.index,
            dtype='object',
        )
        dataframe['stx'] = df['stx']
        # Indicateurs supplémentaires
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        dataframe['volume_mean_20'] = dataframe['volume'].rolling(20).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe['stx'] == 'up')
            & (dataframe['rsi'] < self.rsi_buy_threshold.value)
            & (dataframe['volume'] > dataframe['volume_mean_20'])
            & (dataframe['volume'] > 0)
        )
        dataframe.loc[conditions, ["enter_long", "enter_tag"]] = (1, "supertrend_up")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            ((dataframe['stx'] == 'down') | (dataframe['rsi'] > self.rsi_sell_threshold.value))
            & (dataframe['volume'] > 0)
        )
        dataframe.loc[conditions, ["exit_long", "exit_tag"]] = (1, "supertrend_down_or_rsi")
        return dataframe
