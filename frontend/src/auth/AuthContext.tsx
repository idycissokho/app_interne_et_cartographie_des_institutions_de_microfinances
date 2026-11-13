import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, evenementDeconnexion, jetons } from "../api/client";
import type { Utilisateur } from "../api/types";

interface ContexteAuth {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  connecter: (email: string, motDePasse: string) => Promise<void>;
  deconnecter: () => Promise<void>;
  /** SUPERVISEUR ou ADMIN : droits d'écriture sur les référentiels. */
  peutEcrire: boolean;
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
    api
      .get<Utilisateur>("/auth/profil/")
      .then(setUtilisateur)
      .catch(() => jetons.effacer())
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    const surDeconnexion = () => setUtilisateur(null);
    evenementDeconnexion.addEventListener("deconnexion", surDeconnexion);
    return () => evenementDeconnexion.removeEventListener("deconnexion", surDeconnexion);
  }, []);

  const connecter = useCallback(async (email: string, motDePasse: string) => {
    const res = await api.post<{ access: string; refresh: string; utilisateur: Utilisateur }>("/auth/login/", {
      email,
      password: motDePasse,
    });
    jetons.enregistrer(res.access, res.refresh);
    setUtilisateur(res.utilisateur);
  }, []);

  const deconnecter = useCallback(async () => {
    const refresh = jetons.refresh();
    try {
      if (refresh) await api.post("/auth/logout/", { refresh });
    } finally {
      jetons.effacer();
      setUtilisateur(null);
    }
  }, []);

  const valeur = useMemo(
    () => ({
      utilisateur,
      chargement,
      connecter,
      deconnecter,
      peutEcrire: utilisateur?.role === "ADMIN" || utilisateur?.role === "SUPERVISEUR",
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
