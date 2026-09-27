# COCOA WAR ROOM

Web app personnelle de surveillance et de pilotage d'un trade spéculatif sur le cacao.

> Un système qui surveille tout ce qui peut faire évoluer la thèse, et qui indique quand plusieurs éléments convergent, ou quand il vaut mieux **ne rien faire**.

## Version 0.2 : ce qui marche

| Module | État |
|---|---|
| Prix New York (ICE US) | ✅ Réel, **différé** (Yahoo Finance, non officiel), rafraîchi chaque minute |
| Historique et graphique W1 → 5M | ✅ Bougies réelles, 4H construit à partir du 1H |
| Lecture du marché au défilement | ✅ Graphique épinglé : prix → structure → liquidités → pivots → position → verdict |
| Niveaux | ✅ ATR 14 j, PDH/PDL, PWH/PWL, pivots, structure simplifiée par unité de temps |
| Market Pulse | ✅ Sur 2 composantes réelles sur 5 (les autres sont exclues, pas estimées) |
| Market Story (événements) | ✅ Mouvements forts, niveaux pris, stop proche ou touché, objectifs, entrées, source hors ligne |
| Alerte critique plein écran | ✅ Stop touché, perte maximale atteinte, mouvement de 2 ATR |
| Ce qui a changé depuis ta visite | ✅ Prix, volatilité, P&L |
| Trade Manager | ✅ 3 entrées, prix moyen, P&L en €, risque au stop, R, objectifs, règles anti-martingale vérifiées par le serveur |
| Journal | ✅ Avec photo automatique du prix, du P&L, du statut et du Pulse |
| Base de données | ✅ Supabase (PostgreSQL). Tables créées automatiquement. Rien dans le navigateur |
| Accès | ✅ Mot de passe unique, session signée de 30 jours |
| Prix Londres (ICE Europe) | ❌ Affiché « indisponible » : pas de source gratuite fiable |
| Fondamentaux, news, Telegram, ICT, confluence, IA | ⏳ Phases suivantes, affichés « pas encore branché » |

Tant que la confluence et les fondamentaux ne sont pas branchés, la War Room affiche **« Aucun setup · Rien à faire »** avec ses raisons. C'est voulu.

Les événements sont calculés quand l'app est ouverte. La surveillance en continu (même app fermée) arrivera avec Telegram, via une tâche planifiée Supabase.

## Mise en ligne (15 minutes, gratuit)

### 1. Supabase (la base de données)
1. Va sur **https://supabase.com**, crée un compte, puis **New project**.
2. Choisis un nom (ex. `cocoa-war-room`), une région proche (ex. *West EU (Paris)*), et **note le mot de passe de la base**.
3. Une fois le projet prêt, clique **Connect** en haut de la page, section **Transaction pooler**.
4. Copie l'adresse. Remplace `[YOUR-PASSWORD]` par le mot de passe noté à l'étape 2. C'est ta `DATABASE_URL`.

Aucune table à créer : l'app le fait toute seule au premier lancement.

### 2. Vercel (l'hébergement)
1. Va sur **https://vercel.com**, connecte-toi avec GitHub, **Add New… → Project**, choisis **CACAO-WAR-ROOM** (branche `claude/cacao-war-room-app-6fan8i` si elle n'est pas encore fusionnée).
2. Avant de cliquer sur Deploy, ouvre **Environment Variables** et ajoute :
   - `DATABASE_URL` : l'adresse Supabase de l'étape 1
   - `APP_PASSWORD` : le mot de passe que tu taperas pour ouvrir l'app
   - `SESSION_SECRET` : une longue phrase aléatoire (40 caractères ou plus, tu n'auras jamais à la retaper)
3. Clique **Deploy**, ouvre l'adresse obtenue sur ton téléphone et entre ton mot de passe.
4. Sur iPhone : Partager → *Sur l'écran d'accueil*. Sur Android : ⋮ → *Ajouter à l'écran d'accueil*.

Si une variable manque, l'app affiche un écran qui dit laquelle et où l'ajouter.

## Pour un développeur

```bash
npm install
npm run dev      # app + routes /api en local (DATABASE_URL, APP_PASSWORD, SESSION_SECRET requis)
npm test         # calculs, règles, alertes, session, et le schéma SQL sur un Postgres local (PGlite)
npm run build
```

- `api/` : fonctions serveur Vercel (`auth`, `market`, `fx`, `state`, `trade`, `journal`)
- `lib/db/` : schéma (migrations automatiques) et requêtes PostgreSQL
- `lib/services/` : logique serveur (événements de marché, actions du Trade Manager)
- `lib/providers/` : sources de données interchangeables
- `lib/engines/` : calculs purs et testés (trade, technique, War Room)
- `src/` : interface React
- `docs/` : [architecture](docs/ARCHITECTURE.md) · [design](docs/DESIGN.md) · [maquette](prototype/war-room.html)
