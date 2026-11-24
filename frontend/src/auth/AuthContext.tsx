import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, evenementDeconnexion, jetons } from "../api/client";
import { cacheRequetes, requeteApi } from "../api/cache";
import { notifier } from "../lib/notifier";
import type { Utilisateur } from "../api/types";
import { canalSession, session, type MotifDeconnexion, type ReglesSession } from "./session";

interface ContexteAuth {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  connecter: (email: string, motDePasse: string, resterConnecte?: boolean) => Promise<void>;
  /** Déconnexion volontaire, ou automatique avec un motif (inactivité, durée maximale). */
  deconnecter: (motif?: MotifDeconnexion) => Promise<void>;
  /** Diagramme de cas d'utilisation : modifier IMF / point de service / mandat (SUPERVISEUR, ADMIN). */
  peutModifier: boolean;
  /** Créer, désactiver, Import / Export Excel, journal d'audit (ADMIN uniquement). */
  estAdmin: boolean;
  /** Après le changement du mot de passe provisoire : l'application se débloque. */
  motDePasseChange: () => void;
}

const Contexte = createContext<ContexteAuth | null>(null);

/** Efface tout ce qui reste de la session dans ce navigateur. */
function nettoyer() {
  jetons.effacer();
  session.effacer();
  cacheRequetes.clear();
  // Conversation de l'assistant (peut contenir des coordonnées de dirigeants).
  try { sessionStorage.removeItem("imf.assistant.historique"); } catch { /* stockage indisponible */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!jetons.access()) {
      setChargement(false);
      return;
    }
    // Session restée ouverte trop longtemps (onglet fermé puis rouvert, poste laissé allumé) :
    // on ne la reprend pas, il faut se reconnecter.
    const motif = session.active() ? session.motifExpiration() : "expiree";
    if (motif) {
      const refresh = jetons.refresh();
      if (refresh) void api.post("/auth/logout/", { refresh }).catch(() => undefined);
      nettoyer();
      session.memoriserMotif(motif);
      setChargement(false);
      return;
    }
    // fetchQuery : un seul appel même si l'effet est monté deux fois (mode strict de React).
    cacheRequetes
      .fetchQuery({ ...requeteApi<Utilisateur>("/auth/profil/"), staleTime: 0 })
      .then(setUtilisateur)
      .catch(() => nettoyer())
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    const surDeconnexion = () => {
      cacheRequetes.clear();
      setUtilisateur(null);
    };
    evenementDeconnexion.addEventListener("deconnexion", surDeconnexion);
    // Déconnexion dans un autre onglet : celui-ci se ferme aussi.
    const surMessage = (e: MessageEvent) => {
      if (e.data?.type !== "deconnexion") return;
      if (e.data.motif) session.memoriserMotif(e.data.motif);
      nettoyer();
      setUtilisateur(null);
    };
    canalSession?.addEventListener("message", surMessage);
    return () => {
      evenementDeconnexion.removeEventListener("deconnexion", surDeconnexion);
      canalSession?.removeEventListener("message", surMessage);
    };
  }, []);

  const connecter = useCallback(async (email: string, motDePasse: string, resterConnecte = false) => {
    const res = await api.post<{ access: string; refresh: string; utilisateur: Utilisateur; session?: ReglesSession }>("/auth/login/", {
      email,
      password: motDePasse,
    });
    nettoyer(); // les données dépendent du rôle : rien de l'ancienne session ne doit rester
    jetons.enregistrer(res.access, res.refresh, resterConnecte);
    session.demarrer(res.session);
    setUtilisateur(res.utilisateur);
    notifier.succes(`Bienvenue, ${res.utilisateur.prenom}`, "Vous êtes connecté à l'espace des agents de la DRS-SFD.");
  }, []);

  const deconnecter = useCallback(async (motif?: MotifDeconnexion) => {
    const refresh = jetons.refresh();
    if (motif) session.memoriserMotif(motif);
    canalSession?.postMessage({ type: "deconnexion", motif });
    try {
      if (refresh) await api.post("/auth/logout/", { refresh });
    } catch {
      /* jeton déjà expiré : la session est de toute façon terminée */
    } finally {
      nettoyer();
      setUtilisateur(null);
      // Déconnexion volontaire (sans motif) ; les déconnexions automatiques sont expliquées sur la connexion.
      if (!motif) notifier.info("Vous êtes déconnecté", "Votre session est fermée sur ce poste. À bientôt.");
    }
  }, []);

  const motDePasseChange = useCallback(() => {
    setUtilisateur((u) => (u ? { ...u, doit_changer_mot_de_passe: false } : u));
  }, []);

  const valeur = useMemo(
    () => ({
      utilisateur,
      chargement,
      connecter,
      deconnecter,
      peutModifier: utilisateur?.role === "ADMIN" || utilisateur?.role === "SUPERVISEUR",
      estAdmin: utilisateur?.role === "ADMIN",
      motDePasseChange,
    }),
    [utilisateur, chargement, connecter, deconnecter, motDePasseChange],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAuth() {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
