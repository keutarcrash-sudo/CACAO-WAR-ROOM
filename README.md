# COCOA WAR ROOM

Web app personnelle de surveillance et de pilotage d'un trade spéculatif sur le cacao.

> Un système qui surveille tout ce qui peut faire évoluer la thèse, et qui indique quand plusieurs éléments convergent, ou quand il vaut mieux **ne rien faire**.

## Version 0.4 : ce qui marche

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
| Fondamentaux | ✅ Pluie de 8 zones cacao vs normale 2001–2020 (Open-Meteo), ENSO (NOAA), positions des fonds (CFTC), saisie avec source pour production, arrivages, stocks, grindings. Score −10 à +10 et « Ta thèse » |
| News | ✅ Google News, doublons regroupés, catégorie et importance par mots-clés (confiance faible) |
| Telegram | ✅ Alertes critiques seulement, anti-spam, mode silencieux, commandes /status /position /fundamental /news /alerts |
| Surveillance continue | ✅ Tâche Supabase toutes les 5 minutes, activée depuis l'onglet Intelligence |
| ICT / SMC | ✅ Par unité de temps (W1 → 15M) : BOS / CHoCH, sweeps, equal highs / lows, FVG, order blocks, displacement, rejets, volume inhabituel. Règles sur les bougies, sans IA |
| Confluence et statut | ✅ Score sur 15 (long et short) avec preuves, règles « rien à faire », statut Aucun setup / Surveillance / En formation / Haute confluence / Invalidé, alerte Telegram sur haute confluence |
| Analyse IA | ✅ Gratuite : brief complet à copier dans l'IA de ton choix, réponse rangée dans le journal |
| Ce qui a changé | ✅ Prix, volatilité, P&L, statut, confluence, score fondamental, et tous les événements depuis ta dernière visite |
| Mémoire des signaux | ✅ Chaque changement de statut gardé avec son prix, mouvement mesuré à 1, 3 et 7 jours, statistiques par statut et par confirmation |
| Résumés Telegram | ✅ Optionnels, matin 8 h et/ou soir 18 h (heure de Paris), désactivés par défaut |

Tant que la confluence et les fondamentaux ne sont pas branchés, la War Room affiche **« Aucun setup · Rien à faire »** avec ses raisons. C'est voulu.

### Telegram et surveillance (onglet Intelligence)
1. Dans Telegram, **@BotFather** → `/newbot` → copie le token dans Vercel sous `TELEGRAM_BOT_TOKEN`, puis Redeploy.
2. Onglet Intelligence → **Connecter**. Envoie `/start` à ton bot : il répond avec ton identifiant, à mettre dans Vercel sous `TELEGRAM_CHAT_ID`, puis Redeploy.
3. **Surveillance continue → Activer.** Si Supabase refuse, active d'abord les extensions **pg_cron** et **pg_net** (Supabase → Database → Extensions), puis réessaie.

## Mise en ligne (15 minutes, gratuit)

### 1. Supabase (la base de données)
1. Va sur **https://supabase.com**, crée un compte, puis **New project**.
2. Choisis un nom (ex. `cocoa-war-room`), une région proche (ex. *West EU (Paris)*), et **note le mot de passe de la base**.
3. Une fois le projet prêt, clique **Connect** en haut de la page, onglet **Connection String**. Dans le menu **Method**, choisis **Transaction pooler** (à défaut **Session pooler**).
4. Copie l'adresse. Elle doit contenir **`pooler.supabase.com`**. Remplace `[YOUR-PASSWORD]` par le mot de passe noté à l'étape 2. C'est ta `DATABASE_URL`.

   N'utilise pas l'adresse **Direct connection** (`db.xxxx.supabase.co`) : Vercel ne peut pas la joindre.

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

- `api/` : fonctions serveur Vercel (`auth`, `market`, `fx`, `state`, `trade`, `journal`, `fundamentals`, `news`, `telegram`, `cron`)
- `lib/db/` : schéma (migrations automatiques) et requêtes PostgreSQL
- `lib/services/` : logique serveur (événements de marché, actions du Trade Manager)
- `lib/providers/` : sources de données interchangeables
- `lib/engines/` : calculs purs et testés (trade, technique, War Room)
- `src/` : interface React
- `docs/` : [architecture](docs/ARCHITECTURE.md) · [design](docs/DESIGN.md) · [maquette](prototype/war-room.html)
