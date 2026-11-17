# Données initiales

Déposez ici l'export Excel de l'annuaire DRS-SFD (`.xlsx`), puis, après les migrations :

```bash
docker compose -f infra/docker-compose.yml exec backend python manage.py initialiser_donnees
```

- Le classeur le plus récent du dossier est utilisé (ou indiquez un chemin en argument).
- Chaque ligne est vérifiée : les lignes conformes sont enregistrées, les autres sont écartées.
- Un rapport `rapport_import_AAAAMMJJ_HHMMSS.csv` des lignes écartées est écrit dans ce dossier.
- Si la base contient déjà des institutions, la commande s'arrête (option `--forcer` pour mettre à jour).

Les classeurs et rapports de ce dossier contiennent des données réelles : ils ne sont jamais
versionnés (voir `.gitignore`) ni copiés dans l'image Docker de production.
