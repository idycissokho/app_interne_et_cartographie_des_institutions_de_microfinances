/**
 * Annonce la fin d'un import lancé dans cet onglet, où que l'on soit dans l'application :
 * notification avec le résultat (nouvelles lignes, déjà en base, erreurs) et lien vers le rapport.
 * L'import continue sur le serveur pendant la navigation ; on interroge son état toutes les 4 s.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { nombre } from "../lib/format";
import { notifier } from "../lib/notifier";
import { memoireImport, notificationImport } from "../lib/suiviImport";

interface EtatImport { id: string; statut: string; nb_lignes_total: number; nb_lignes_importees: number; nb_lignes_erreur: number; nb_lignes_creees?: number; nb_lignes_mises_a_jour?: number }

export function SuiviImport() {
  const { estAdmin } = useAuth();
  const { pathname } = useLocation();
  const surPageImport = pathname.startsWith("/donnees");

  useEffect(() => {
    if (!estAdmin) return;
    let actif = true;
    const verifier = () => {
      const id = memoireImport.lire();
      if (!id || memoireImport.annonce(id)) return;
      api.get<EtatImport>(`/importation/${id}/`).then((i) => {
        if (!actif || i.statut === "EN_ATTENTE" || i.statut === "EN_COURS" || memoireImport.annonce(id)) return;
        memoireImport.marquerAnnonce(id);
        const action = surPageImport ? undefined : { libelle: "Voir le rapport", vers: "/donnees" };
        const options = { action, remplace: notificationImport.id };
        notificationImport.id = undefined;
        if (i.statut === "ECHEC") {
          notifier.erreur("Import échoué", i.nb_lignes_total ? `Aucune des ${nombre(i.nb_lignes_total)} lignes n'a pu être importée.` : "Le fichier n'a pas pu être lu.", options);
          return;
        }
        const parties = [
          `${nombre(i.nb_lignes_creees ?? i.nb_lignes_importees)} nouvelle${(i.nb_lignes_creees ?? 0) > 1 ? "s" : ""}`,
          i.nb_lignes_mises_a_jour ? `${nombre(i.nb_lignes_mises_a_jour)} déjà en base` : "",
          i.nb_lignes_erreur ? `${nombre(i.nb_lignes_erreur)} en erreur` : "",
        ].filter(Boolean);
        (i.nb_lignes_erreur ? notifier.info : notifier.succes)(
          i.nb_lignes_erreur ? "Import terminé, avec des erreurs" : "Import terminé",
          `${nombre(i.nb_lignes_total)} lignes lues · ${parties.join(" · ")}`,
          { ...options, duree: 9000 },
        );
      }, () => undefined);
    };
    verifier();
    const minuteur = window.setInterval(verifier, 4000);
    return () => { actif = false; window.clearInterval(minuteur); };
  }, [estAdmin, surPageImport]);

  return null;
}
