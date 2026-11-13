import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client";

/** Charge une ressource GET et la recharge quand `chemin` change. `chemin=null` désactive l'appel. */
export function useApi<T>(chemin: string | null) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (chemin === null) return;
    let annule = false;
    setChargement(true);
    setErreur(null);
    api
      .get<T>(chemin)
      .then((d) => !annule && setDonnees(d))
      .catch((e: Error) => !annule && setErreur(e.message))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [chemin, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  return { donnees, erreur, chargement, recharger };
}
