# Supervision de l'application avec un APM (New Relic)

Un APM (*Application Performance Monitoring*) mesure en continu le comportement
de l'application : **latence** de chaque endpoint, **erreurs**, **CPU / mémoire**,
requêtes SQL, et **traces** qui suivent une requête de bout en bout.

Ce guide reprend les étapes de l'étude de cas, appliquées à Cartographie IMF :

| Étape de l'étude de cas | Dans ce projet |
|---|---|
| Configurer New Relic ou Datadog | Agent New Relic dans le backend Django (§1 et §2) |
| Analyser les métriques (latence, erreurs, CPU) | Tableaux de bord New Relic (§4) |
| Traçage distribué pour trouver l'appel lent | *Distributed tracing* activé (§5) |
| Optimiser (cache, requête plus rapide) | À faire à partir de ce que montrent les traces (§6) |
| Configurer des alertes | Trois conditions d'alerte prêtes à copier (§7) |

New Relic a été retenu plutôt que Datadog parce que son offre gratuite est
permanente (100 Go de données par mois, sans carte bancaire), alors que Datadog
ne propose qu'un essai de 14 jours.

## Ce qui a été mis en place

| Fichier | Rôle |
|---|---|
| `backend/config/apm.py` | Démarre l'agent New Relic si une clé est définie |
| `backend/manage.py`, `backend/config/wsgi.py` | Appellent `demarrer_apm()` avant de charger Django |
| `backend/requirements/base.txt` | Ajoute le paquet `newrelic` |
| `infra/docker-compose.yml` | Variables `NEW_RELIC_*` du backend + service `newrelic-infra` (profil `apm`) |
| `backend/scripts/generer_trafic.py` | Génère du trafic pour remplir les tableaux de bord |

Sans clé, l'agent n'est pas chargé : l'application fonctionne comme avant.
L'agent est aussi désactivé pendant les tests.

## 1. Créer le compte et récupérer la clé

1. Créer un compte gratuit sur <https://newrelic.com/signup> (choisir la région **EU** ou **US**).
2. Dans New Relic : menu du profil (en bas à gauche) → **API keys**.
3. Copier la clé de type **INGEST - LICENSE**.

Cette clé est un secret : elle va uniquement dans `config/.env`, qui n'est pas versionné.

## 2. Activer l'APM

Ajouter à la fin du fichier `config/.env` (celui que chargent les services Docker) :

```
NEW_RELIC_LICENSE_KEY=coller-la-cle-ici
NEW_RELIC_APP_NAME=Cartographie IMF (dev)
```

Puis reconstruire le backend (nécessaire une fois, pour installer le paquet `newrelic`)
et démarrer l'agent d'infrastructure :

```
docker compose -f infra/docker-compose.yml up -d --build backend
docker compose --env-file config/.env -f infra/docker-compose.yml --profile apm up -d
```

Vérifier que l'agent est connecté :

```
docker compose -f infra/docker-compose.yml logs backend | grep -i "reporting to"
```

Une ligne `Reporting to: https://rpm.newrelic.com/...` (ou `rpm.eu.newrelic.com`)
doit apparaître après la première requête reçue par l'API. Le lien ouvre
directement l'application dans New Relic.

Pour désactiver : vider `NEW_RELIC_LICENSE_KEY` puis `docker compose -f infra/docker-compose.yml up -d backend`.

## 3. Générer du trafic

Un APM n'affiche rien tant que l'application ne reçoit pas de requêtes.
Utiliser l'interface (<http://localhost:5173>) ou le script fourni, qui simule
plusieurs utilisateurs en lecture seule, avec quelques erreurs 404 et 401 volontaires :

```
docker compose -f infra/docker-compose.yml exec backend python scripts/generer_trafic.py \
    --email VOTRE_EMAIL --duree 120 --utilisateurs 5
```

Le script affiche à la fin un récapitulatif par endpoint (appels, erreurs,
latence moyenne et P95). Les données arrivent dans New Relic en 1 à 2 minutes.

## 4. Analyser les métriques

Dans New Relic : **APM & Services → Cartographie IMF (dev)**.

| Ce qu'on cherche | Où regarder |
|---|---|
| Latence globale, débit, taux d'erreur | **Summary** |
| Endpoints les plus lents | **Transactions** (trier par *Slowest average response time*) |
| Détail des erreurs (pile d'appels, URL) | **Errors** |
| Requêtes SQL les plus coûteuses | **Databases** |
| CPU et mémoire du processus Django | **Summary**, puis graphiques *CPU* / *Memory* |
| CPU, mémoire, disque de la machine et des conteneurs | **Infrastructure → Hosts** et **Containers** |

Avec Docker Desktop (macOS, Windows), l'agent d'infrastructure mesure la
machine virtuelle Linux de Docker, pas le système hôte lui-même.

Les intitulés de menus peuvent évoluer légèrement selon les versions de l'interface.

## 5. Traçage distribué

**APM & Services → Cartographie IMF (dev) → Distributed tracing.**

Chaque trace décompose une requête en segments (*spans*) : middleware, vue,
sérialisation, puis chaque requête SQL envoyée à PostgreSQL / PostGIS, avec sa durée.
C'est ce qui permet de dire « l'endpoint est lent *à cause de* telle requête »,
comme l'API de paiement lente de l'étude de cas.

Pour trouver le coupable : filtrer sur les traces les plus longues, ouvrir une
trace, et repérer le segment qui occupe la plus grande part de la durée. Les
endpoints cartographiques (`zones/geojson/`, `zones/agregats/`,
`points-service/geojson/`) sont les premiers à examiner, car ils manipulent des géométries.

## 6. Optimiser

L'optimisation dépend de ce que montrent les traces. Pistes habituelles :

- **Même requête SQL répétée de nombreuses fois dans une trace** (problème « N+1 ») :
  ajouter `select_related` / `prefetch_related` dans la vue.
- **Une seule requête SQL lente** : ajouter un index, ou simplifier les géométries renvoyées.
- **Réponse identique recalculée à chaque appel** (contours des zones, agrégats) :
  la mettre en cache avec le cache de Django.

Mesurer avant et après avec le script du §3 pour vérifier le gain.

## 7. Configurer des alertes

Dans New Relic : **Alerts → Alert conditions → New alert condition →
Write your own query**. Créer une condition par requête ci-dessous, puis les
rattacher à une même *policy* avec une notification par e-mail.

**Latence** — le 95ᵉ centile dépasse 2 secondes pendant 5 minutes :

```sql
SELECT percentile(duration, 95) FROM Transaction
WHERE appName = 'Cartographie IMF (dev)'
```

**Erreurs** — plus de 5 % de requêtes en erreur pendant 5 minutes :

```sql
SELECT percentage(count(*), WHERE error IS true) FROM Transaction
WHERE appName = 'Cartographie IMF (dev)'
```

**CPU** — plus de 85 % d'utilisation pendant 5 minutes (nécessite l'agent d'infrastructure) :

```sql
SELECT average(cpuPercent) FROM SystemSample
WHERE displayName = 'cartographie-imf-dev'
```

Pour tester une alerte, abaisser temporairement son seuil (par exemple 0,05 s
pour la latence) et relancer le script de trafic.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Aucune ligne `Reporting to` dans les logs | Clé absente de `config/.env`, ou backend non recréé (`docker compose -f infra/docker-compose.yml up -d backend`) |
| `No module named 'newrelic'` | Image non reconstruite : `docker compose -f infra/docker-compose.yml up -d --build backend` |
| Application absente de New Relic | Aucune requête reçue depuis le démarrage : générer du trafic et attendre 2 minutes |
| Conteneur `newrelic-infra` qui redémarre en boucle | Clé vide ou invalide : `docker compose -f infra/docker-compose.yml logs newrelic-infra` |
