import { useEffect, useState } from 'react';

import StatusBadge from './StatusBadge';

export type BotStats = {
  botId: string;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  profit: number;
  pairCount: number;
  errorCount: number;
  updatedAt: string;
  mode: string;
};

type BotCardProps = {
  botId: string;
  fallback: BotStats;
};

const refreshIntervalMs = 5000;

async function fetchBotStats(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Unable to fetch bot stats');
  }
  return response.json();
}

export default function BotCard({ botId, fallback }: BotCardProps) {
  const [data, setData] = useState<BotStats | null>(fallback ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!fallback);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const nextData = await fetchBotStats(`/api/bots/${botId}/stats`);
        if (isMounted) {
          setData(nextData);
          setHasError(false);
        }
      } catch (error) {
        if (isMounted) {
          setHasError(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();
    const interval = window.setInterval(load, refreshIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [botId]);

  if (!data && isLoading) {
    return <div className="card skeleton" />;
  }

  if (!data) {
    return (
      <div className="card error-card">
        <h3>Bot indisponible</h3>
        <p className="muted">Impossible de charger les métriques.</p>
      </div>
    );
  }

  const profitClass = data.profit >= 0 ? 'positive' : 'negative';

  return (
    <article className="card bot-card">
      <header>
        <div>
          <p className="muted">{data.mode}</p>
          <h3>{data.name}</h3>
        </div>
        <StatusBadge status={hasError ? 'warning' : data.status} label={hasError ? 'Offline' : data.status} />
      </header>
      <div className="bot-metrics">
        <div>
          <p className="muted">Profit</p>
          <strong className={profitClass}>
            {data.profit >= 0 ? '+' : ''}
            {data.profit}%
          </strong>
        </div>
        <div>
          <p className="muted">Paires</p>
          <strong>{data.pairCount}</strong>
        </div>
        <div>
          <p className="muted">Erreurs</p>
          <strong>{data.errorCount}</strong>
        </div>
      </div>
      <footer className="muted">Dernière mise à jour · {data.updatedAt}</footer>
    </article>
  );
}
