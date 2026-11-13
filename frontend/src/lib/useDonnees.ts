import { useEffect, useState } from "react";

import { api } from "../api/client";

/**
 * Charge plusieurs ressources GET en parallèle. Une ressource en erreur (403, réseau…)
 * vaut null sans bloquer les autres. `cles` sert de dépendance de rechargement.
 */
export function useDonnees<T extends Record<string, unknown>>(chemins: { [K in keyof T]: string | null }, cles: unknown[] = []) {
  const [donnees, setDonnees] = useState<Partial<T>>({});
  const [chargement, setChargement] = useState(true);
  const signature = JSON.stringify(chemins);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    const entrees = Object.entries(chemins) as [keyof T, string | null][];
    Promise.all(entrees.map(([, c]) => (c ? api.get(c).catch(() => null) : Promise.resolve(null)))).then((res) => {
      if (annule) return;
      const o: Partial<T> = {};
      entrees.forEach(([k], i) => (o[k] = res[i] as T[keyof T]));
      setDonnees(o);
      setChargement(false);
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ...cles]);

  return { donnees, chargement };
}

export type Compte = { count: number };
