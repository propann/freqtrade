"""
MatrixBugScalper - Scalping 1 minute sur bandes de Bollinger, pensé pour
maximiser le nombre de trades en misant sur des ordres LIMITE (frais maker).

Recovered from an external chat session (2026-08-23). IMPORTANT CAVEATS not
present in the marketing framing of that conversation ("bug in the matrix",
500 guaranteed trades/day):
- No backtest or dry-run has ever been run on this file. The "1100€/jour"
  projection in that conversation is an unvalidated back-of-envelope
  calculation, not a measured result — and that same conversation's own
  math showed the naive fixed stoploss version going net-negative once a
  realistic 35% loss rate is applied. Do not treat the profit numbers as
  real until scripts/researchctl has actually run on this strategy.
- `use_custom_stoploss` + `custom_stoploss` below implements the "no fixed
  stoploss below -1%" idea the source conversation proposed as its own fix.
  Returning close to 1 to mean "no stop" is a known hack, not the idiomatic
  Freqtrade pattern, and effectively disables loss protection outside of
  that -1% floor — this is exactly the kind of thing this repo's
  scripts/preflight and researchctl OOS gate exist to catch. Validate this
  behaves as intended before any dry-run.
- 1-minute timeframe + limit-only entries/exits will see materially worse
  fills than assumed here on anything but the most liquid pairs; the
  strategy also runs a per-candle Python loop nowhere in this file, but the
  wider "500 trades/day" plan assumes 10-15 pairs running in parallel,
  which is a config/resource decision (max_open_trades, pairlist, CPU),
  not something this file alone provides.
"""
from datetime import datetime

from pandas import DataFrame
import talib.abstract as ta
from freqtrade.strategy import IStrategy, IntParameter, DecimalParameter
from freqtrade.vendor.qtpylib import indicators as qtpylib


class MatrixBugScalper(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False

    # ----- LE TIME FRAME DU BUG (1 minute) -----
    timeframe = '1m'
    process_only_new_candles = True
    startup_candle_count = 100

    # ----- Gestion des risques -----
    minimal_roi = {
        "0": 0.01  # Sécurité : si jamais le signal de sortie rate, on prend 1% au bout de 1min
    }
    # Stop de secours fixe (toujours requis par Freqtrade même avec un
    # custom_stoploss) ; le comportement réel est piloté par custom_stoploss
    # ci-dessous, qui laisse courir jusqu'à -1% avant de couper.
    stoploss = -0.10
    use_custom_stoploss = True
    trailing_stop = False  # Pas de trailing, on sort sur la bande haute.

    # ----- Configuration des ordres (LE BUG CONTRE LES FRAIS) -----
    # On force les ordres LIMITE pour être "Maker" et payer moins de frais.
    order_types = {
        'entry': 'limit',
        'exit': 'limit',
        'stoploss': 'market',  # Le stop loss doit être market pour protéger en cas de crash
        'stoploss_on_exchange': False
    }
    order_time_in_force = {
        'entry': 'GTC',
        'exit': 'GTC'
    }

    # ----- Paramètres Hyperopt (mais déjà calibrés) -----
    buy_rsi = IntParameter(20, 40, default=30, space='buy', optimize=True)
    sell_rsi = IntParameter(60, 80, default=70, space='sell', optimize=True)
    bb_std = DecimalParameter(1.5, 2.5, default=2.0, decimals=1, space='buy', optimize=True)
    volume_filter = DecimalParameter(0.5, 2.0, default=1.0, decimals=1, space='buy', optimize=True)

    # ----- Protections (contre les black swans) -----
    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 1},  # 1 minute de pause après un trade
            {"method": "MaxDrawdown", "calculation_mode": "equity", "lookback_period_candles": 60,
             "trade_limit": 20, "stop_duration_candles": 15, "max_allowed_drawdown": 0.05},  # 5% max
        ]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Bollinger Bands (la matrice)
        bollinger = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=self.bb_std.value)
        dataframe['bb_lower'] = bollinger['lower']
        dataframe['bb_mid'] = bollinger['mid']
        dataframe['bb_upper'] = bollinger['upper']
        dataframe['bb_width'] = (dataframe['bb_upper'] - dataframe['bb_lower']) / dataframe['bb_mid']

        # RSI (le capteur de surachat/survente)
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)

        # ATR (utilisé par custom_stoploss)
        dataframe['atr'] = ta.ATR(dataframe, timeperiod=14)

        # Volume (la confirmation de l'intérêt)
        dataframe['volume_mean'] = dataframe['volume'].rolling(20).mean()

        # Filtre de volatilité : on ne trade que si les bandes sont assez larges pour faire du profit,
        # mais pas trop larges pour éviter les tendances violentes.
        dataframe['volatility_ok'] = (dataframe['bb_width'] > 0.001) & (dataframe['bb_width'] < 0.02)

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe['close'] <= dataframe['bb_lower'] * 1.001)
            & (dataframe['rsi'] < self.buy_rsi.value)
            & (dataframe['volatility_ok'])
            & (dataframe['volume'] > dataframe['volume_mean'] * self.volume_filter.value)
            & (dataframe['volume'] > 0)
        )

        dataframe.loc[conditions, ['enter_long', 'enter_tag']] = (1, 'bug_buy')
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = (
            (dataframe['close'] >= dataframe['bb_upper'] * 0.999)
            & (dataframe['rsi'] > self.sell_rsi.value)
            & (dataframe['volume'] > 0)
        )

        emergency_exit = (dataframe['close'] < dataframe['bb_lower'] * 0.995)

        dataframe.loc[conditions | emergency_exit, ['exit_long', 'exit_tag']] = (1, 'bug_sell')
        return dataframe

    def custom_stoploss(self, pair: str, trade, current_time: datetime,
                         current_rate: float, current_profit: float, **kwargs) -> float:
        """Laisse courir le bruit jusqu'à -1%, ne coupe qu'au-delà.

        Repris tel quel de la conversation source. Le retour de `1` pour
        "pas de stop" est un hack toléré par Freqtrade mais pas idiomatique
        (voir avertissement en tête de fichier) : à valider en dry-run avant
        de faire confiance à ce comportement.
        """
        if current_profit < -0.01:  # -1%
            return -0.01
        return 1
