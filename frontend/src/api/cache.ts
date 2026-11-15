/**
 * Cache des requêtes GET (TanStack Query), partagé par toutes les pages.
 *
 * - Une donnée déjà chargée s'affiche immédiatement quand on revient sur une page ;
 *   au-delà de FRAICHEUR, elle est rafraîchie en arrière-plan.
 * - Deux composants (ou deux montages) qui demandent la même URL partagent un seul appel.
 * - Toute écriture réussie (POST, PATCH, DELETE) périme l'ensemble du cache : les
 *   listes et compteurs affichés se rechargent d'eux-mêmes.
 */
import { QueryClient } from "@tanstack/react-query";

import { api, evenementEcriture } from "./client";

const FRAICHEUR = 30_000; // ms pendant lesquelles une réponse est réutilisée sans nouvel appel
const CONSERVATION = 10 * 60_000; // ms de conservation d'une réponse qui n'est plus affichée

export const cacheRequetes = new QueryClient({
  defaultOptions: {
    queries: { staleTime: FRAICHEUR, gcTime: CONSERVATION, retry: false, refetchOnWindowFocus: false },
  },
});

/** Options d'une requête GET sur l'API, identifiée par son chemin. */
export const requeteApi = <T = unknown>(chemin: string) => ({
  queryKey: ["api", chemin] as const,
  queryFn: () => api.get<T>(chemin),
});

/** Charge une ressource à l'avance (survol d'un lien du menu) ; sans effet si elle est déjà fraîche. */
export const precharger = (chemin: string) => {
  void cacheRequetes.prefetchQuery(requeteApi(chemin));
};

evenementEcriture.addEventListener("ecriture", () => {
  void cacheRequetes.invalidateQueries();
});
