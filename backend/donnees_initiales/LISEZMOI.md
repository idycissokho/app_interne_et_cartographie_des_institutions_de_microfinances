# Données initiales

Déposez ici la liste officielle des IMF de la DRS-SFD (classeur Excel « LISTE IMF », `.xlsx`,
tel quel), puis, après les migrations :

```bash
docker compose -f infra/docker-compose.yml exec backend python manage.py initialiser_donnees
```

- Le classeur le plus récent du dossier est utilisé (ou indiquez un chemin en argument).
- Un seul import enregistre les institutions, leurs sièges et leurs dirigeants avec mandats.
- Chaque ligne est vérifiée : les lignes conformes sont enregistrées, les autres sont écartées.
- Un rapport `rapport_import_AAAAMMJJ_HHMMSS.csv` des valeurs écartées est écrit dans ce dossier.
- Si la base contient déjà des institutions, la commande s'arrête (option `--forcer` pour mettre à jour).

Le même classeur peut aussi être importé depuis l'interface : *Import / Export* → *Institutions*.

Les classeurs et rapports de ce dossier contiennent des données réelles : ils ne sont jamais
versionnés (voir `.gitignore`) ni copiés dans l'image Docker de production.
