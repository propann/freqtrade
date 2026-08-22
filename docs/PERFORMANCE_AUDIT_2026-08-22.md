# Bilan de performance — ancienne version contre rack actuel

## Réponse courte

Le gain le plus net se trouve dans l'interface, le trafic périodique et la maîtrise des pics. Le cœur officiel n'a pas été amputé : supprimer des modules non importés aurait créé de la dette sans libérer de CPU. Le rack économise en gardant la recherche éteinte jusqu'au moment où elle est demandée.

## Gains mesurés dans le code

Base : commit `79d30d1`. Cible : arbre audité du 22 août 2026.

| Mesure | Ancienne version | Version auditée | Gain |
|---|---:|---:|---:|
| Fichiers suivis | 134 | 65 | −51,5 % |
| Volume suivi | ≈584 Ko | ≈377 Ko | −35,5 % |
| Lignes de code et styles | 8 756 | 4 180 | −52,3 % |
| Lignes `console/pages/index.tsx` | 4 262 | 354 | −91,7 % |
| Lignes CSS principales | 337 | 175 | −48,1 % |
| Routes API de la console | 7 | 5 | −28,6 % |
| Dépendances frontend de production | 5 | 4 | −20 % |
| Appels navigateur périodiques | ≈30,6/min | 8/min | −73,8 % |
| Services permanents | 2 | 2 | aucun démon ajouté |

Une seconde comparaison porte uniquement sur le dernier polish du rack réel : ses lectures internes passent de 72 à 30 par minute, soit −58,3 %. L'ancienne version `79d30d1` ne lisait pas réellement le cœur pour ses positions ; lui attribuer ce chiffre aurait été flatteur, mais faux.

La dépendance graphique `recharts`, les graphiques, les bougies, EMA/RSI calculés dans l'UI et les appels publics Binance ont disparu. La console demande maintenant seulement l'état utile toutes les 15 secondes, les journaux toutes les 30 secondes et les fichiers Rack/observation toutes les 60 secondes.

## Ce que cela change réellement

- **Navigateur** : beaucoup moins de composants, calculs, données et rendu graphique. Le bénéfice est particulièrement visible sur mobile ou ordinateur modeste.
- **Next.js** : moins de routes, moins de réponses périodiques et aucun calcul d'indicateur de marché.
- **Réseau** : environ 22,6 requêtes périodiques en moins par minute et par session ouverte.
- **VPS** : quatre endpoints internes inutilisés ont été retirés du cycle principal ; le trafic vers le cœur passe de 72 à 30 lectures par minute au régime nominal.
- **Pics de recherche** : backtest, anti-biais, récursif et OOS sont arrêtés au repos, limités à un job, 1 vCPU, 1 024 Mio et 256 processus lorsqu'ils tournent.
- **Prévisibilité** : console et cœur possèdent désormais des plafonds explicites. Ce sont des limites de sécurité, pas une preuve qu'ils consomment constamment ces montants.

## Ce qui ne doit pas être survendu

La suppression du SaaS allège Git et la CI, mais ne libère presque aucune RAM sur le VPS : cet orchestrateur n'était pas lancé. De même, le rack ne rend pas magiquement une stratégie plus rapide. Les vrais leviers du moteur sont les cinq paires maximum, le timeframe 15 minutes, `process_only_new_candles = True`, l'absence de timeframe informatif permanent et les indicateurs limités aux décisions.

Il est donc incorrect d'annoncer aujourd'hui « 50 % de CPU en moins » ou « 300 Mio gagnés » sur le moteur. Ces chiffres doivent venir des relevés `observectl` de la machine cible.

## Protocole de confirmation VPS

1. Déployer le commit audité en dry-run avec le profil `baseline`.
2. Programmer `rack-observer sample` toutes les cinq minutes pendant sept jours.
3. Ne lancer aucun job de recherche pendant la première fenêtre de référence.
4. Relever CPU moyen/maximal, RAM moyenne/maximale, fraîcheur, redémarrages et erreurs marché.
5. Lancer ensuite un benchmark isolé, puis vérifier que les ressources reviennent au niveau de repos.
6. Comparer les profils `baseline` et `ichi-v1` sur le même nombre de paires et la même période.

Le résultat attendu n'est pas un record de laboratoire : c'est un petit VPS qui respire, ne swap pas, ne rate pas ses bougies et reste lisible quand le marché s'agite.
