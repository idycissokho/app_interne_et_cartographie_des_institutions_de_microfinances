/**
 * Import suivi par cet onglet (page Import / Export et notification de fin d'import) :
 * identifiant mémorisé dans sessionStorage, pour retrouver la progression ou le rapport en
 * revenant sur la page, et annoncer la fin de l'import où que l'on soit dans l'application.
 */
const CLE_SUIVI = "imf.import.suivi";
const CLE_ANNONCE = "imf.import.annonce";

const lire = (cle: string) => { try { return sessionStorage.getItem(cle); } catch { return null; } };
const ecrire = (cle: string, valeur: string) => { try { sessionStorage.setItem(cle, valeur); } catch { /* stockage indisponible */ } };

export const memoireImport = {
  lire: () => lire(CLE_SUIVI),
  ecrire: (id: string) => ecrire(CLE_SUIVI, id),
  effacer: () => { try { sessionStorage.removeItem(CLE_SUIVI); } catch { /* stockage indisponible */ } },
  /** La fin de cet import a-t-elle déjà été annoncée (une seule notification par import) ? */
  annonce: (id: string) => lire(CLE_ANNONCE) === id,
  marquerAnnonce: (id: string) => ecrire(CLE_ANNONCE, id),
};

/** Notification « Import en cours » à remplacer par le résultat (même onglet, sans rechargement). */
export const notificationImport = { id: undefined as number | undefined };
