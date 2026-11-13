# Design system « Or & Nuit » — Carto IMF

> Référence de design (couleurs, stack, règles). À utiliser avec PROMPT_REPRODUCTION.md, qui est le prompt principal.
> Mets aussi le logo `logo-drs-sfd.png` dans `src/assets/` (idéalement une version HD ou SVG).

---

Tu travailles sur le frontend React (Vite) de **Carto IMF**, l'application interne de cartographie et de gouvernance des Institutions de Microfinance du Sénégal pour la **DRS-SFD (Ministère des Finances et du Budget)**. Le backend Django REST + PostGIS existe déjà : **ne modifie pas l'API**, branche-toi sur les endpoints existants.

Objectif : un design **magnifique, sobre et institutionnel**, de dernière génération, qui fasse dire « waouh » sans gêner le travail quotidien. Commence par lire la structure du projet (`src/`, routes, appels API, composants existants) puis propose-moi un plan avant de coder.

## 1. Identité visuelle « Or & Nuit »

Crée des design tokens (variables CSS + `tailwind.config`) :

| Token | Valeur | Usage |
|---|---|---|
| `--nuit-900` | `#0B1424` | Barre latérale, hero, fonds des cartes |
| `--nuit-800` | `#13213A` | Surfaces sombres secondaires |
| `--or-500` | `#C9A44C` | Accent principal (boutons, contours, légende des cartes) — couleur du logo DRS-SFD |
| `--or-300` | `#F3D98C` | Accent sur fond sombre (chiffres, liens, éléments actifs) |
| `--or-700` | `#8A6A1F` | Or **pour du texte sur fond clair** (contraste ≥ 4,5:1) |
| `--ivoire` | `#FAF7F0` | Fond des pages de travail |
| `--sable` | `#ECE5D5` | Bordures |
| `--succes` / `--alerte` / `--danger` | `#15803D` / `#D97706` / `#B91C1C` | Statuts : agréée / en cours / radiée ; en fonction / intérim / suspendu |

Règles :
- Ne **jamais** écrire du texte en `#C9A44C` sur du blanc (illisible). Bouton or = texte `--nuit-900`.
- Police unique **Plus Jakarta Sans** (400 → 800), **auto-hébergée** avec `@fontsource/plus-jakarta-sans` (l'intranet peut ne pas avoir Internet). Titres en 800, `letter-spacing: -0.02em`.
- Rayons : 14 px (champs, boutons), 20–24 px (cartes). Ombres douces, pas de dégradés criards.
- Icônes : `lucide-react` uniquement, aucun emoji dans l'interface.
- Motif signature : **trame de points dorés** (SVG `pattern`) dans les fonds sombres et dans la silhouette du Sénégal.

## 2. Stack UI à installer

- `tailwindcss` + `shadcn/ui` (Radix) pour les composants (Dialog, Sheet, Tabs, Select, Command, Toast, Tooltip, DataTable).
- `motion` (Framer Motion) pour les animations ; `lenis` pour le défilement fluide (pages vitrine seulement).
- `maplibre-gl` + `react-map-gl/maplibre` pour les cartes (pas de jeton Mapbox). Fond de carte sombre personnalisé ; prévoir que les tuiles puissent être auto-hébergées.
- `@tanstack/react-table` pour les référentiels, `echarts-for-react` (ou Recharts) pour les graphiques.
- `react-countup` (ou une animation Motion) pour les compteurs.

## 3. Règle d'or des animations

- **Pages vitrine** (Connexion, Tableau de bord, Carte macro) : apparitions en cascade (fade + translateY 14 px, 0,6–0,9 s, `cubic-bezier(.2,.7,.2,1)`, décalage 80 ms), compteurs animés, barres qui se remplissent, points de la carte qui « pulsent », contour du Sénégal qui se dessine (stroke-dashoffset).
- **Pages de travail** (listes, formulaires, import, audit) : uniquement des micro-interactions de 150–200 ms (survol, focus doré, toasts, skeletons de chargement). Rien qui ralentisse la saisie.
- Respecter `prefers-reduced-motion` partout (désactiver les animations).

## 4. Écrans à réaliser (dans cet ordre)

1. **Connexion** — écran divisé : à gauche fond nuit, titre « La microfinance du Sénégal, *sur une seule carte.* », silhouette du Sénégal en trame de points dorés avec des points de service qui pulsent, carte en verre dépoli flottante (KPI). À droite fond ivoire : logo DRS-SFD, formulaire (email professionnel, mot de passe, rester connecté), bouton or, encart « Accès réservé — consultations des fiches dirigeants journalisées ». Brancher sur l'auth JWT existante.
2. **Layout applicatif** — barre latérale nuit (Pilotage : Tableau de bord, Carte micro, Carte macro / Référentiels : IMF, Points de service, Dirigeants & mandats / Données : Import-Export, Journal d'audit), élément actif en pilule dorée, carte utilisateur avec son rôle en bas. Barre du haut : recherche globale ⌘K (shadcn Command), Exporter, Nouvelle IMF, notifications. Sur mobile, la barre latérale devient un Sheet.
   - Afficher/masquer les menus selon le rôle RBAC (admin / superviseur / consultation).
3. **Tableau de bord** — bandeau nuit « Bonjour, {prénom} » + date ; 4 KPI animés (IMF agréées, points de service + % géolocalisés, dirigeants en fonction + mandats expirant sous 90 j, communes couvertes + jauge) ; carte « Présence territoriale » (cercles proportionnels par région) ; liste « Mandats à renouveler » (badge de fonction PCA/DG/GÉR, jours restants colorés) ; IMF par type (barres) ; statut réglementaire (barre empilée) ; activité récente (journal d'audit).
4. **Carte macro** (cahier §5.5) — plein écran sombre. Sélecteur segmenté Régions / Départements / Communes ; panneau gauche « Indicateur » (points de service, IMF présentes, membres, encours) + classement Top 8 avec mini-barres ; carte MapLibre avec **polygones PostGIS** en choroplèthe dégradé or (ou cercles proportionnels) ; au clic, carte détail en verre (IMF, points, membres, encours, principaux bailleurs, lien « Voir les points de service ») ; légende en bas à gauche. Transitions fluides (`flyTo`, fondu des couleurs).
5. **Carte micro** (cahier §5.4) — plein écran, panneau de filtres flottant (IMF, région, type de point, statut, bailleur), clustering, marqueur différent par type (siège, agence, caisse, guichet) et couleur par statut. Au clic : un **Sheet latéral** (pas un simple popup) avec nom IMF + point, région/département/commune, contacts, statut, bouton « Ouvrir la fiche IMF ».
6. **Fiche IMF** — en-tête (sigle en médaillon, nom, type, badge de statut réglementaire, mini-carte du siège), onglets Aperçu / Points de service / Dirigeants / Bailleurs / Documents. Onglet Dirigeants : cartes par fonction, filtre par type, frise des mandats, justificatifs téléchargeables.
7. **Référentiels (listes)** — DataTable : recherche, filtres en chips, tri, pagination, sélection multiple, export, lignes cliquables, état vide illustré, skeletons.
8. **Import Excel/CSV** — glisser-déposer → mapping des colonnes → aperçu avec erreurs ligne par ligne (en rouge) → validation → rapport final.
9. **Journal d'audit** — timeline filtrable (utilisateur, action, objet, date).

## 4 bis. La carte du Sénégal (pièce maîtresse)

- Utiliser les **vrais contours des 14 régions** : fichier `senegal-regions-adm1.geojson` (geoBoundaries, source Gouvernement du Sénégal / OCHA, licence CC BY 3.0 IGO — mettre la mention dans la légende). À terme, servir les polygones depuis PostGIS (`/api/map/zones/?niveau=region|departement|commune`).
- Un composant unique `<SenegalMap>` réutilisé partout, avec les props : `theme` (light/dark), `fillMode` (`regions` = une couleur par région, `choro` = dégradé or selon l'indicateur, `muted`), `indicator`, `selected`, `showPoints`, `onPickRegion`, `onPickPoint`.
- Palette par région (mode `regions`) : Dakar `#C9A44C`, Thiès `#2F6F8F`, Diourbel `#B5763A`, Fatick `#4F8A6B`, Kaolack `#8C5A3C`, Kaffrine `#D9B65E`, Louga `#5E7FA8`, Saint-Louis `#1F4E79`, Matam `#A88B5A`, Tambacounda `#3E6B5A`, Kédougou `#7A4E2D`, Kolda `#6B8E4E`, Sédhiou `#8F6A9A`, Ziguinchor `#2E7D6B`.
- Dégradé choroplèthe : `#F7EED3 → #EBD594 → #D9B65E → #C29433 → #9A7124 → #6E4F17 → #43300D` (échelle racine carrée).
- **Animations de la carte** : (1) apparition des régions en cascade (80 ms d'écart) ; (2) **lignes lumineuses qui courent le long des frontières** : chaque contour est redessiné par-dessus avec `pathLength=1000`, `stroke-dasharray="46 954"` et une animation de `stroke-dashoffset` de 1000 à 0 (durée 5 à 8,6 s selon la région, avec flou de lueur) ; (3) région survolée plus lumineuse, région sélectionnée avec contour épais, hachures et lueur ; (4) sièges qui pulsent (cercle qui grandit et s'efface) ; (5) transition de couleur de 450 ms quand on change d'indicateur.
- Avec MapLibre : couches `fill` + `line` pour les régions, et une couche `line` animée (`line-dasharray` mis à jour via `requestAnimationFrame`) pour l'effet des lignes qui courent.

## 4 ter. Espaces par rôle

- **Espace supervision (ROLE_SUPERVISOR)** : 4 alertes (mandats expirés ou < 30 j, points sans GPS, fiches incomplètes, IMF en cours d'agrément) ; carte des zones sous-desservies + régions les moins couvertes ; missions de supervision (onglets À venir / En cours / Terminées, avec progression) ; file de validation des modifications (Valider / Rejeter) ; qualité des référentiels (barres de complétude).
- **Espace consultation (ROLE_CONSULT)** : annuaire des IMF (recherche, filtres par type) + fiche IMF en lecture seule (onglets Aperçu, Points de service, Dirigeants, Bailleurs). Onglet Dirigeants : cartes par fonction, statut, frise de mandat, justificatif ; bandeau « consultation journalisée ». Aucun bouton de modification ; pas d'Import ni de Journal d'audit dans la barre latérale.

## 5. Qualité attendue

- Responsive jusqu'à 375 px, sans défilement horizontal de la page (les tableaux défilent dans leur boîte).
- Accessibilité : vrais `<button>` / `<a>` / `<label>`, `aria-label` sur les boutons-icônes, focus visible doré, contraste AA.
- États systématiques : chargement (skeleton), vide, erreur, succès (toast).
- Composants réutilisables dans `src/components/ui` et `src/components/carto` ; tokens centralisés ; aucune couleur codée en dur hors des tokens.
- Mode sombre : les cartes sont toujours sombres ; les pages de travail restent claires (ivoire).

Travaille écran par écran ; après chaque écran, lance le serveur de dev, vérifie le rendu à 1440 px et à 375 px, puis passe au suivant.
