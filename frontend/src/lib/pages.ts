/**
 * Registre des pages : chargement du code à la demande (React.lazy) et préchargement
 * au survol d'un lien du menu (code de la page + données partagées dont elle a besoin).
 */
import { precharger } from "../api/cache";
import { URL_IMF_OPTIONS, URL_REGIONS, URL_STATISTIQUES } from "./stats";

export const PAGES = {
  connexion: () => import("../pages/Connexion").then((m) => ({ default: m.Connexion })),
  tableauDeBord: () => import("../pages/TableauDeBord").then((m) => ({ default: m.TableauDeBord })),
  carteMacro: () => import("../pages/CarteMacro").then((m) => ({ default: m.CarteMacro })),
  carteMicro: () => import("../pages/CarteMicro").then((m) => ({ default: m.CarteMicro })),
  supervision: () => import("../pages/Supervision").then((m) => ({ default: m.Supervision })),
  consultation: () => import("../pages/Consultation").then((m) => ({ default: m.Consultation })),
  institutions: () => import("../pages/Institutions").then((m) => ({ default: m.Institutions })),
  formulaireIMF: () => import("../pages/FormulaireIMF").then((m) => ({ default: m.FormulaireIMF })),
  pointsService: () => import("../pages/PointsService").then((m) => ({ default: m.PointsService })),
  dirigeants: () => import("../pages/Dirigeants").then((m) => ({ default: m.Dirigeants })),
  donnees: () => import("../pages/Donnees").then((m) => ({ default: m.Donnees })),
  audit: () => import("../pages/Audit").then((m) => ({ default: m.Audit })),
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
};

/** À appeler au survol (ou au focus clavier) d'un lien : la page s'ouvrira sans attente. */
export function prechargerPage(href: string) {
  const cible = AU_SURVOL[href];
  if (!cible) return;
  void cible.page();
  cible.donnees.forEach(precharger);
}
