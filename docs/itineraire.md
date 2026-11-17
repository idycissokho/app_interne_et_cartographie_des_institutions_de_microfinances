# Section « Itinéraire »

Calcule le trajet le plus rapide, **à pied, à moto et en voiture**, entre la position d'un
superviseur et une IMF ou un point de service. Réservée aux rôles **SUPERVISEUR** et **ADMIN**
(le CONSULTANT ne voit pas le menu ; l'API lui répond 403).

## Comment ça marche

```
Navigateur ──POST /api/v1/itineraires/calculer/──▶ Django ──POST /route (×3 modes)──▶ Valhalla
 (position GPS                                      │ relit la destination en base   (carte OSM
  ou clic carte)                                    │ arrondit l'origine à ≈ 50 m     du Sénégal)
                                                    └ cache 10 min
```

- **Valhalla** est un moteur de calcul d'itinéraire libre (licence MIT) qui travaille sur les
  cartes OpenStreetMap. Il calcule le vrai trajet sur les routes et pistes (pas une distance à vol
  d'oiseau), une durée par mode et les consignes pas à pas en français.
- La destination est **toujours relue en base** à partir de son identifiant. Sont refusées, avec un
  message explicite, les structures sans GPS, à la position par défaut des fichiers sources
  (14.75 / -17.33333) ou hors du Sénégal. Pas de repli sur un autre point.
- **Confidentialité** : la position de l'utilisateur voyage dans le corps d'une requête POST (jamais
  dans l'URL, donc absente des journaux d'accès), n'est ni enregistrée en base ni écrite dans les
  journaux, et elle est arrondie à environ 50 m avant d'être transmise au moteur.
- Un mode que le moteur ne sait pas calculer (par exemple un trajet à pied trop long pour une
  instance publique) est affiché « Indisponible », sans estimation inventée.

Variables d'environnement (voir `backend/.env.example`) :

| Variable | Rôle | Défaut |
|---|---|---|
| `ROUTING_PROVIDER` | moteur (seul `valhalla` aujourd'hui ; d'autres peuvent être ajoutés dans `apps/itineraires/fournisseurs.py`) | `valhalla` |
| `ROUTING_URL` | adresse du serveur Valhalla. **Vide = section indisponible** (aucun appel vers l'extérieur) | vide |
| `ROUTING_TIMEOUT` | délai maximal d'une réponse, en secondes | `10` |
| `ROUTING_USER_AGENT` | identifiant de l'application envoyé au moteur | `cartographie-imf/1.0` |

## a) Démonstration en ligne

`ROUTING_URL=https://valhalla1.openstreetmap.de` (déjà dans `render.yaml`) : instance publique
de l'association FOSSGIS, gratuite, sans clé, **à usage modéré** (pas d'usage intensif ni de
traitement en masse). L'application limite à 30 calculs par minute et par compte, et met les
résultats en cache 10 minutes.

À savoir : en démonstration, la position arrondie du superviseur est envoyée à ce serveur tiers
(rien n'est stocké de notre côté). Sur l'intranet, avec un Valhalla interne, plus rien ne sort.

Limite constatée : l'instance publique refuse les trajets à pied très longs (plus de 200 km
environ) ; ils apparaissent « Indisponible ».

## b) Installer Valhalla sur le serveur de l'intranet

Besoins indicatifs pour le Sénégal : 2 Go de mémoire, 2 Go de disque, une construction des
tuiles de quelques minutes au premier démarrage.

### 1. Ajouter le service

Dans `infra/docker-compose.yml` (ou un fichier Compose à part), sur le même réseau que le backend :

```yaml
  valhalla:
    image: ghcr.io/valhalla/valhalla-scripted:latest   # remplacer « latest » par la version testée
    container_name: cartographie_imf_valhalla
    restart: unless-stopped
    environment:
      # Extrait OpenStreetMap Sénégal + Gambie (Geofabrik). Ignoré si le fichier est déjà présent.
      tile_urls: https://download.geofabrik.de/africa/senegal-and-gambia-latest.osm.pbf
      use_tiles_ignore_pbf: "True"
      build_elevation: "False"
      build_admins: "True"
      build_time_zones: "True"
      server_threads: "2"
    volumes:
      - valhalla_tiles:/custom_files
    networks:
      - imf_network
    # Pas de « ports: » : seul le backend l'interroge, par le réseau Docker.

volumes:
  valhalla_tiles:
```

Puis dans `config/.env` :

```env
ROUTING_PROVIDER=valhalla
ROUTING_URL=http://valhalla:8002
```

et `docker compose -f infra/docker-compose.yml up -d valhalla backend`.

### 2. Serveur sans accès à Internet

Le conteneur télécharge l'extrait au premier démarrage. Si le serveur n'a pas Internet :
télécharger `senegal-and-gambia-latest.osm.pbf` sur un autre poste
(https://download.geofabrik.de/africa/senegal-and-gambia.html), le copier dans le volume, retirer
`tile_urls` et redémarrer :

```bash
docker cp senegal-and-gambia-latest.osm.pbf cartographie_imf_valhalla:/custom_files/
docker restart cartographie_imf_valhalla
```

### 3. Vérifier

```bash
docker compose -f infra/docker-compose.yml exec backend python -c "import urllib.request,json; \
r=urllib.request.Request('http://valhalla:8002/route', json.dumps({'locations':[{'lat':14.6928,'lon':-17.4467},{'lat':14.791,'lon':-16.936}],'costing':'auto'}).encode(), {'Content-Type':'application/json'}); \
print(json.load(urllib.request.urlopen(r))['trip']['summary'])"
```

Une réponse `{'length': ..., 'time': ...}` confirme que le moteur fonctionne (Dakar → Thiès).

### 4. Mettre la carte à jour

Geofabrik publie un nouvel extrait chaque jour ; une mise à jour **mensuelle** suffit. Remplacer le
fichier `.pbf` dans le volume puis reconstruire :

```bash
docker cp senegal-and-gambia-latest.osm.pbf cartographie_imf_valhalla:/custom_files/
docker compose -f infra/docker-compose.yml run --rm -e force_rebuild=True valhalla
docker restart cartographie_imf_valhalla
```

(À planifier par une tâche `cron` du serveur si souhaité.)

## c) HTTPS obligatoire

Les navigateurs ne donnent la position (« Utiliser ma position ») **que sur une adresse en
HTTPS** (seule exception : `localhost`, en développement). L'intranet doit donc être servi en HTTPS
par Nginx, avec un certificat reconnu par les postes et les téléphones (autorité de certification
interne déployée sur les appareils, ou certificat public). Sans HTTPS, la page fonctionne toujours,
mais le départ doit être placé à la main sur la carte, et la page l'explique.

Point à anticiper : les superviseurs utilisent la section **sur le terrain, depuis leur téléphone**.
Ils devront donc joindre l'intranet de l'extérieur (VPN du ministère ou accès sécurisé équivalent).

## d) Fond de carte : aujourd'hui servi depuis Internet

Vérifié dans `frontend/src/components/carto/fondCarte.ts` : le fond de carte de **toutes les
cartes** de l'application (macro, micro, consultation, itinéraire) vient d'**OpenFreeMap**
(`https://tiles.openfreemap.org/styles/liberty`), c'est-à-dire d'Internet. Le navigateur de
l'utilisateur le télécharge directement.

Sur un intranet sans Internet, le code prévoit déjà un repli : un fond uni s'affiche (avec la
mention « hors ligne »), les points, régions et trajets restent visibles, mais **sans routes ni
noms de lieux**, ce qui rend la section Itinéraire peu lisible.

Pour servir le fond en interne :

1. Produire un fichier de tuiles du Sénégal (par exemple un fichier **PMTiles** extrait du jeu
   OpenStreetMap de Protomaps avec l'outil `pmtiles extract`, ou des tuiles OpenMapTiles servies
   par `tileserver-gl`), ainsi que les polices (`glyphs`) et icônes (`sprite`) du style ;
2. les servir par le Nginx de l'intranet ;
3. rendre l'adresse du style configurable (aujourd'hui elle est écrite dans `fondCarte.ts`), par
   exemple avec une variable `VITE_URL_FOND_CARTE`.

L'étape 3 touche un fichier partagé par toutes les cartes : elle n'a pas été faite dans ce lot.
