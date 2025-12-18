import Head from 'next/head';

const cards = [
  {
    title: 'Overview',
    description: 'Résumé instantané des bots actifs, des quotas et des incidents ouverts. Aucune promesse de gains.',
  },
  {
    title: 'Performance',
    description: 'Indicateurs techniques (PNL simulé en dry-run, ratio gagnant/perdant) sans incitation financière.',
  },
  {
    title: 'Risk',
    description: 'Limites appliquées : drawdown max, nombre de positions simultanées, budget stake par bot.',
  },
  {
    title: 'Events',
    description: 'Audit trail complet : création, start/pause/restart, échecs et messages systèmes.',
  },
  {
    title: 'Actions',
    description: 'Pilotage : création de bot, start/pause/restart, rotation des secrets et restauration.',
  },
];

export default function Home() {
  return (
    <div className="page">
      <Head>
        <title>Freqtrade SaaS Console</title>
        <meta
          name="description"
          content="Console de pilotage multi-tenant pour Freqtrade (aucune promesse de gains financiers)."
        />
      </Head>
      <main className="container">
        <header className="hero">
          <div>
            <p className="eyebrow">Multi-tenant / EC2 Docker-first</p>
            <h1>Freqtrade SaaS Console</h1>
            <p className="lede">
              Supervision sécurisée des bots isolés. Secrets injectés via AWS, actions auditées, mode dry-run par défaut.
            </p>
          </div>
          <div className="cta-group">
            <button className="btn primary">Voir les bots</button>
            <button className="btn ghost">Créer un bot</button>
          </div>
        </header>
        <section className="grid">
          {cards.map((card) => (
            <article key={card.title} className="card">
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </article>
          ))}
        </section>
        <section className="panel">
          <h3>Pipeline orchestrateur</h3>
          <ol>
            <li>Génération de config via template + validateurs.</li>
            <li>Injection des secrets via AWS (SSM/Secrets Manager).</li>
            <li>Démarrage du conteneur Freqtrade isolé sur le réseau dédié.</li>
            <li>Suivi des logs/audits sans jamais exposer d'informations sensibles.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
