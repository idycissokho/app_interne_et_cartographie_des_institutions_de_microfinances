/**
 * Registre des pages : chargement du code à la demande (React.lazy) et préchargement
 * au survol d'un lien du menu (code de la page + données partagées dont elle a besoin).
 */
import { precharger } from "../api/cache";
import { URL_IMF_OPTIONS, URL_REGIONS, URL_STATISTIQUES } from "./stats";

/**
 * Code d'une page, avec reprise après une mise en ligne : chaque déploiement renomme les fichiers
 * JavaScript, et un onglet ouvert avant ne trouve plus celui d'une page pas encore visitée (404,
 * page blanche). On recharge alors l'application une fois pour obtenir la nouvelle version.
 */
const CLE_RECHARGEMENT = "imf.rechargement-version";
function chargerPage<T>(importer: () => Promise<T>) {
  return () =>
    importer().then(
      (module) => {
        try { sessionStorage.removeItem(CLE_RECHARGEMENT); } catch { /* stockage indisponible */ }
        return module;
      },
      (erreur) => {
        let dejaRecharge = false;
        try {
          dejaRecharge = sessionStorage.getItem(CLE_RECHARGEMENT) === "1";
          sessionStorage.setItem(CLE_RECHARGEMENT, "1");
        } catch { /* stockage indisponible : pas de rechargement automatique */ dejaRecharge = true; }
        if (!dejaRecharge) {
          window.location.reload();
          return new Promise<T>(() => {}); // la page se recharge
        }
        throw erreur; // affiché par <FiletErreur>
      },
    );
}

export const PAGES = {
  connexion: chargerPage(() => import("../pages/Connexion").then((m) => ({ default: m.Connexion }))),
  tableauDeBord: chargerPage(() => import("../pages/TableauDeBord").then((m) => ({ default: m.TableauDeBord }))),
  carteMacro: chargerPage(() => import("../pages/CarteMacro").then((m) => ({ default: m.CarteMacro }))),
  carteMicro: chargerPage(() => import("../pages/CarteMicro").then((m) => ({ default: m.CarteMicro }))),
  supervision: chargerPage(() => import("../pages/Supervision").then((m) => ({ default: m.Supervision }))),
  consultation: chargerPage(() => import("../pages/Consultation").then((m) => ({ default: m.Consultation }))),
  institutions: chargerPage(() => import("../pages/Institutions").then((m) => ({ default: m.Institutions }))),
  formulaireIMF: chargerPage(() => import("../pages/FormulaireIMF").then((m) => ({ default: m.FormulaireIMF }))),
  pointsService: chargerPage(() => import("../pages/PointsService").then((m) => ({ default: m.PointsService }))),
  dirigeants: chargerPage(() => import("../pages/Dirigeants").then((m) => ({ default: m.Dirigeants }))),
  donnees: chargerPage(() => import("../pages/Donnees").then((m) => ({ default: m.Donnees }))),
  audit: chargerPage(() => import("../pages/Audit").then((m) => ({ default: m.Audit }))),
  motDePasse: chargerPage(() => import("../pages/MotDePasse").then((m) => ({ default: m.MotDePasse }))),
  itineraire: chargerPage(() => import("../pages/Itineraire").then((m) => ({ default: m.Itineraire }))),
};

/** Lien du menu -> code de la page et données stables (identiques quel que soit le filtre). */
const AU_SURVOL: Record<string, { page: () => Promise<unknown>; donnees: string[] }> = {
  "/": { page: PAGES.tableauDeBord, donnees: [URL_STATISTIQUES, URL_REGIONS] },
  "/supervision": { page: PAGES.supervision, donnees: [URL_STATISTIQUES, URL_REGIONS] },
  "/consultation": { page: PAGES.consultation, donnees: [URL_IMF_OPTIONS, URL_REGIONS] },
  "/carte/micro": { page: PAGES.carteMicro, donnees: ["/points-service/geojson/", URL_IMF_OPTIONS, "/imf/bailleurs/?page_size=1000"] },
  "/carte/macro": { page: PAGES.carteMacro, donnees: [URL_REGIONS, URL_STATISTIQUES] },
  "/imf": { page: PAGES.institutions, donnees: [] },
  "/points-service": { page: PAGES.pointsService, donnees: [URL_STATISTIQUES] },
  "/dirigeants": { page: PAGES.dirigeants, donnees: [] },
  "/donnees": { page: PAGES.donnees, donnees: [URL_STATISTIQUES] },
  "/audit": { page: PAGES.audit, donnees: [] },
  "/itineraire": { page: PAGES.itineraire, donnees: ["/itineraires/destinations/carte/"] },
};

/** À appeler au survol (ou au focus clavier) d'un lien : la page s'ouvrira sans attente. */
export function prechargerPage(href: string) {
  const cible = AU_SURVOL[href];
  if (!cible) return;
  void cible.page();
  cible.donnees.forEach(precharger);
}
