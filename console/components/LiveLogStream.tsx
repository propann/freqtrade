import { useEffect, useMemo, useState } from 'react';

const fallbackLogs = [
  '[orchestrator] Préparation du conteneur... ',
  '[freqtrade] Chargement de la stratégie: Momentum',
  '[freqtrade] Dry-run activé, aucun ordre réel envoyé.',
  '[risk] Vérification drawdown: 12% (limite 40%)',
  '[metrics] PnL +0.3% sur 24h glissantes',
];

type LiveLogStreamProps = {
  tenantId: string;
  botId: string;
};

export default function LiveLogStream({ tenantId, botId }: LiveLogStreamProps) {
  const [logs, setLogs] = useState<string[]>(fallbackLogs);
  const [status, setStatus] = useState<'connected' | 'standby' | 'error'>('standby');

  const streamUrl = useMemo(() => `/api/tenants/${tenantId}/bots/${botId}/logs/stream`, [tenantId, botId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const eventSource = new EventSource(streamUrl);
    setStatus('connected');

    eventSource.onmessage = (event) => {
      if (!event.data) {
        return;
      }
      setLogs((prev) => {
        const next = [...prev, event.data];
        return next.slice(-200);
      });
    };

    eventSource.onerror = () => {
      setStatus('standby');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [streamUrl]);

  return (
    <div className="logs-panel">
      <div className="logs-header">
        <div>
          <h3>Bot: {botId}</h3>
          <p className="muted">Flux sécurisé via l'orchestrateur (SSE).</p>
        </div>
        <span className={`status-dot ${status}`}>{status}</span>
      </div>
      <div className="logs-window">
        {logs.map((line, index) => (
          <div key={`${line}-${index}`} className="log-line">
            {line}
          </div>
        ))}
      </div>
      <p className="muted logs-footer">Aucune clé API n'est exposée dans ce flux.</p>
    </div>
  );
}
