import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, evenementDeconnexion, jetons } from "../api/client";
import { cacheRequetes, requeteApi } from "../api/cache";
import type { Utilisateur } from "../api/types";

interface ContexteAuth {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  connecter: (email: string, motDePasse: string, resterConnecte?: boolean) => Promise<void>;
  deconnecter: () => Promise<void>;
  /** SUPERVISEUR ou ADMIN : droits d'écriture sur les référentiels. */
  /** Diagramme de cas d'utilisation : modifier IMF / point de service / mandat (SUPERVISEUR, ADMIN). */
  peutModifier: boolean;
  /** Créer, désactiver, Import / Export Excel, journal d'audit (ADMIN uniquement). */
  estAdmin: boolean;
}

const Contexte = createContext<ContexteAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!jetons.access()) {
      setChargement(false);
      return;
    }
    // fetchQuery : un seul appel même si l'effet est monté deux fois (mode strict de React).
    cacheRequetes
      .fetchQuery({ ...requeteApi<Utilisateur>("/auth/profil/"), staleTime: 0 })
      .then(setUtilisateur)
      .catch(() => jetons.effacer())
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    const surDeconnexion = () => {
      cacheRequetes.clear();
      setUtilisateur(null);
    };
    evenementDeconnexion.addEventListener("deconnexion", surDeconnexion);
    return () => evenementDeconnexion.removeEventListener("deconnexion", surDeconnexion);
  }, []);

  const connecter = useCallback(async (email: string, motDePasse: string, resterConnecte = false) => {
    const res = await api.post<{ access: string; refresh: string; utilisateur: Utilisateur }>("/auth/login/", {
      email,
      password: motDePasse,
    });
    jetons.effacer();
    cacheRequetes.clear(); // les données dépendent du rôle : rien de l'ancienne session ne doit rester
    jetons.enregistrer(res.access, res.refresh, resterConnecte);
    setUtilisateur(res.utilisateur);
  }, []);

  const deconnecter = useCallback(async () => {
    const refresh = jetons.refresh();
    try {
      if (refresh) await api.post("/auth/logout/", { refresh });
    } finally {
      jetons.effacer();
      cacheRequetes.clear();
      setUtilisateur(null);
    }
  }, []);

  const valeur = useMemo(
    () => ({
      utilisateur,
      chargement,
      connecter,
      deconnecter,
      peutModifier: utilisateur?.role === "ADMIN" || utilisateur?.role === "SUPERVISEUR",
      estAdmin: utilisateur?.role === "ADMIN",
    }),
    [utilisateur, chargement, connecter, deconnecter],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAuth() {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
