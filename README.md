# COCOA WAR ROOM

Web app personnelle de surveillance et de pilotage d'un trade spéculatif sur le cacao.

> Un système qui surveille tout ce qui peut faire évoluer la thèse, et qui indique quand plusieurs éléments convergent, ou quand il vaut mieux **ne rien faire**.

## Version 0.1 : ce qui marche

| Module | État |
|---|---|
| Prix New York (ICE US) | ✅ Réel, **différé** (Yahoo Finance, non officiel), rafraîchi chaque minute |
| Historique et graphique W1 → 5M | ✅ Bougies réelles, 4H construit à partir du 1H |
| Niveaux | ✅ ATR 14 j, volatilité relative, PDH/PDL, PWH/PWL, pivots du jour |
| Structure par unité de temps | ✅ Version simplifiée (sommets et creux) |
| Market Pulse | ✅ Sur 2 composantes réelles sur 5 (les autres sont exclues, pas estimées) |
| Ce qui a changé depuis ta visite | ✅ Prix, volatilité, P&L |
| Trade Manager | ✅ 3 entrées, prix moyen, P&L en €, risque au stop, R, objectifs, règles anti-martingale |
| Journal | ✅ Avec photo automatique du prix, du P&L et du statut |
| Taux de change | ✅ BCE (Frankfurter) |
| Prix Londres (ICE Europe) | ❌ Affiché « indisponible » : pas de source gratuite fiable |
| Fondamentaux, news, Telegram, ICT, confluence, IA | ⏳ Phases suivantes, affichés « pas encore branché » |

Tant que la confluence et les fondamentaux ne sont pas branchés, la War Room affiche **« Rien à faire »** avec ses raisons. C'est voulu.

**Stockage** : en v0.1, ta position et ton journal sont enregistrés **dans ton navigateur** (sur ton téléphone ou ton ordinateur, pas les deux). Utilise *Trade → Données → Exporter* pour garder une sauvegarde. La base Supabase arrivera avec les alertes Telegram (phase 3).

## Mettre l'app en ligne (10 minutes, gratuit)

1. Va sur **https://vercel.com** et connecte-toi avec ton compte GitHub.
2. Clique **Add New… → Project**, choisis le dépôt **CACAO-WAR-ROOM**.
3. Dans *Branch*, garde la branche par défaut ou choisis `claude/cacao-war-room-app-6fan8i` si le code n'est pas encore fusionné.
4. Vercel détecte **Vite** tout seul. Ne change rien, clique **Deploy**.
5. Au bout d'une minute, tu obtiens une adresse du type `cacao-war-room.vercel.app`. Ouvre-la sur ton téléphone.
6. Sur iPhone : bouton Partager → *Sur l'écran d'accueil*. Sur Android : menu ⋮ → *Ajouter à l'écran d'accueil*. L'app s'ouvre alors comme une vraie application.

Aucune clé ni variable d'environnement n'est nécessaire pour la v0.1.

## Pour un développeur

```bash
npm install
npm run dev      # app + routes /api en local sur http://localhost:5173
npm test         # tests des calculs (position, technique, parsers)
npm run build
```

- `api/` : fonctions serveur Vercel (`/api/market`, `/api/fx`)
- `lib/providers/` : sources de données interchangeables
- `lib/engines/` : calculs purs et testés (trade, technique, War Room)
- `src/` : interface React
- `docs/` : [architecture](docs/ARCHITECTURE.md) · [design](docs/DESIGN.md) · [maquette](prototype/war-room.html)
