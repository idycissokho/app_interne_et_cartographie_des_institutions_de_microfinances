# Prompt à donner à Claude Code : reproduire la maquette à l'identique

> Mode d'emploi
> 1. Copie tout le dossier `maquette-carto-imf/` à la racine de ton projet frontend (à côté de `src/`).
> 2. Exporte chaque écran de la maquette en PNG (1440 px de large) et mets les images dans `maquette-carto-imf/captures/` sous les noms `01-connexion.png`, `02-tableau-de-bord.png`, etc.
> 3. Dans Claude Code (VS Code), colle le texte ci-dessous.

---

Tu dois **reproduire à l'identique** la maquette « Carto IMF — Or & Nuit » dans le frontend React (Vite) de ce projet. Le backend Django REST + PostGIS est opérationnel : **ne le modifie pas**. Une première page existe déjà avec Motion : garde ce qui est réutilisable, mais l'apparence finale doit être celle de la maquette.

## Règle n° 1 : fidélité absolue

- La source de vérité, ce sont les fichiers de `maquette-carto-imf/ecrans/` et `maquette-carto-imf/composants/`, plus les captures de `maquette-carto-imf/captures/`.
- **Ne réinterprète rien et n'« améliore » rien.** Reprends exactement les couleurs hexadécimales, tailles de police, graisses, `letter-spacing`, espacements, rayons, ombres, dégradés, textes, icônes (tracés SVG inclus) et l'ordre des éléments.
- Toutes les valeurs sont écrites en `style="…"` dans les fichiers. Transcris-les telles quelles : valeurs arbitraires Tailwind (`rounded-[20px]`, `text-[#8A6A1F]`…) ou CSS modules. Centralise les couleurs récurrentes dans des tokens (voir `DESIGN_SYSTEM.md`) **sans changer leur valeur**.
- Les textes sont en français, avec les accents et les espaces insécables, comme dans la maquette.
- En cas de doute entre ton intuition et la maquette, c'est la maquette qui a raison. Si quelque chose est impossible à reproduire, demande-moi au lieu de changer.

## Comment lire les fichiers `.dc.html`

C'est du HTML avec un petit moteur de gabarits. Correspondances avec React :

| Dans la maquette | En React |
|---|---|
| Le contenu de `<x-dc> … </x-dc>` | Le JSX du composant |
| `{{nom}}` ou `{{objet.champ}}` | Une valeur calculée dans `renderVals()` → variable, prop ou état |
| `<sc-for list="{{items}}" as="item">…</sc-for>` | `items.map(item => …)` |
| `<sc-if value="{{cond}}">…</sc-if>` | `{cond && …}` |
| `<dc-import name="Sidebar" active="macro" role="superviseur">` | `<Sidebar active="macro" role="superviseur" />` (attributs kebab-case → props camelCase : `fill-mode` → `fillMode`, `on-pick` → `onPick`) |
| `onClick="{{pick}}"`, `onChange`, `onInput`, `onMouseEnter` | Gestionnaires d'événements React |
| `class Component extends DCLogic` : `constructor` / `this.state` / `setState` / `renderVals()` | Hooks `useState` / `useMemo` ; la logique de `renderVals()` se transpose presque mot pour mot |
| `<helmet><style>…</style></helmet>` | CSS global de l'écran : `@keyframes`, `:hover`, `:focus`, `prefers-reduced-motion` |
| Styles construits en chaîne dans `renderVals()` (`style: 'background: …'`) | Styles conditionnels (classes ou objets `style`) aux **mêmes valeurs** |
| `<animate …>` dans les SVG | À garder tel quel (React le supporte), ou à refaire avec Motion à durées identiques |
| `fetch('/_blob/9e3a…')` | À remplacer par les appels à l'API Django. Le fichier `assets/senegal-imf.demo.json` montre la forme des données attendues et peut servir de mock |
| `<img src="/_blob/aad2…">` | `assets/logo-drs-sfd.png` |
| `href="Tableau.dc.html"` | Une route `react-router` (voir le plan ci-dessous) |

Ignore les blocs `<sc-if value="{{showOld}}">` : ce sont d'anciennes versions masquées de la carte.

## Écrans, routes et rôles

| Fichier | Route | Rôles |
|---|---|---|
| `ecrans/01-connexion.dc.html` | `/connexion` | public (auth JWT existante) |
| `ecrans/02-tableau-de-bord.dc.html` | `/` | tous |
| `ecrans/03-carte-macro.dc.html` | `/carte/macro` | tous |
| `ecrans/04-carte-micro.dc.html` | `/carte/micro` | tous |
| `ecrans/05-espace-supervision.dc.html` | `/supervision` | ROLE_ADMIN, ROLE_SUPERVISOR |
| `ecrans/06-espace-consultation.dc.html` | `/consultation` (annuaire + fiche IMF en lecture seule) | ROLE_CONSULT (et les autres en lecture) |
| `ecrans/07-institutions.dc.html` | `/imf` (liste, onglets par statut, filtres, sélection multiple, pagination) | ROLE_ADMIN, ROLE_SUPERVISOR |
| `ecrans/08-formulaire-imf.dc.html` | `/imf/nouveau` et `/imf/:id/modifier` | ROLE_ADMIN, ROLE_SUPERVISOR |
| `ecrans/09-points-de-service.dc.html` | `/points-service` (liste + tiroir de création/édition) | ROLE_ADMIN, ROLE_SUPERVISOR |
| `ecrans/10-dirigeants.dc.html` | `/dirigeants` (liste des mandats + modale en 2 étapes) | ROLE_ADMIN, ROLE_SUPERVISOR |
| `ecrans/11-import-export.dc.html` | `/donnees` (onglets Importer / Exporter) | ROLE_ADMIN, ROLE_SUPERVISOR |
| `composants/Sidebar.dc.html` | Layout commun | Ses menus changent selon le rôle, exactement comme dans `renderVals()` |

### Formulaires (écrans 08 à 11)

- Les champs des formulaires correspondent aux modèles Django (`IMF`, `PointService`, `Dirigeant`, `Mandat`, `ImportationFichier`). Utilise les **valeurs d'enum du backend** (`MUTUELLE`, `COOPERATIVE`, `SA` ; `AGREE`, `EN_COURS`, `RADIEE` ; `SIEGE`, `AGENCE`, `GUICHET`, `BUREAU` ; `OUVERT`, `FERME`, `SUSPENDU` ; `EN_FONCTION`, `INTERIM`, `SUSPENDU` ; les 12 fonctions de `Mandat.FonctionMandat`).
- Les écrans 01 à 06 utilisent encore « Caisse » et « En pause » pour les points de service : remplace-les par les valeurs du backend (Siège social / Agence / Guichet / Bureau de représentation ; Ouvert / Fermé / Suspendu), en gardant le même style.
- Reprends à l'identique : style des champs (`fi-input`, `ps-input`, `di-input` = même style), focus doré, état d'erreur rouge, cartes de choix radio, contrôles segmentés, zone de dépôt de fichier, barre d'actions collante, toast de confirmation, tiroir latéral et modale. Fais-en des composants partagés (`TextField`, `SelectField`, `ChoiceCards`, `Segmented`, `FileDrop`, `Drawer`, `Modal`, `Toast`).
- Validation côté client identique à la maquette (champs obligatoires, email, coordonnées dans le Sénégal, date de fin ≥ date de début), puis affichage sous chaque champ des erreurs renvoyées par DRF.
- La région, le département et la commune d'un point de service sont déduits par le backend à partir du GPS : afficher ces champs en pointillés « déduits automatiquement » et ne les envoyer que si l'utilisateur les modifie.
- Le formulaire de mandat gère deux cas : dirigeant existant (recherche) ou nouveau dirigeant (création puis mandat). Le justificatif accepte un fichier (`fichier_justificatif`, PDF/JPG/PNG) ou un lien (`documents_justificatifs`).
- L'import envoie `type_import` + `fichier`, puis affiche `nb_lignes_total`, `nb_lignes_importees`, `nb_lignes_erreur`, `taux_succes` et `rapport_erreurs` exactement comme l'étape « Rapport ».

Le tableau de bord de la maquette contient sa propre barre latérale, identique au composant `Sidebar` : utilise le composant partout.

## La carte du Sénégal (`composants/CarteSenegal.dc.html`)

- Crée **un seul composant** `<SenegalMap>` avec les mêmes props : `theme`, `fillMode` (`regions` | `choro` | `muted`), `indicator`, `selected`, `flow`, `showPoints`, `showLabels`, `pointFilter`, `selectedPoint`, `onPick`, `onPickPoint`.
- Reproduis-le **en SVG**, comme dans la maquette (pas MapLibre pour cette version) : même `viewBox="-6 -6 652 488"`, mêmes filtres (`feDropShadow`, lueur), même motif de hachures, même ordre des calques (régions → sélection → lignes animées → points → impulsions → étiquettes).
- Les tracés `d` des 14 régions, déjà projetés, se trouvent dans `assets/senegal-imf.demo.json` (`regions[].d`, `lx`/`ly` pour les étiquettes, `color` pour la couleur de chaque région). Mets-les dans `src/data/senegalRegions.ts` (géométrie seulement). Les indicateurs (IMF, points, membres, encours) viennent de l'API, associés par nom de région.
- Pour placer les points de service venant de l'API (lat/lon), utilise **exactement** cette projection :
  ```js
  const C = Math.cos(14.5 * Math.PI / 180);
  const k = 620 / ((-11.34 + 17.56) * C);
  const x = (lon + 17.56) * C * k + 10;
  const y = (16.71 - lat) * k + 10;
  ```
- Animations à garder à l'identique : apparition des régions (`opacity` 0 → 1 en 0,9 s, +0,08 s par région) ; lignes qui courent sur les frontières (`pathLength="1000"`, `stroke-dasharray="46 954"`, `stroke-dashoffset` de 1000 à 0, durée `5 + (i % 5) * 0.9` s, en boucle) ; impulsions des sièges (`r` 3 → 14 et opacité 0,9 → 0 en 2,6 s) ; transition de couleur de 0,45 s.
- Le dégradé choroplèthe et la fonction `mix()` / `scale()` sont dans le fichier : recopie-les.
- Laisse la mention « Limites administratives : Gouvernement du Sénégal / OCHA via geoBoundaries (CC BY 3.0 IGO) » dans la légende de la carte macro.

## Animations des pages

Reprends les `@keyframes` de chaque `<helmet>` (`ci-up`, `tb-up`, `cm-in`, `mi-sheet`, `su-grow`…) avec les mêmes durées, retards et courbes (`cubic-bezier(.2,.7,.2,1)`). Tu peux les faire avec Motion (`initial` / `animate` / `transition`) à condition que le rendu soit identique. Respecte `prefers-reduced-motion`.

## Données

- Les chiffres de la maquette sont fictifs : branche chaque bloc sur l'API existante. Lis d'abord les endpoints du backend (`urls.py`, serializers) et fais-moi la liste des correspondances avant de coder.
- S'il manque un endpoint (agrégats par région, alertes de supervision, file de validation…), **ne modifie pas le backend** : signale-le-moi et utilise un mock typé en attendant.
- Supprime les mentions « Données fictives de démonstration » quand le bloc est branché sur de vraies données.
- Les placeholders entre crochets (`[Nom du dirigeant]`, `[Sigle IMF]`…) deviennent les vraies valeurs.

## Méthode de travail

1. Lis toute la maquette, puis propose-moi un plan : arborescence `src/`, composants partagés, tokens, routes, correspondances avec l'API.
2. Fais d'abord les fondations : tokens, police Plus Jakarta Sans auto-hébergée (`@fontsource/plus-jakarta-sans`), `Sidebar`, `SenegalMap`.
3. Puis un écran à la fois, dans l'ordre 01 → 06. Après chaque écran : lance le serveur de dev, fais une capture à 1440 px de large, **compare-la avec `maquette-carto-imf/captures/<écran>.png`**, corrige chaque écart, puis vérifie à 375 px (pas de défilement horizontal).
4. Ne passe à l'écran suivant que lorsque la capture correspond à la maquette.

## Critères d'acceptation

- Chaque écran est visuellement identique à sa capture : couleurs, typographie, espacements, rayons, ombres, icônes, textes.
- Toutes les interactions de la maquette fonctionnent : sélection de région, choix de l'indicateur, filtres de la carte micro, fiche latérale, onglets, Valider/Rejeter, recherche et filtres de l'annuaire.
- Les animations sont présentes et désactivées si `prefers-reduced-motion`.
- Aucun changement dans le backend.
