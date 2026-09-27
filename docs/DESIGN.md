# COCOA WAR ROOM — Système de design

> Version 0.1 — 27/09/2026
> Traduit la direction artistique en règles concrètes que le code appliquera.
> Maquette interactive : `prototype/war-room.html` (valeurs fictives).

---

## 1. Principes (dans l'ordre de priorité)

1. **Lisible en 5 secondes sur un téléphone.** Prix, statut, ce qui a changé. Le reste attend qu'on le demande.
2. **L'animation explique, elle ne décore pas.** Toute animation est déclenchée par une donnée réelle ou un geste de l'utilisateur.
3. **Aucune fausse activité.** Le fond et le Market Pulse bougent selon un calcul, jamais au hasard pour « faire vivant ».
4. **Le vide est volontaire.** « Rien à faire » est un écran à part entière, calme et presque vide.
5. **Si un effet gêne l'usage, on le supprime.**

---

## 2. Couleurs

Fond sombre bleuté, jamais noir pur. Une couleur = un sens. Aucune couleur décorative.

| Jeton | Hex | Sens |
|---|---|---|
| `--bg` | `#070A0F` | Fond |
| `--ink` | `#E6E9EE` | Texte principal (blanc cassé) |
| `--ink-2` / `--ink-3` | `#A5AEBB` / `#6D7786` | Secondaire / métadonnées |
| `--data` | `#62C6DE` | Donnée, liquidité, Market Pulse |
| `--ok` | `#4CC38A` | Bullish, confirmation, positif |
| `--risk` | `#E5574F` | Bearish, risque, invalidation |
| `--watch` | `#D8B34C` | Sous surveillance, donnée différée |
| `--dev` | `#E58A4A` | Setup en formation |
| `--struct` | `#9C8FF5` | Structure / ICT uniquement, par petites touches |
| `--none` | `#8A93A1` | Neutre, aucun setup |

**Règle d'accessibilité :** une couleur n'est jamais seule. Chaque état a aussi un texte et une forme d'icône :

| Statut | Forme | Texte | Couleur |
|---|---|---|---|
| No setup | ○ cercle vide | Aucun setup | gris |
| Watching | ◔ quart plein | Sous surveillance | ambre |
| Setup developing | ◑ demi plein | Setup en formation | orange |
| High confluence | ● plein avec coche | Haute confluence | vert |
| Thesis invalidated | ⊗ croix | Thèse invalidée | rouge |

---

## 3. Typographie

| Rôle | Police | Usage |
|---|---|---|
| Chiffres héros | **Geist** graisse 200-250, chiffres tabulaires | Prix, score, P&L. Très fin et très grand : c'est la signature typographique |
| Texte | **Geist** 400-600 | Titres, phrases |
| Données et étiquettes | **Geist Mono** 400-500 | Horodatages, sources, niveaux, petites étiquettes en capitales espacées |

- Échelle : 10.5 / 12 / 14 / 15 / 17 / 23 / 48 / 72 px.
- Les majuscules sont réservées aux petites étiquettes mono, jamais aux gros titres.
- Dans l'app réelle, les polices sont servies par le site lui-même (paquet `@fontsource`), pas par Google.

---

## 4. Surfaces et profondeur

| Niveau | Rôle | Traitement |
|---|---|---|
| 1 · Fond | Ambiance | `--bg` + « flow » (lignes animées sur canvas) + deux halos très diffus |
| 2 · Surface | Groupes d'information | Verre : fond 46 % d'opacité, flou 18 px, bordure 1 px à 11 % |
| 3 · Important | Confluence, cartes touchables | Verre plus opaque (66 %), bordure plus visible |
| 4 · Critique | Statut War Room, alerte | 84 % d'opacité + lueur colorée par l'état |

- **Verre dynamique** : un reflet très doux suit le doigt ou la souris, avec 700 ms de retard (propriété CSS animée, aucun calcul JS lourd).
- Rayons : 22 px (cartes), 14 px (tuiles), 10 px (petits éléments). Pas le même rayon partout.
- Beaucoup d'éléments n'ont **pas** de carte : listes, séparateurs fins, texte posé sur le fond.

---

## 5. Système d'animation

| Catégorie | Durée | Pour |
|---|---|---|
| Micro | 100-200 ms | Appui bouton, toggle, surlignage |
| Standard | 200-400 ms | Cartes, changement d'onglet, accordéons |
| Immersive | 400-800 ms | Changement de statut, carte qui s'ouvre en page, tracé de la timeline |

Courbe unique : `cubic-bezier(.2, .7, .2, 1)` (démarre vite, se pose doucement).

| Événement réel | Animation |
|---|---|
| Nouveau prix | Le chiffre défile de l'ancien au nouveau (600 ms) + lueur verte ou rouge brève |
| Changement de statut | La couleur glisse, un liseré fait le tour de la carte une fois, le texte apparaît en fondu net |
| Score de confluence qui change | Chiffre qui défile + segments qui s'allument un par un (35 ms d'écart) |
| « Ce qui a changé » | Lignes qui arrivent en cascade (65 ms d'écart, moins de 700 ms au total) |
| Overlay activé (FVG, liquidité…) | Fondu progressif sur le graphique, jamais d'apparition brutale |
| Sweep de liquidité | Halo sur la bougie concernée + la ligne passe à l'état « Swept » |
| Carte Confluence touchée | La carte s'agrandit en panneau de détail (transition « élément partagé ») |
| Alerte critique | Le fond converge vers le centre, puis retour au calme |

**Toujours :**
- Uniquement `transform`, `opacity` et le canvas. Aucune animation de mise en page.
- `prefers-reduced-motion` : toutes les animations deviennent instantanées, le flow se fige.
- Le flow tourne à 30 images/s maximum et s'arrête quand l'onglet est caché (batterie).
- Aucune information n'existe uniquement dans une animation.

---

## 6. Éléments signature

### 6.1 Market Pulse

Indicateur **d'activité du système**, de 0 à 100. Ce n'est ni une prédiction ni une probabilité.

```
Pulse = 30 × volatilité (ATR actuel / moyenne 20 j, plafonné)
      + 25 × mouvement du prix (variation 1 h / ATR)
      + 20 × nouvelles importantes récentes (importance, décroissance sur 6 h)
      + 15 × changement du score de confluence
      + 10 × changement du score fondamental
```

| Valeur | État | Visuel |
|---|---|---|
| 0-29 | Calme | Point creux, 1 onde lente (4,2 s) |
| 30-69 | Actif | Point plein, 2 ondes (2,6 s) |
| 70-100 | Convergence | Point lumineux, 3 ondes rapides (1,5 s) |

Toucher le Pulse ouvre sa décomposition. Une version miniature reste dans la barre du haut.

### 6.2 Flow d'arrière-plan

13 lignes fines cyan à 3-7 % d'opacité. Leur vitesse suit le Pulse. Lors d'une alerte critique, elles convergent vers le centre pendant 1,6 s. Léger parallaxe au défilement (6 %).

### 6.3 War Room Status

La pièce centrale : statut, raisons cochées ✓ / manquantes ○, et surtout **la prochaine étape** (« ce qui doit se produire avant d'envisager une entrée »).

### 6.4 Ce qui a changé

Répond à la question centrale du cahier : *« Qu'est-ce qui a changé depuis ma dernière analyse ? »* L'app mémorise l'heure de ta dernière visite et compare.

### 6.5 Market Story

Timeline des 48 dernières heures. Les événements importants ont un point plus gros et lumineux, les critiques un point rouge. La ligne se dessine au défilement. Chaque événement lié à une news s'ouvre en détail.

---

## 7. Écrans (mobile d'abord)

Navigation basse, 5 onglets, icônes dessinées (pas d'emojis) + libellé. Glisser à gauche ou à droite change d'onglet. Chaque fonction reste accessible par un simple tap.

| Onglet | Ordre de lecture |
|---|---|
| **War Room** | Prix + Pulse → Statut → Ce qui a changé → Confluence → Ta thèse (Pourquoi / Mais… / Ce qui l'invaliderait) → Market Story |
| **Marché** | Prix → unités de temps (W1 → 5M) → graphique → overlays à activer → carte de liquidité → structure par unité de temps → volatilité et niveaux |
| **Fondamentaux** | Biais + score → 7 facteurs (barre centrée −2/+2, dépliables : donnée, avant, règle, source, fraîcheur) → pluie par pays → ENSO |
| **Intelligence** | Filtres → événements dédoublonnés (niveau, importance 0-100, direction, confiance, nombre de sources) → détail avec décision Telegram |
| **Trade** | Capital engagé / prévu → prix moyen, actuel, P&L, exposition → risque au stop sur 50 € → entrées 1-2-3 → conditions de l'entrée 3 |

**Mode « Rien à faire »** : à la place du statut, un cercle vide, une phrase, trois tuiles (Thèse / Timing / Confluence) et les raisons. Rien d'autre.

**Alerte critique** : prend l'écran, un seul chiffre, l'effet sur le score, deux boutons (« Revoir la thèse » / « Plus tard »). Rare par construction (seuil 70/100 + anti-spam).

**Appui long** sur une donnée : source, horodatage, définition. Ces informations sont aussi dans les panneaux de détail (jamais uniquement par geste).

**Fraîcheur** partout : ● vert Frais · ● ambre Différé · ● gris Ancien · ○ Indisponible, toujours avec le mot.

**Desktop** : mêmes composants, deux colonnes (contexte à gauche, détail à droite). Pas un second produit.

---

## 8. Mise en œuvre dans l'app React

| Besoin | Technique (sans librairie d'animation) |
|---|---|
| Transitions d'état, cascades | CSS (`@keyframes`, `transition`) + propriétés `@property` pour animer couleurs et reflets |
| Carte qui devient page | **View Transitions API** (Chrome, Safari 18+), repli en glissement simple ailleurs |
| Apparitions au défilement | `IntersectionObserver` (le contenu est visible par défaut, l'animation ne fait que l'accompagner) |
| Chiffres qui défilent | Petit hook `useTween` (requestAnimationFrame) |
| Graphique | `lightweight-charts` pour les bougies + une couche canvas à nous pour FVG, OB, liquidité |
| Flow | Un canvas 2D plein écran, piloté par la valeur du Pulse |

Budget : moins de 150 Ko de JavaScript compressé au premier chargement, 60 images/s au défilement sur un téléphone moyen.

---

## 9. Écarts avec la direction artistique (à valider)

| Dans la DA | Proposition | Pourquoi |
|---|---|---|
| Confluence « 8 / 12 » | **8 / 15** | Les points du cahier font 15 au total (voir ARCHITECTURE §13.3) |
| Emojis (🧠 📈 🟡…) | Icônes dessinées + formes d'état | La DA elle-même bannit « icônes partout » ; les emojis changent d'aspect selon le téléphone |
| « Confidence 82 % » sur une news | **LOW / MEDIUM / HIGH** | Un pourcentage donnerait une fausse précision à un jugement qualitatif |
| Statut « WATCHING » avec 8 points | **Setup en formation** à 8 points | Aligne le statut sur les seuils du score (5-7 watch, 8-10 interesting) |
| Textes en anglais (WHAT CHANGED…) | Interface en **français**, termes techniques gardés en anglais (BOS, FVG, sweep, bullish) | Lecture plus rapide, vocabulaire de trading inchangé |

---

## 10. Révision 0.2 : ce qui a été corrigé par rapport à la direction artistique

La v0.1 ressemblait à un tableau de bord générique : beaucoup de cartes identiques, des étiquettes en capitales partout, un verre invisible. Ce qui change :

| DA | v0.1 | v0.2 |
|---|---|---|
| §8-9 Glass et profondeur | Verre posé sur un fond uniforme, donc invisible | Fond de **champs de lumière** qui dérivent lentement ; le verre les floute réellement. Bord spéculaire en dégradé. 4 niveaux d'opacité |
| §11-12 Flow réactif | Lignes quasi invisibles | Lignes et lumière dont la vitesse et l'intensité suivent le Pulse ; convergence vers le centre sur alerte critique |
| §13-14 Market Pulse | Simple point | Anneaux qui respirent + **un arc par composante** : allumé si la donnée est branchée, éteint sinon |
| §15-16 War Room Status | Carte « Rien à faire » isolée | Pièce centrale : forme + mot + couleur, lueur de l'état, liseré qui tourne au changement d'état, « avant d'envisager une entrée » |
| §17-19, 54 Scroll storytelling et pinning | Absent | **Lecture du marché** : graphique épinglé pendant que défilent prix → structure → liquidités → pivots → position → verdict, chaque couche apparaît en fondu |
| §23-24 Market Story | Absente | Timeline des événements stockés en base, la ligne se dessine à l'arrivée |
| §26 Transitions « élément partagé » | Absentes | La carte Position devient l'en-tête du Trade Manager (View Transitions API) |
| §37 Alertes critiques | Absentes | Prise d'écran pour les événements critiques non lus, puis retour au contexte |
| §42 Espace, « pas 25 cartes » | Grilles de tuiles encadrées | Listes à filets fins ; le verre est réservé au statut, à la lecture du marché, à la position et aux formulaires |
| §41 Typographie | Capitales mono partout | Capitales supprimées ; mono réservé aux chiffres et horodatages ; chiffres héros en graisse 200 |
| §53 Parallax | Absent | Le prix glisse et s'efface légèrement au défilement |
