# CACAO WAR ROOM — Document technique (avant développement)

> Version 0.1 — 27/09/2026
> Statut : **proposition à valider** avant de commencer la Phase 1.
> Principe : *construire petit, mais construire proprement.*

Ce document répond au point 87 du cahier des charges. Il dit **ce qui est réellement faisable**, **avec quelles sources**, **à quel coût**, et **dans quel ordre** on le construit.

Légende utilisée dans tout le document :

| Symbole | Signification |
|---|---|
| ✅ | Faisable, source fiable et gratuite (ou quasi) |
| 🟡 | Faisable avec compromis (données différées, saisie manuelle, scraping fragile, ou payant) |
| ❌ | Pas récupérable proprement → l'app affichera `DATA UNAVAILABLE` |
| ⚠️ | Point à vérifier concrètement pendant la phase concernée (conditions d'API qui changent souvent) |

---

## 0. Résumé en 10 lignes

1. **Web app** React + Vite, **fonctions serveur** Node.js sur Vercel, **base** Supabase (PostgreSQL), **alertes** Telegram, **IA** Claude API.
2. Le point le plus difficile n'est pas le code : c'est **le prix du cacao**. Les données ICE temps réel sont payantes et chères. Il existe des solutions gratuites mais **différées** ou **non officielles**.
3. **La meilleure source de prix est probablement celle de ton courtier**, car avec 150 € tu ne trades pas un contrat future ICE (10 tonnes, plusieurs milliers d'euros de marge) : tu trades forcément un **CFD** ou un **ETC**. Le P&L doit être calculé sur *ce* produit-là. → **Question n°1 à te poser (section 18).**
4. Météo, ENSO et positionnement CFTC : **gratuits et fiables** (Open-Meteo, NOAA, CFTC).
5. Production, arrivages, grindings, stocks ICE : **pas d'API propre** → saisie manuelle assistée (tu colles le chiffre + la source, l'app calcule le reste) ou extraction depuis les news.
6. News : Google News RSS + flux RSS spécialisés (gratuit). Reuters / Bloomberg n'ont **pas d'API accessible** à un particulier.
7. L'analyse technique / ICT est **du code déterministe** (règles mathématiques), pas de l'IA. L'IA ne fait que résumer et expliquer.
8. Les tâches automatiques (cron) passent par **Supabase pg_cron** (gratuit), car Vercel gratuit ne permet qu'un cron par jour.
9. Coût estimé : **0 € d'hébergement**, **~3 à 25 $/mois d'IA** selon le modèle choisi, **0 € de données** si on accepte du différé.
10. 10 phases, chacune livrable et utilisable seule. Phase 1 = « avoir un prix fiable ».

---

## 1. Architecture globale

```
                      ┌──────────────────────────────────────┐
                      │            SOURCES EXTERNES           │
                      │ Prix (courtier / Yahoo / payant)      │
                      │ Open-Meteo · NOAA CPC · CFTC · RSS     │
                      │ Frankfurter (taux de change BCE)       │
                      └───────────────┬──────────────────────┘
                                      │  (appelées UNIQUEMENT côté serveur)
                                      ▼
┌────────────────┐    déclenche   ┌──────────────────────────────────────┐
│ Supabase       │ ─────────────▶ │  VERCEL — fonctions serveur (/api)    │
│ pg_cron        │  (toutes les   │                                        │
│ (horloge)      │   X minutes)   │  providers/   ← couche d'abstraction   │
└────────────────┘                │   MarketDataProvider                  │
                                  │   NewsProvider                         │
                                  │   WeatherProvider                      │
                                  │   FundamentalProvider                  │
                                  │                                        │
                                  │  engines/     ← logique métier         │
                                  │   technical · ict · liquidity          │
                                  │   fundamental-score · confluence       │
                                  │   do-nothing · risk · importance       │
                                  │                                        │
                                  │  ai/          ← Claude API             │
                                  │  telegram/    ← bot + anti-spam        │
                                  └───────┬───────────────────┬───────────┘
                                          │                   │
                                          ▼                   ▼
                              ┌────────────────────┐   ┌──────────────┐
                              │ Supabase PostgreSQL│   │ Telegram Bot │
                              │ (toutes les données│   │ (alarme)     │
                              │  + historique)     │   └──────────────┘
                              └─────────┬──────────┘
                                        │ lecture via /api (jamais en direct)
                                        ▼
                              ┌────────────────────┐
                              │ FRONTEND React/Vite│
                              │ War Room · Dashboard│
                              │ Trade · Journal ... │
                              └────────────────────┘
```

**Règles d'architecture :**

- Le navigateur ne parle **qu'à nos propres routes `/api`**. Il ne connaît aucune clé.
- Chaque source externe passe par un **Provider** (une petite classe avec toujours les mêmes méthodes). Changer de fournisseur de prix = écrire un nouveau fichier provider, rien d'autre ne bouge.
- Toutes les données stockées gardent : `source`, `source_url`, `fetched_at`, `data_time`, `is_delayed`, `is_estimate`.
- Les **moteurs** (scores, ICT, risque…) sont des fonctions pures : entrée = données, sortie = résultat + liste des raisons. Faciles à tester, jamais d'invention.
- L'IA est **en bout de chaîne** : elle lit des données déjà calculées, elle n'en produit pas.

---

## 2. Stack exacte

| Couche | Choix | Pourquoi |
|---|---|---|
| Frontend | **React 18 + Vite + JavaScript** (pas de TypeScript, comme demandé) | Simple, rapide, standard |
| Routage pages | `react-router-dom` | Quelques pages seulement |
| Graphiques | **`lightweight-charts`** (TradingView, open source, ~45 Ko) | Fait pour les bougies + lignes de niveaux (liquidité, pivots, FVG). Léger. |
| Style | **CSS simple avec variables** (pas de framework UI) | Style terminal sombre, léger, zéro dépendance. Détail dans `docs/DESIGN.md` |
| Animations | **CSS + View Transitions API + canvas**, aucune librairie d'animation | Fluide sur mobile, poids minimal |
| Polices | Geist + Geist Mono via `@fontsource` (servies par le site) | Pas d'appel à un service tiers |
| Backend | **Fonctions serveur Vercel** dans `/api` (Node.js 20+) | Même dépôt que le frontend, déploiement en 1 clic |
| Base de données | **Supabase** (PostgreSQL) via `@supabase/supabase-js` côté serveur uniquement | Gratuit, SQL, interface web pour regarder les tables |
| Horloge (cron) | **Supabase `pg_cron` + `pg_net`** qui appellent nos routes `/api/cron/*` | Gratuit et à la minute (Vercel gratuit = 1 cron/jour max) |
| Alertes | **Telegram Bot API** (appels HTTP directs, pas de librairie) | Gratuit, simple |
| IA | **Claude API** via le SDK officiel `@anthropic-ai/sdk` | Résumés, classification, explications |
| Parsing RSS | `fast-xml-parser` | Léger |
| Tests | `vitest` sur les moteurs de calcul | Les calculs (prix moyen, risque, ICT) **doivent** être testés |

Dépendances totales visées : **moins de 10** paquets.

Structure de dossiers prévue :

```
/
├── api/                    # fonctions serveur Vercel
│   ├── cron/               # market.js, news.js, weather.js, enso.js, cot.js, fx.js
│   ├── telegram/webhook.js
│   ├── dashboard.js
│   ├── trade/...
│   └── ...
├── lib/                    # code partagé serveur
│   ├── providers/          # market/, news/, weather/, fundamental/
│   ├── engines/            # technical, ict, liquidity, scores, risk, do-nothing
│   ├── ai/
│   ├── telegram/
│   └── db.js
├── src/                    # frontend React
│   ├── pages/              # WarRoom, Dashboard, Market, Fundamentals, Technical, Trade, Journal, Alerts, Settings
│   ├── components/
│   └── styles/
├── supabase/migrations/    # fichiers SQL de la base
├── docs/
└── .env.example            # liste des variables (sans valeurs)
```

---

## 3. APIs disponibles — le tableau honnête

### 3.1 Prix du cacao (le point critique)

| Source | Londres (ICE Europe) | New York (ICE US) | Délai | Intraday | Coût | Fiabilité |
|---|---|---|---|---|---|---|
| **API de ton courtier** (ex. IG, Capital.com, Saxo…) | ✅ si le courtier propose « Cacao Londres » | ✅ si « Cacao US » | Temps réel (prix **du CFD**, pas du future) | ✅ | Gratuit avec un compte (souvent même compte démo) | Bonne — **c'est le prix sur lequel tu gagnes/perds réellement** |
| **Yahoo Finance** (non officiel, symbole `CC=F`) | ❌ Londres absent ou incomplet ⚠️ | ✅ | ~10-30 min de retard | ✅ 1m (7 j), 5m/15m (~60 j), 1h (~2 ans) | Gratuit | 🟡 Pas d'API officielle, peut casser sans prévenir, conditions d'usage floues |
| **Stooq** (CSV) | ⚠️ à vérifier | ⚠️ `CC.F` à vérifier | Fin de journée | ❌ | Gratuit | 🟡 Utile en secours pour l'historique daily |
| **Barchart OnDemand** | ✅ (`CA`) | ✅ (`CC`) | Temps réel ou différé selon licence | ✅ | 💰 Sur devis (souvent > 100 $/mois) | Bonne |
| **Databento** | ⚠️ ICE Europe à vérifier | ⚠️ ICE US à vérifier | Historique / live selon licence | ✅ | 💰 À l'usage + licences bourse | Très bonne |
| **ICE Data Services** direct | ✅ | ✅ | Temps réel | ✅ | 💰💰💰 Professionnel | Référence |
| **Widget TradingView** (affichage seulement) | ⚠️ ICE souvent réservé abonnés | ⚠️ | Variable | Affichage | Gratuit | 🟡 Ne fournit **aucune donnée** à nos calculs, juste une image |
| **Alpha Vantage / Twelve Data** | ❌ pas de cacao (Alpha Vantage a café, sucre, coton, pas cacao) ⚠️ | ❌/⚠️ | — | — | — | Inutile ici |

**Recommandation :**

- **Source principale = l'API du courtier sur lequel tu passes réellement le trade**, si elle existe. Le prix moyen, le P&L et le stop seront exacts au centime près.
- **Source secondaire = Yahoo `CC=F`** pour New York (historique long, volume, contexte), clairement étiquetée `DELAYED ~15 MIN — UNOFFICIAL`.
- **Payant seulement si nécessaire**, plus tard. Payer 100 $/mois de données pour un trade de 150 € n'a pas de sens.

⚠️ **Conséquence importante :** si ton courtier n'a pas d'API (ex. certaines applis grand public), on devra :
(a) prendre le prix de référence sur Yahoo / autre, **et** (b) saisir tes prix d'entrée réels à la main. L'app affichera alors `P&L ESTIMÉ` (le CFD peut s'écarter un peu du future : spread, financement overnight, roll).

### 3.2 Taux de change

| Source | Données | Coût | Fiabilité |
|---|---|---|---|
| **Frankfurter** (`api.frankfurter.app`, taux de référence BCE) | EUR/GBP, EUR/USD quotidiens | Gratuit, sans clé | ✅ Officiel BCE, 1 fois/jour |
| API du courtier | Taux utilisé réellement | Gratuit avec compte | ✅ |

Nécessaire car ton budget est en **€** et les prix en **£** (Londres) et **$** (New York).

### 3.3 Météo Afrique de l'Ouest

| Source | Données | Coût | Limites | Fiabilité |
|---|---|---|---|---|
| **Open-Meteo** (forecast + archive ERA5) | Pluie, température, humidité, évapotranspiration, prévisions 16 j, historique depuis 1940 → **anomalies calculables** | Gratuit sans clé (usage non commercial) | ~10 000 appels/jour | ✅ |
| **NASA POWER** | Pluie, température journalières historiques | Gratuit | Quelques jours de retard | ✅ secours |
| **CHIRPS** (UCSB) | Pluie par satellite, référence en agro-climatologie | Gratuit | Fichiers raster, pentadaire → plus complexe | 🟡 phase ultérieure |
| **NOAA CPC Africa** | Anomalies de pluie, bulletins | Gratuit | Fichiers/images | 🟡 |

Zones surveillées (points GPS fixes, moyenne régionale) :

| Pays | Zones |
|---|---|
| Côte d'Ivoire | Soubré, Daloa, San-Pédro, Divo, Abengourou |
| Ghana | Kumasi (Ashanti), Western North (Sefwi), Eastern, Brong-Ahafo |
| Nigeria | Ondo, Cross River |
| Cameroun | Centre, Sud-Ouest |

**Calcul d'anomalie** : pluie cumulée 30 j / 90 j comparée à la moyenne 1991-2020 de la même période (archive Open-Meteo). Pas de supposition : si l'archive n'est pas disponible → `DATA UNAVAILABLE`.

### 3.4 ENSO / El Niño

| Source | Données | Coût | Fréquence | Fiabilité |
|---|---|---|---|---|
| **NOAA CPC** — fichier ONI (`oni.ascii.txt`) | Indice officiel ONI (moyenne 3 mois Niño 3.4) | Gratuit | Mensuel | ✅ |
| **NOAA CPC** — indices hebdomadaires (`wksst9120.for`) | Niño 1+2, 3, 3.4, 4 hebdo | Gratuit | Hebdo (lundi) | ✅ |
| **NOAA CPC** — ENSO Diagnostic Discussion | Statut officiel (Watch/Advisory), texte | Gratuit | Mensuel (2e jeudi) | ✅ |
| **IRI / Columbia** | Probabilités El Niño / Neutre / La Niña par saison | Gratuit | Mensuel | ✅ ⚠️ format à vérifier |
| **BoM Australie** | Statut ENSO alternatif | Gratuit | Bimensuel | ✅ |

### 3.5 Positionnement (COT)

| Source | Données | Coût | Fréquence | Fiabilité |
|---|---|---|---|---|
| **CFTC** — API Socrata (`publicreporting.cftc.gov`) | Cacao **New York** : Managed Money, Commercials (Producer/Merchant), Swap Dealers, Non-commercials, Open Interest | Gratuit | Hebdo : données du **mardi** publiées le **vendredi** 15h30 heure de New York | ✅ |
| **ICE Futures Europe** — COT Report | Cacao **Londres** | Gratuit sur le site ICE | Hebdo | 🟡 fichiers à télécharger, format ⚠️ à vérifier |

Percentiles calculés sur 3 ans d'historique CFTC (téléchargeable gratuitement).

### 3.6 News

| Source | Coût | Limites | Fiabilité |
|---|---|---|---|
| **Google News RSS** (`news.google.com/rss/search?q=cocoa…`) | Gratuit | Titres + lien + source, pas le texte complet | 🟡 bon agrégateur |
| **Flux RSS spécialisés** (médias agricoles/commodités, communiqués ICCO, gouvernement ghanéen…) | Gratuit | Variable selon site ⚠️ | 🟡 à constituer |
| **GNews / NewsData.io** | Plan gratuit limité (~100 req/j) | Retards, quotas | 🟡 option |
| **NewsAPI.org** | Gratuit **uniquement en développement local**, 449 $/mois en production | ❌ inadapté |
| **Reuters, Bloomberg, FT** | Pas d'API grand public (Bloomberg Terminal ~2 000 $/mois) | ❌ texte complet inaccessible — on récupère **seulement les titres** qui apparaissent dans Google News |

### 3.7 Fondamentaux « lents » (production, arrivages, stocks, grindings)

| Donnée | Source officielle | API ? | Méthode proposée |
|---|---|---|---|
| **Stocks certifiés ICE US** | ICE Report Center (rapport quotidien « Cocoa Certified Stock ») | ❌ (fichier Excel/PDF) | 🟡 Téléchargement automatique du fichier si stable ⚠️, sinon saisie manuelle |
| **Stocks ICE Londres** | ICE Futures Europe (warehouse stocks) | ❌ | 🟡 Idem |
| **Production (prévisions)** | ICCO (bulletin trimestriel), COCOBOD Ghana, Conseil Café-Cacao CI | ❌ | 🟡 Saisie manuelle assistée + détection automatique dans les news |
| **Arrivages Côte d'Ivoire** | **Aucune publication officielle hebdo** : les chiffres viennent d'estimations d'exportateurs relayées par Reuters/Bloomberg | ❌ | 🟡 Saisie manuelle depuis les news (étiqueté `ESTIMATION EXPORTATEURS`) |
| **Exportations Ghana** | COCOBOD (irrégulier) | ❌ | 🟡 Manuel |
| **Grindings** | ECA (Europe), NCA (Amérique du Nord), CAA (Asie) — trimestriels, publiés mi-janvier/avril/juillet/octobre | ❌ | 🟡 Manuel — 4 saisies par an, facile |
| **Maladies (swollen shoot, black pod), engrais, logistique, politique** | News | — | 🟡 Détection par l'IA dans les news (catégorie `DISEASE`, `LOGISTICS`, `POLITICS`) |

**Saisie manuelle assistée** = un formulaire « Nouvelle donnée fondamentale » : tu choisis le type, tu entres la valeur + l'URL de la source + la date. L'app calcule variation, % et impact. C'est honnête, fiable, et prend 30 secondes. Pour un trade de quelques semaines, c'est largement suffisant.

---

## 4. APIs gratuites vs payantes

### Gratuites (on démarre avec ça)

| Service | Usage |
|---|---|
| API courtier (si disponible) | Prix réel du produit tradé |
| Yahoo Finance (non officiel) | Prix NY différé + historique |
| Frankfurter | Taux de change BCE |
| Open-Meteo | Météo + archive |
| NOAA CPC | ENSO |
| CFTC Socrata | COT New York |
| ICE (fichiers publics) | Stocks, COT Londres |
| Google News RSS + RSS | News |
| Telegram Bot API | Alertes |
| Vercel Hobby | Hébergement |
| Supabase Free | Base + cron |

### Payantes

| Service | Usage | Coût indicatif | Nécessaire ? |
|---|---|---|---|
| **Claude API** | IA (résumés, classification) | voir section 16 | **Oui** (seul coût réel) |
| Barchart / Databento | Données ICE officielles temps réel | 100 $+/mois ⚠️ | **Non** au départ |
| Vercel Pro | Crons natifs, plus de temps d'exécution | 20 $/mois | Non (pg_cron suffit) |
| Supabase Pro | Plus de stockage, pas de mise en pause | 25 $/mois | Non |

---

## 5. Limites de chaque API (à connaître)

| API | Limite | Conséquence dans l'app |
|---|---|---|
| Yahoo | Non officielle, peut changer / bloquer ; différé | Bandeau `DELAYED` + bascule automatique sur une autre source + `DATA SOURCE OFFLINE` si tout tombe |
| Yahoo intraday | 1m = 7 derniers jours seulement | On **stocke** nous-mêmes les bougies pour garder l'historique |
| API courtier | Quotas d'historique (ex. IG : quota hebdomadaire de points historiques ⚠️) | On télécharge l'historique **une fois**, puis on complète au fil de l'eau |
| API courtier | Volume = souvent « tick volume » (nombre de variations), **pas le volume bourse** | VWAP et « volume inhabituel » étiquetés `TICK VOLUME` — approximation |
| Open-Meteo | Usage non commercial, ~10k appels/j | Largement suffisant (≈ 15 points × 48 appels/j) |
| CFTC | Données du mardi, publiées vendredi | Toujours afficher la **date des données**, pas la date de récupération |
| NOAA ONI | Mensuel, moyenne 3 mois → en retard sur la réalité | Compléter par les indices hebdo Niño 3.4 |
| Google News RSS | Titres seulement, pas de garantie de format | L'IA travaille sur titre + extrait ; importance réduite si source non primaire |
| Telegram | ~30 messages/seconde (sans importance ici) | — |
| Supabase Free | 500 Mo, projet mis en pause après ~7 j sans activité | Nos crons tournent en continu → pas de pause. Nettoyage auto des bougies 1m/5m anciennes |
| Vercel Hobby | Cron 1×/jour, durée d'exécution courte, usage non commercial | Crons via pg_cron ; fonctions courtes et découpées |
| Claude API | Payant au token | Déduplication **avant** IA, IA seulement sur les événements nouveaux |

---

## 6. Données réellement accessibles

✅ **Oui, proprement :**

- Prix NY (différé gratuit) ; prix du CFD/ETC via le courtier (si API)
- OHLC daily / 1h / 15m / 5m / 1m (profondeur limitée, on stocke)
- Volume (bourse sur Yahoo, tick volume sur CFD)
- ATR, volatilité, pivots, VWAP (calculés par nous)
- Toute l'analyse technique et ICT (calculée par nous à partir des bougies)
- Météo actuelle, prévisions, anomalies pour toutes les zones cacao
- ENSO complet (statut, Niño 3.4, Niño 1+2, probabilités)
- COT CFTC New York complet + historique pour percentiles
- Taux de change
- Titres de news + source + date + lien

🟡 **Oui, avec saisie manuelle ou fichier :**

- Stocks certifiés ICE (Londres et NY)
- Prévisions de production (ICCO, COCOBOD, CCC, analystes)
- Arrivages CI / exportations Ghana
- Grindings trimestriels
- COT Londres
- Open interest Londres

---

## 7. Données impossibles à récupérer proprement

| Donnée | Pourquoi | Ce que l'app fera |
|---|---|---|
| **Prix ICE Londres temps réel gratuit** | Licence ICE payante | Prix courtier, ou différé, ou `DATA UNAVAILABLE` |
| **Carnet d'ordres / profondeur** | Licence pro | Rien. Pas affiché. |
| **Liquidation data / liquidation pools** | N'existe pas publiquement pour les futures cacao (ce concept vient des cryptos) | Terme **interdit** dans l'app → `ESTIMATED LIQUIDITY (basée sur la structure des prix)` |
| **Stops des autres traders** | Invisible | Idem : estimation depuis equal highs/lows, swings |
| **Texte complet Reuters / Bloomberg** | Payant, pas d'API | Titre + lien uniquement |
| **Arrivages CI officiels** | Pas publiés officiellement | Estimations d'exportateurs, étiquetées comme telles |
| **Volume réel du CFD** | Le CFD n'est pas un marché central | Tick volume, étiqueté |
| **Probabilité de succès d'un setup** | Impossible honnêtement | Jamais affichée. Le score = nombre de confirmations, pas une probabilité |

---

## 8. Structure PostgreSQL

Conventions : toutes les tables ont `id`, `created_at`. Toutes les données externes ont `source`, `source_url`, `data_time` (date de la donnée), `fetched_at` (date de récupération), `is_delayed`, `is_estimate`.

```sql
-- ===== MARCHÉ =====
create table instruments (
  id text primary key,                 -- 'NY_COCOA', 'LDN_COCOA', 'BROKER_COCOA_LDN'...
  name text not null,
  exchange text,                       -- 'ICE US', 'ICE Europe', 'CFD <courtier>'
  currency text not null,              -- 'USD', 'GBP', 'EUR'
  tick_size numeric,
  point_value numeric,                 -- valeur d'1 point pour 1 unité (produit réel)
  is_tradable boolean default false    -- true = produit sur lequel tu trades
);

create table market_prices (           -- dernier prix connu (1 ligne par relevé)
  id bigserial primary key,
  instrument_id text references instruments(id),
  price numeric not null,
  bid numeric, ask numeric,
  change_24h numeric, change_24h_pct numeric,
  volume numeric, open_interest numeric,
  data_time timestamptz not null,
  fetched_at timestamptz default now(),
  source text not null, source_url text,
  is_delayed boolean not null, delay_minutes int
);

create table market_candles (
  instrument_id text references instruments(id),
  timeframe text not null,             -- '1m','5m','15m','1h','4h','1d','1w'
  open_time timestamptz not null,
  open numeric, high numeric, low numeric, close numeric,
  volume numeric, volume_type text,    -- 'exchange' | 'tick'
  source text not null,
  primary key (instrument_id, timeframe, open_time)
);

create table fx_rates (
  pair text, rate numeric, data_time date, source text,
  primary key (pair, data_time)
);

create table data_source_status (      -- pour "DATA SOURCE OFFLINE"
  source text primary key,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  status text                          -- 'OK' | 'DEGRADED' | 'OFFLINE'
);

-- ===== FONDAMENTAUX =====
create table fundamentals (            -- production, stocks, arrivages, grindings, COT, ENSO
  id bigserial primary key,
  category text not null,              -- 'PRODUCTION','STOCKS','ARRIVALS','EXPORTS','GRINDINGS','POSITIONING','ENSO'
  metric text not null,                -- ex 'ghana_production_forecast', 'ice_us_certified_stocks'
  region text,                         -- 'GH','CI','EU','US',...
  value numeric, unit text,            -- 'kt','bags','contracts'
  previous_value numeric,
  period text,                         -- '2025/26', '2026-Q3', '2026-09-23'
  data_time timestamptz not null,
  source text not null, source_url text,
  entry_mode text not null,            -- 'auto' | 'manual'
  is_estimate boolean default false,
  notes text,
  created_at timestamptz default now()
);

create table weather_data (
  id bigserial primary key,
  zone text not null,                  -- 'CI_SOUBRE', 'GH_ASHANTI'...
  country text not null,
  date date not null,
  is_forecast boolean not null,
  precip_mm numeric, temp_max numeric, temp_min numeric, humidity numeric, et0_mm numeric,
  precip_30d_anomaly_pct numeric,      -- calculé
  precip_90d_anomaly_pct numeric,
  source text not null, fetched_at timestamptz default now(),
  unique (zone, date, is_forecast)
);

create table fundamental_scores (      -- historique du score fondamental
  id bigserial primary key,
  computed_at timestamptz default now(),
  total numeric,                       -- -10..+10
  bias text,                           -- 'BULLISH','NEUTRAL','BEARISH','INSUFFICIENT_DATA'
  coverage int,                        -- nb de facteurs disponibles
  components jsonb,                    -- {weather:{score:2, reasons:[...]}, ...}
  counter_factors jsonb
);

-- ===== NEWS =====
create table news (                    -- chaque article brut
  id bigserial primary key,
  url text unique not null,
  title text not null,
  summary text,
  source_name text,
  source_tier int,                     -- 1=officiel ... 9=analyste (section 71)
  published_at timestamptz,
  fetched_at timestamptz default now(),
  fingerprint text,                    -- empreinte pour regroupement
  news_event_id bigint                 -- rattaché à un événement maître
);

create table news_events (             -- ONE MASTER EVENT
  id bigserial primary key,
  fingerprint text unique not null,
  title text not null,
  category text not null,              -- WEATHER, PRODUCTION, SUPPLY, ...
  direction text,                      -- BULLISH / NEUTRAL / BEARISH
  importance int,                      -- 0..100
  confidence text,                     -- LOW / MEDIUM / HIGH
  impact text,                         -- LOW / MEDIUM / HIGH / CRITICAL
  thesis_impact text,                  -- explication IA
  sources jsonb,                       -- [{name, url, published_at}, ...]
  source_count int default 1,
  first_seen_at timestamptz, last_updated_at timestamptz,
  ai_model text, ai_analyzed_at timestamptz
);

-- ===== TECHNIQUE / ICT =====
create table technical_signals (
  id bigserial primary key,
  instrument_id text, timeframe text,
  signal_type text,                    -- 'BOS','CHOCH','FVG','OB','SWEEP','DISPLACEMENT','REJECTION','STRUCTURE'
  direction text,                      -- 'BULLISH' | 'BEARISH'
  price_low numeric, price_high numeric,
  detected_at timestamptz, candle_time timestamptz,
  status text,                         -- 'ACTIVE','MITIGATED','INVALIDATED'
  details jsonb
);

create table liquidity_levels (
  id bigserial primary key,
  instrument_id text,
  side text,                           -- 'BUY_SIDE' | 'SELL_SIDE'
  level_type text,                     -- 'EQH','EQL','PDH','PDL','PWH','PWL','SWING_HIGH','SWING_LOW','PIVOT_R1'...
  price numeric,
  timeframe text,
  is_estimate boolean default true,    -- toujours une estimation
  status text,                         -- 'ACTIVE','SWEPT'
  swept_at timestamptz,
  computed_at timestamptz default now()
);

create table confluence_snapshots (    -- score de confluence dans le temps
  id bigserial primary key,
  computed_at timestamptz default now(),
  direction text,                      -- 'LONG' | 'SHORT'
  score int, max_score int,
  label text,                          -- NO SETUP / WATCH / INTERESTING / HIGH CONFLUENCE
  checklist jsonb,                     -- [{item:'Daily support', ok:true, points:2}, ...]
  do_nothing boolean,
  do_nothing_reasons jsonb,
  setup_status text                    -- ex 'WAIT FOR CONFIRMATION'
);

-- ===== TRADE =====
create table trade_positions (
  id bigserial primary key,
  instrument_id text references instruments(id),
  direction text default 'LONG',
  status text,                         -- NO POSITION, WATCHING, ENTRY 1..3, FULL POSITION, PROFIT, LOSS, THESIS INVALIDATED, CLOSED
  planned_capital_eur numeric default 150,
  max_loss_eur numeric default 50,
  stop_price numeric,                  -- invalidation technique
  stop_history jsonb,                  -- on trace chaque modification du stop
  thesis_status text,                  -- VALID / WARNING / INVALIDATED
  technical_status text,
  risk_status text,
  opened_at timestamptz, closed_at timestamptz,
  close_price numeric, realized_pnl_eur numeric
);

create table trade_entries (
  id bigserial primary key,
  position_id bigint references trade_positions(id),
  entry_number int check (entry_number between 1 and 3),
  planned_capital_eur numeric,         -- 30 / 50 / 70
  capital_eur numeric,                 -- réellement engagé (marge pour un CFD)
  price numeric not null,              -- prix d'exécution réel
  quantity numeric not null,           -- unités du produit réel
  fees_eur numeric default 0,
  fx_rate numeric,                     -- taux au moment de l'entrée
  executed_at timestamptz not null,
  confluence_snapshot_id bigint,       -- score au moment de l'entrée
  fundamental_score_id bigint,
  checklist_passed jsonb               -- conditions validées à l'entrée
);

create table trade_targets (
  id bigserial primary key,
  position_id bigint references trade_positions(id),
  label text,                          -- 'TP1','TP2'
  price numeric,
  rationale text,
  hit_at timestamptz
);

create table trade_journal (
  id bigserial primary key,
  position_id bigint,
  written_at timestamptz default now(),
  why_enter text, thesis text, what_i_saw text, what_market_did text, what_ai_said text,
  snapshot jsonb                       -- prix, scores, news, position figés au moment de l'écriture
);

-- ===== ALERTES / TELEGRAM =====
create table alerts (
  id bigserial primary key,
  created_at timestamptz default now(),
  category text,                       -- NEWS, WEATHER, FUNDAMENTALS, TECHNICAL, LIQUIDITY, TRADE, RISK
  level text,                          -- INFORMATION / IMPORTANT / CRITICAL
  importance int,                      -- 0..100
  message text,
  source text, source_url text,
  impact text,
  fingerprint text,
  related_id bigint                    -- news_event, signal, etc.
);

create table telegram_notifications (
  id bigserial primary key,
  alert_id bigint references alerts(id),
  fingerprint text,
  importance int,
  sent_at timestamptz default now(),
  telegram_message_id bigint,
  status text                          -- 'SENT','SUPPRESSED_DUPLICATE','SUPPRESSED_COOLDOWN','SUPPRESSED_SILENT','FAILED'
);

create table settings (                -- réglages (mode silencieux, résumés, seuils)
  key text primary key,
  value jsonb
);
```

Nettoyage automatique : bougies 1m gardées 14 jours, 5m 90 jours ; le reste est conservé (historique post-trade, Phase 9).

Sécurité base : **Row Level Security activée sur toutes les tables, sans aucune règle d'accès public**. Seul le serveur (clé `service_role`) lit/écrit. Le navigateur ne touche jamais Supabase directement.

---

## 9. Endpoints backend

Toutes les routes sont protégées (section 15). `GET` = lecture, `POST` = écriture.

### Lecture (frontend)

| Route | Rôle |
|---|---|
| `GET /api/warroom` | Vue ultra-synthétique (section 74 du cahier) en **un seul appel** |
| `GET /api/dashboard` | Dashboard complet |
| `GET /api/market?instrument=` | Prix, variations, sources, statut des sources |
| `GET /api/candles?instrument=&tf=&from=` | Bougies pour graphique |
| `GET /api/fundamentals` | Dernières valeurs + score + raisons + contre-facteurs |
| `GET /api/weather` | Météo par zone + anomalies |
| `GET /api/enso` | Statut ENSO |
| `GET /api/positioning` | COT |
| `GET /api/technical?instrument=` | Structure par timeframe, signaux ICT, pivots, ATR, VWAP |
| `GET /api/liquidity?instrument=` | Carte de liquidité |
| `GET /api/confluence` | Score, checklist, DO NOTHING, setup status |
| `GET /api/news?category=` | Événements maîtres |
| `GET /api/alerts?filter=` | Timeline |
| `GET /api/trade` | Position, entrées, calculs (moyenne, P&L, risque, R…) |
| `GET /api/journal` | Journal |
| `GET /api/health` | État de toutes les sources (OK/DEGRADED/OFFLINE + last update) |

### Écriture (frontend)

| Route | Rôle |
|---|---|
| `POST /api/trade/entry` | Ajouter une entrée (vérifie les règles de risque AVANT d'accepter) |
| `POST /api/trade/stop` | Modifier le stop (refus d'éloigner le stop si cela dépasse le risque max) |
| `POST /api/trade/target` | Objectifs |
| `POST /api/trade/close` | Clôture |
| `POST /api/fundamentals/manual` | Saisie manuelle d'une donnée fondamentale |
| `POST /api/journal` | Nouvelle note (avec snapshot automatique) |
| `POST /api/settings` | Mode silencieux, résumés, seuils |
| `POST /api/ai/analyze` | Demander une synthèse IA à la demande |
| `POST /api/auth/login` · `/logout` | Connexion par mot de passe |

### Automatiques

| Route | Appelée par |
|---|---|
| `POST /api/cron/market` | pg_cron |
| `POST /api/cron/news` | pg_cron |
| `POST /api/cron/weather` | pg_cron |
| `POST /api/cron/enso` | pg_cron |
| `POST /api/cron/cot` | pg_cron |
| `POST /api/cron/fx` | pg_cron |
| `POST /api/cron/analysis` | pg_cron (recalcule technique → confluence → alertes) |
| `POST /api/cron/summary` | pg_cron (résumés optionnels) |
| `POST /api/telegram/webhook` | Telegram |

---

## 10. Architecture Telegram

```
 Événement détecté (news, signal, trade, risque...)
            │
            ▼
  1. Importance Engine  → score 0-100 (section 13.4)
            │
            ▼
  2. Niveau             0-39 INFORMATION → dashboard seulement
                        40-69 IMPORTANT  → dashboard + prochain résumé
                        70-100 CRITICAL  → candidat notification
            │
            ▼
  3. Anti-spam (section 14)  → doublon ? cooldown ? mode silencieux ?
            │
            ▼
  4. Envoi Telegram  → enregistré dans telegram_notifications (même si supprimé, avec la raison)
```

- **Mode webhook** : Telegram appelle `POST /api/telegram/webhook`. Protégé par l'en-tête secret `X-Telegram-Bot-Api-Secret-Token` **et** vérification que le message vient de ton `TELEGRAM_CHAT_ID`. Tout autre utilisateur est ignoré silencieusement.
- **Commandes** : `/status`, `/news`, `/fundamental`, `/technical`, `/position`, `/alerts`, `/silent`, `/resume`. Toutes lisent la base (aucun appel IA → réponse instantanée et gratuite), sauf si on ajoute plus tard `/analyze`.
- **Formatage** : messages en HTML Telegram, courts, avec toujours la mention `Not an automatic entry signal.` pour les setups.
- **Résumés** : désactivés par défaut. Activables dans Settings : toutes les 4h et/ou quotidien (heure configurable).
- **Aucune action de trading via Telegram.** Lecture seule + réglages silencieux.

---

## 11. Architecture IA

**Règle d'or : REAL DATA → STRUCTURED DATA → AI ANALYSIS → HUMAN-READABLE SUMMARY.**

| Tâche IA | Quand | Entrée | Sortie (JSON structuré) |
|---|---|---|---|
| **Classification news** | Nouvel événement maître uniquement (après dédoublonnage) | Titre, extrait, source, date + résumé de la thèse | `category`, `direction`, `confidence`, `magnitude`, `thesis_impact`, `extracted_numbers` (avec citation du texte) |
| **Synthèse War Room** | Quand un score change significativement, ou à la demande | Snapshot JSON complet (section 80 du cahier) | `summary`, `main_factors`, `counter_factors`, `contradictions`, `status`, `what_must_happen`, `what_invalidates` |
| **Explication de setup** | Quand confluence ≥ INTERESTING | Checklist + niveaux | Texte explicatif |
| **Explication de changement de score** | Quand le score fondamental varie de ≥ 2 | Ancien vs nouveau composants | Texte |
| **Résumés Telegram** | Si activés | Événements IMPORTANT de la période | Texte court |

**Garde-fous contre l'invention :**

1. L'IA reçoit **uniquement** des données de notre base, en JSON.
2. Sortie en **JSON strict** (fonction « structured outputs » de l'API Claude) → pas de texte libre non contrôlé.
3. **Vérification automatique des chiffres** : tout nombre présent dans le texte de l'IA doit exister dans les données d'entrée (tolérance d'arrondi). Sinon → texte rejeté, on affiche la version sans IA.
4. Un chiffre extrait d'une news par l'IA (ex. « production Ghana 620 kt ») n'entre **jamais directement** dans les scores : il crée une **proposition** que tu valides en un clic (`is_estimate = true` tant que non confirmé par une source officielle).
5. L'IA ne produit **jamais** les scores : ils sont calculés par le code. Elle les explique.
6. Si l'API IA est indisponible → l'app fonctionne entièrement sans (scores, alertes, dashboard), seul le texte explicatif manque.

**Modèles :** par défaut **Claude Opus 5** (`claude-opus-5`) pour tout. Option d'économie à ta discrétion : **Claude Haiku 4.5** (`claude-haiku-4-5`) pour la classification des news, qui est une tâche simple et volumineuse. Coûts comparés en section 16. Modèle configurable par variable d'environnement.

---

## 12. Cron jobs

Horloge = **Supabase pg_cron**, qui appelle nos routes avec l'en-tête `Authorization: Bearer CRON_SECRET`. Plan B si besoin : cron-job.org (gratuit).

| Tâche | Fréquence | Plage horaire | Détail |
|---|---|---|---|
| `market` | **1 min** (courtier) / **5 min** (Yahoo) | Heures d'ouverture ICE uniquement ⚠️ (≈ Londres 09:30-16:50 UK, NY 04:45-13:30 New York) + 1 relevé/h hors séance | Prix + bougies 1m, agrégation 5m/15m/1h/4h/D/W par nous |
| `analysis` | 5 min en séance | Idem | Technique → ICT → liquidité → confluence → DO NOTHING → risque → alertes |
| `news` | 10 min | 24h/24 | RSS → dédoublonnage → IA sur les nouveaux événements seulement |
| `weather` | 3 h | 24h/24 | Open-Meteo met à jour ses modèles quelques fois par jour ; 30 min serait inutile |
| `enso` | 1×/jour | — | Détecte les nouvelles publications NOAA/IRI |
| `cot` | 1×/h le vendredi soir (heure de Paris), sinon 1×/jour | — | Publication CFTC vendredi 15h30 New York |
| `fx` | 1×/jour | 17h (après publication BCE) | Taux de référence |
| `fundamentals` | 1×/jour | — | Tentative de lecture auto des stocks ICE ⚠️ ; sinon rappel « donnée à saisir » |
| `summary` | Désactivé par défaut ; 4h ou quotidien si activé | — | — |
| `cleanup` | 1×/jour | Nuit | Purge bougies anciennes |
| Critique | **Immédiat** | — | Pas de cron : l'alerte part dans la foulée du traitement qui la détecte |

Chaque tâche met à jour `data_source_status`. Si une source échoue 3 fois de suite → statut `OFFLINE`, bandeau dans l'app, **une** alerte IMPORTANT (pas de spam).

---

## 13. Système de scoring

### 13.1 Score fondamental (-10 à +10)

7 facteurs, chacun noté de **-2 à +2** par des règles écrites (pas par l'IA) :

| Facteur | Exemple de règle (réglable) |
|---|---|
| **Météo** | Anomalie pluie 30 j pondérée par zone (CI 45 %, GH 25 %, NG 10 %, CM 10 %, autres 10 %) : < -30 % → +2 ; -15/-30 % → +1 ; ±15 % → 0 ; +15/+30 % (favorable) → -1 ; excès fort + risque black pod → +1 (**le contexte compte**) |
| **ENSO** | Pris en compte **seulement s'il se confirme dans la météo réelle** : El Niño + déficit pluie observé → +1/+2 ; El Niño sans déficit → 0 ; La Niña + bonnes pluies → -1 |
| **Production** | Révision de la dernière prévision officielle : < -10 % → +2 ; -3/-10 % → +1 ; ±3 % → 0 ; +3/+10 % → -1 ; > +10 % → -2 |
| **Arrivages / exports** | Cumul saison vs saison précédente : < -15 % → +2 … > +15 % → -2 |
| **Stocks ICE** | Percentile sur 5 ans + tendance 4 semaines : bas et en baisse → +2 … hauts et en hausse → -2 |
| **Demande (grindings)** | Variation YoY trimestrielle : > +5 % → +1/+2 … < -5 % → -1/-2 |
| **Positioning** | Managed Money : très short (percentile < 10 %) → +2 (risque de short squeeze) ; très long (> 90 %) → -2 (risque de long squeeze) |

Calcul :

```
score = (somme des facteurs DISPONIBLES) / (2 × nombre de facteurs disponibles) × 10
```

- **Une donnée manquante n'entre pas dans le score** (ni 0, ni supposition). On affiche `Couverture : 5/7 facteurs`.
- Couverture < 4/7 → biais `INSUFFICIENT DATA` au lieu de BULLISH/BEARISH.
- **Fraîcheur** : une donnée plus vieille que sa durée de validité (ex. météo > 3 j, COT > 10 j, production > 120 j) est marquée `STALE` et son poids divisé par 2.
- **Règle 7 (fiabilité)** : une news isolée ne peut pas bouger un facteur de plus de ±1. ±2 exige une source officielle (tier 1-4) ou ≥ 2 sources indépendantes.
- Biais : ≥ +3 🟢 BULLISH · -2 à +2 🟡 NEUTRAL · ≤ -3 🔴 BEARISH.
- **Toujours affiché** : raisons principales (facteurs > 0) **et** contre-facteurs (facteurs < 0). S'il n'y a aucun contre-facteur, l'app l'écrit explicitement : « aucun contre-facteur détecté dans les données disponibles » (ce qui n'est pas la même chose que « il n'y en a pas »).

### 13.2 Score technique par timeframe

Pour W1, D1, 4H, 1H, 15M : `BULLISH / BEARISH / NEUTRAL / DEVELOPING` selon la structure (suite de swing highs/lows, dernier BOS/CHoCH).
**Hiérarchie stricte (règle 5)** : le contexte est donné par W1 + D1. 4H = zones, 1H = configuration, 15M = timing, 5M = affinage uniquement. Un signal 5M ne modifie jamais l'état D1 ; il n'est même pas compté dans le score de confluence.

### 13.3 Score de confluence

Points **positifs** repris du cahier (pour un LONG ; inversé pour un SHORT) :

| Élément | Points |
|---|---|
| Fondamentaux favorables | +2 (défavorables : -2) |
| Support HTF Daily/4H | +2 (résistance majeure au-dessus proche : -2) |
| Liquidity pool (sell-side) sous le prix | +1 |
| Liquidity sweep | +2 |
| FVG | +1 |
| Order Block | +1 |
| Displacement | +1 |
| BOS / CHoCH | +2 |
| Confluence de pivots | +1 |
| Rejection | +1 |
| Volume inhabituel | +1 |
| **Maximum** | **15** |

⚠️ **Incohérence repérée dans le cahier** : la somme des points possibles fait **15**, mais le dashboard affiche « 8 / 12 ». Proposition : afficher **/15** et garder les seuils du cahier (0-4 NO SETUP · 5-7 WATCH · 8-10 INTERESTING · 11+ HIGH CONFLUENCE). À valider.

Toujours affiché avec la mention : *« Nombre de confirmations présentes. Ce n'est pas une probabilité de réussite. »*

### 13.4 Score d'importance (Telegram, 0-100)

| Composant | Poids max |
|---|---|
| Fiabilité de la source (tier 1 = 15 … tier 9 = 3) | 15 |
| Nouveauté (information jamais vue) | 15 |
| Magnitude (ex. révision production 1 % → 2 pts ; 15 % → 20 pts) | 20 |
| Impact potentiel sur le prix | 15 |
| Proximité avec le trade (prix proche du stop / d'un objectif / d'une zone d'entrée) | 10 |
| Confirmation multi-sources | 10 |
| **Impact sur la thèse** (fait-il changer un facteur du score fondamental, ou le statut de la thèse ?) | 15 |

0-39 INFORMATION · 40-69 IMPORTANT · 70-100 CRITICAL.

### 13.5 Statuts de thèse et « DO NOTHING »

Trois invalidations indépendantes :

| Type | VALID | WARNING | INVALIDATED |
|---|---|---|---|
| **Fondamentale** | Score ≥ +3 | Baisse ≥ 3 points en 14 j, ou score entre -2 et +2 | Score ≤ -3 |
| **Technique** | Structure D1 intacte | Prix < 0,5 ATR du niveau d'invalidation | Clôture D1 sous le niveau d'invalidation |
| **Risque** | Perte latente < 60 % du max | 60-99 % | ≥ 100 % → `RISK LIMIT REACHED` |

**DO NOTHING** s'affiche si **une seule** de ces conditions est vraie :
prix au milieu du range (entre 35 % et 65 % du range D1) · aucune zone HTF à < 1 ATR · aucune liquidité proche · W1/D1 contradictoires · fondamentaux NEUTRAL ou INSUFFICIENT DATA · ATR > 2× sa moyenne 20 j · événement majeur dans les 24 h (rapport grindings, publication ICCO…) · une source critique OFFLINE · confluence < 5.
Chaque raison est listée. C'est **l'état par défaut** de l'app.

### 13.6 Règles des entrées (anti-martingale)

| | ENTRY 1 (30 €) | ENTRY 2 (50 €) | ENTRY 3 (70 €) |
|---|---|---|---|
| Thèse fondamentale | ≠ INVALIDATED, biais ≠ BEARISH | VALID | VALID |
| Confluence minimale | ≥ 5 (WATCH) | ≥ 8 (INTERESTING) + sweep ou réaction confirmée | ≥ 11 (HIGH CONFLUENCE) |
| Invalidation claire (stop défini) | Obligatoire | Obligatoire | Obligatoire |
| Risque cumulé au stop après l'entrée | ≤ 50 € | ≤ 50 € | ≤ 50 € |
| Stop | — | **Jamais éloigné** pour faire de la place | Idem |

L'app n'empêche rien physiquement (tu passes les ordres chez ton courtier), mais elle **affiche clairement « CONDITIONS NON RÉUNIES »** et enregistre dans le journal si une entrée a été saisie hors règles. Une baisse de prix n'est **jamais** en soi une condition.

### 13.7 Calculs de position

Pour chaque entrée *i* : prix `pᵢ`, quantité `qᵢ` (unités du produit réel), valeur du point `v`, taux de change `fx`.

```
Prix moyen          = Σ(pᵢ × qᵢ) / Σ(qᵢ)
Exposition (€)      = prix_actuel × Σqᵢ × v × fx
P&L (€)             = (prix_actuel − prix_moyen) × Σqᵢ × v × fx − frais
Risque au stop (€)  = (prix_moyen − stop) × Σqᵢ × v × fx + frais
Reward (€)          = (objectif − prix_moyen) × Σqᵢ × v × fx
R multiple          = P&L / risque initial
ROI                 = P&L / capital engagé
```

La formule du cahier `Σ(capital) / Σ(quantité)` n'est juste **que** pour un produit sans levier (ETC, action) où capital = prix × quantité. Pour un **CFD**, le capital engagé est une **marge** : on utilise donc la moyenne pondérée des prix. L'app demandera le type de produit une fois et appliquera la bonne formule. Les calculs seront couverts par des tests automatiques.

---

## 14. Système anti-spam

1. **Fingerprint** de chaque événement = hash de `catégorie + entité (ex. "GH_production") + direction + tranche de magnitude + date du jour`. Deux articles sur la même info → même empreinte.
2. **Regroupement news** : même empreinte **ou** titres similaires à > 80 % (comparaison de mots normalisés) dans une fenêtre de 48 h → rattachés au même `news_event` (on ajoute juste la source à la liste).
3. **Cooldown** : 30 min par empreinte (réglable). Pendant le cooldown, rien n'est envoyé, **sauf** si le niveau monte (IMPORTANT → CRITICAL) ou si l'importance augmente de ≥ 15 points (70 → 92 = nouvelle alerte autorisée).
4. **Déjà connu** : une donnée identique à la dernière valeur stockée ne crée pas d'événement.
5. **Plafond global** : max 6 notifications CRITICAL / 24 h (réglable). Au-delà → regroupées dans un message unique « 3 autres alertes critiques, voir l'app ».
6. **Mode silencieux** 🔕 : seules les alertes ≥ 85 et les alertes TRADE/RISK (stop proche, risque max) passent.
7. **Historique** : toute décision (envoyé / supprimé + raison) est enregistrée dans `telegram_notifications` → on peut vérifier après coup que rien d'important n'a été bloqué.
8. **Jamais de notification** pour : BOS, CHoCH, FVG, pivot isolés, petite variation, petite news, donnée déjà connue.

---

## 15. Sécurité

| Risque | Mesure |
|---|---|
| Clés API exposées | Uniquement dans les **variables d'environnement Vercel**. Jamais de préfixe `VITE_` (qui les enverrait au navigateur). Fichier `.env` dans `.gitignore`, seul `.env.example` (sans valeurs) est commité. |
| Quelqu'un ouvre ton URL et voit ta position | **Mot de passe unique** (`APP_PASSWORD`) → cookie de session signé, `HttpOnly`, `Secure`, 30 jours. Toutes les routes `/api` vérifient ce cookie. |
| Quelqu'un appelle les crons | En-tête `Authorization: Bearer CRON_SECRET` obligatoire |
| Faux messages Telegram | Secret du webhook + vérification du `chat_id` |
| Accès direct à la base | RLS activé sans règle publique ; seule la clé `service_role` (serveur) accède |
| Injection via le texte d'une news (« ignore tes instructions… ») | Le texte des news est passé à l'IA comme **donnée**, sortie en JSON strict, chiffres vérifiés (section 11) |
| Ordres de bourse | L'app **ne passe aucun ordre**. Si on utilise une API courtier, ce sera avec des droits de **lecture seule** quand le courtier le permet |

### Variables d'environnement

| Variable | Usage |
|---|---|
| `MARKET_DATA_PROVIDER` | `broker_xxx` / `yahoo` |
| `MARKET_DATA_API_KEY` (+ identifiants courtier si besoin) | Prix |
| `NEWS_API_KEY` | Optionnel (si GNews etc.) |
| `WEATHER_API_KEY` | Vide avec Open-Meteo (pas de clé) — gardé pour un futur fournisseur |
| `TELEGRAM_BOT_TOKEN` | Bot |
| `TELEGRAM_CHAT_ID` | Ton identifiant Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Sécurise le webhook |
| `DATABASE_URL` | Connexion Postgres (migrations) |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | Accès serveur à la base |
| `ANTHROPIC_API_KEY` | IA |
| `AI_MODEL_ANALYSIS` · `AI_MODEL_CLASSIFY` | Choix des modèles |
| `APP_PASSWORD` · `SESSION_SECRET` | Connexion |
| `CRON_SECRET` | Protection des crons |

---

## 16. Coût estimatif (par mois)

| Poste | Coût |
|---|---|
| Vercel Hobby | 0 € |
| Supabase Free | 0 € |
| Données prix (courtier / Yahoo) | 0 € |
| Météo, ENSO, COT, FX, RSS | 0 € |
| Telegram | 0 € |
| **Claude API** | voir ci-dessous |
| Nom de domaine (optionnel) | ~1 €/mois |

**Estimation IA** (hypothèses : après dédoublonnage ~25 nouveaux événements news/jour × ~2 000 tokens entrée + 300 sortie ; ~15 synthèses/jour × ~6 000 entrée + 800 sortie) :

| Configuration | Tarif (entrée / sortie par million de tokens) | Coût estimé |
|---|---|---|
| Tout en **Opus 5** | 5 $ / 25 $ | ≈ **36 $/mois** |
| Synthèses **Opus 5** + classification **Haiku 4.5** (1 $ / 5 $) | — | ≈ **25 $/mois** |
| Tout en **Sonnet 5** (2 $ / 10 $) | — | ≈ **14 $/mois** |
| Tout en **Haiku 4.5** | — | ≈ **7 $/mois** |

Leviers pour baisser sans perdre en qualité : cache des prompts (la partie fixe « contexte + règles » est facturée ~10 % à la relecture), synthèse **seulement quand un score change**, plafond de dépense configuré dans la console Anthropic. **Le choix du modèle t'appartient** : c'est un arbitrage coût/qualité à mettre en regard d'un budget de trade de 150 €.

**Total réaliste : entre ~7 et ~36 $/mois**, dont 100 % d'IA.

---

## 17. Plan de développement par étapes

Chaque phase se termine par : code testé → commit → déploiement → **tu valides** avant la suivante.

| Phase | Contenu | Livrable utilisable | Taille |
|---|---|---|---|
| **1 — Foundation** | Projet Vite+React, déploiement Vercel, base Supabase + migrations, `MarketDataProvider` (courtier et/ou Yahoo), stockage prix + bougies, FX, `data_source_status`, page War Room minimale (prix Londres/NY, variation, source, heure, `DELAYED`/`OFFLINE`), mot de passe | **Un prix fiable, honnêtement étiqueté, avec historique** | S |
| **2 — Trade Manager** | Entrées 1/2/3, prix moyen, P&L, exposition, risque, R, stop (avec historique), objectifs, statuts, journal avec snapshot, **tests des calculs** | Suivi de position exact | S |
| **3 — News + Telegram** | RSS, dédoublonnage, événements maîtres, classification IA, score d'importance, anti-spam, cooldown, bot + `/status` + commandes, mode silencieux, Alert Center | Veille + alarme | M |
| **4 — Fundamentals** | Météo (zones + anomalies), ENSO, COT, saisie manuelle (production, stocks, arrivages, grindings), score fondamental + raisons + contre-facteurs | Biais fondamental expliqué | M |
| **5 — Technical** | Agrégation multi-timeframe, swings, structure, S/R, pivots D/W, ATR, VWAP, volume, graphique avec niveaux | Lecture technique | M |
| **6 — ICT / Liquidity** | EQH/EQL, PDH/PDL, PWH/PWL, sweeps, BOS, CHoCH, displacement, FVG, OB, carte de liquidité (`ESTIMATED LIQUIDITY`) | Carte ICT sur le graphique | M |
| **7 — Confluence** | Score de confluence, séquences LONG/SHORT, DO NOTHING, statuts de thèse, conditions d'entrées, alertes setup | **Le cœur de la War Room** | M |
| **8 — AI Analyst** | Synthèse, contradictions, explications de changement de score, « qu'est-ce qui a changé depuis ma dernière visite ? », vérificateur de chiffres | Équipe virtuelle | S |
| **9 — History** | Relecture des signaux passés, pertinence des confluences, quelles news ont compté | Apprentissage post-trade | S |
| **10 — Polish** | Mobile, vitesse, logs, gestion d'erreurs, UX | Version finale | S |

Ordre respecté du cahier. Remarque : on pourrait avancer la Phase 2 avant la 1 si tu as **déjà** une position ouverte (saisie manuelle du prix actuel en attendant). À toi de dire.

---

## 18. Questions à trancher avant la Phase 1

Ces réponses changent directement le code :

1. **Sur quel courtier / quelle application vas-tu passer (ou as-tu passé) le trade ?** (ex. IG, eToro, Plus500, XTB, Capital.com, Trade Republic, Boursorama…)
   → Détermine la source de prix principale et la formule de P&L.
2. **Quel produit exactement ?** CFD « Cacao Londres », CFD « Cacao US », ETC (ex. un tracker cacao en bourse), turbo/certificat ?
   → Détermine si le prix moyen se calcule en capital/quantité ou en moyenne pondérée, et comment calculer le risque.
3. **Marché de référence principal : Londres (£) ou New York ($) ?** Les deux seront affichés, mais un seul pilote le trade.
4. **As-tu déjà une position ouverte ?** Si oui, on commence peut-être par la Phase 2.
5. **Accepte-tu des données différées (~15 min) gratuites** pour le contexte, en attendant ?
6. **Comptes à créer** (gratuits, je te guiderai pas à pas le moment venu) : Vercel, Supabase, bot Telegram (via @BotFather), clé API Anthropic.
7. **Confluence affichée sur /15 au lieu de /12** (section 13.3) : OK ?
8. **Modèle IA** : Opus 5 partout (meilleure qualité, ~36 $/mois) ou une option moins chère (section 16) ?

---

## 19. Points à vérifier pendant le développement (⚠️)

Honnêteté : ces points dépendent de services qui changent souvent ; je les vérifierai concrètement au moment de les brancher plutôt que de les supposer.

- Disponibilité du cacao Londres dans l'API du courtier choisi et ses quotas historiques
- Stabilité de l'accès Yahoo `CC=F` depuis les serveurs Vercel (certains hébergeurs sont bloqués)
- Couverture Stooq / Databento pour le cacao ICE
- Format et accessibilité des fichiers ICE (stocks certifiés, COT Londres)
- Format des probabilités ENSO IRI
- Horaires exacts de séance ICE (et changements d'heure été/hiver)
- Limites actuelles des plans gratuits Vercel et Supabase
