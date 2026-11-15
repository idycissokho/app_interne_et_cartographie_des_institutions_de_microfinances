import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { requeteApi } from "../api/cache";

/**
 * Charge plusieurs ressources GET en parallèle, à travers le cache partagé (api/cache.ts) :
 * une ressource déjà connue est rendue immédiatement, puis rafraîchie en arrière-plan.
 * Une ressource en erreur (403, réseau…) vaut null sans bloquer les autres ; une
 * ressource pas encore reçue est absente (undefined). `cles` force un rechargement.
 * `chargement` est vrai tant qu'une ressource demandée n'a encore jamais été reçue.
 */
export function useDonnees<T extends Record<string, unknown>>(chemins: { [K in keyof T]: string | null }, cles: unknown[] = []) {
  const entrees = Object.entries(chemins) as [keyof T, string | null][];
  const resultats = useQueries({
    queries: entrees.map(([, chemin]) => ({
      ...requeteApi(chemin ?? ""),
      enabled: chemin !== null,
      // Pendant un changement de page ou de filtre, l'ancien contenu reste affiché.
      placeholderData: keepPreviousData,
    })),
  });

  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    resultats.forEach((r, i) => entrees[i][1] !== null && void r.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, cles);

  const donnees: Partial<T> = {};
  entrees.forEach(([cle, chemin], i) => {
    const r = resultats[i];
    donnees[cle] = (chemin === null || r.isError ? null : r.data) as T[keyof T];
  });
  const chargement = entrees.some(([, chemin], i) => chemin !== null && resultats[i].isPending);

  return { donnees, chargement };
}

export type Compte = { count: number };
