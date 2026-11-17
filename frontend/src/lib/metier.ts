/** Correspondances métier partagées par les écrans (libellés de la maquette ↔ valeurs du backend). */
import { SENEGAL_REGIONS, cleRegion } from "../data/senegalRegions";

export const TYPE_IMF_COURT: Record<string, string> = { MUTUELLE: "Mutuelle", COOPERATIVE: "Coopérative", SA: "SA", ASSOCIATION: "Association" };
export const TYPE_IMF_LONG: Record<string, string> = { MUTUELLE: "Mutuelle", COOPERATIVE: "Coopérative", SA: "Société Anonyme", ASSOCIATION: "Association" };
/** Statut réglementaire (IMF et points de service) : trois valeurs, dans cet ordre. */
export const STATUTS_REGLEMENTAIRES: [string, string][] = [["EN_ACTIVITE", "En activité"], ["OPR", "OPR"], ["RETRAIT_AGREMENT", "Retrait d'agrément"]];
export const STATUT_IMF_COURT: Record<string, string> = Object.fromEntries(STATUTS_REGLEMENTAIRES);
export const STATUT_IMF_LONG: Record<string, string> = STATUT_IMF_COURT;
/** Types de point de service : agence ou guichet (le siège social est une agence marquée « est_siege »). */
export const TYPES_POINT: [string, string][] = [["AGENCE", "Agence"], ["GUICHET", "Guichet"]];
export const TYPE_POINT: Record<string, string> = Object.fromEntries(TYPES_POINT);
export const STATUTS_POINT: [string, string][] = [["OUVERT", "Ouvert"], ["FERME", "Fermé"]];
export const STATUT_POINT: Record<string, string> = Object.fromEntries(STATUTS_POINT);
export const STATUT_MANDAT: Record<string, string> = { EN_FONCTION: "En fonction", INTERIM: "Intérim", SUSPENDU: "Suspendu" };

export const FONCTIONS: [string, string][] = [
  ["PCA", "Président du Conseil d'Administration"],
  ["VICE_PRESIDENT_CA", "Vice-président du Conseil d'Administration"],
  ["SECRETAIRE_GENERAL_CA", "Secrétaire général du Conseil d'Administration"],
  ["PRESIDENT_CONSEIL", "Président du Conseil"],
  ["DG", "Directeur Général"],
  ["DGA", "Directeur Général Adjoint"],
  ["GERANT", "Gérant"],
  ["PRESIDENT_COMITE_CREDIT", "Président de la Commission Crédit"],
  ["PRESIDENT_CONSEIL_SURVEILLANCE", "Président du Conseil de Surveillance"],
  ["VICE_PRESIDENT_CS", "Vice-président du Conseil de Surveillance"],
  ["SECRETAIRE_GENERAL_CS", "Secrétaire général du Conseil de Surveillance"],
  ["VICE_PRESIDENT_CC", "Vice-président de la Commission Crédit"],
  ["SECRETAIRE_GENERAL_CC", "Secrétaire général de la Commission Crédit"],
  ["RESPONSABLE_CONFORMITE", "Responsable Conformité / Contrôle interne"],
  ["AUDITEUR_INTERNE", "Auditeur interne"],
  ["DAF", "Directeur Administratif et Financier"],
  ["RESPONSABLE_SI", "Responsable IT / Systèmes d'Information"],
  ["RESPONSABLE_OPERATIONS", "Responsable Opérations / Réseau"],
];
export const LIBELLE_FONCTION = Object.fromEntries(FONCTIONS);

/** Familles de fonctions (filtres « Conseils / Gouvernance, Direction, Comités, Contrôle »). */
export const FAMILLE_FONCTION: Record<string, "Gouvernance" | "Direction" | "Comités" | "Contrôle"> = {
  PCA: "Gouvernance", PRESIDENT_CONSEIL: "Gouvernance", PRESIDENT_CONSEIL_SURVEILLANCE: "Gouvernance",
  VICE_PRESIDENT_CA: "Gouvernance", SECRETAIRE_GENERAL_CA: "Gouvernance", VICE_PRESIDENT_CS: "Gouvernance", SECRETAIRE_GENERAL_CS: "Gouvernance",
  DG: "Direction", DGA: "Direction", GERANT: "Direction", DAF: "Direction", RESPONSABLE_SI: "Direction", RESPONSABLE_OPERATIONS: "Direction",
  PRESIDENT_COMITE_CREDIT: "Comités", VICE_PRESIDENT_CC: "Comités", SECRETAIRE_GENERAL_CC: "Comités",
  RESPONSABLE_CONFORMITE: "Contrôle", AUDITEUR_INTERNE: "Contrôle",
};

/** Pastilles de statut : [fond, texte] (renderVals() de la maquette). */
export const SB: Record<string, [string, string]> = {
  EN_ACTIVITE: ["#DCFCE7", "#166534"], OPR: ["#FEF3C7", "#92400E"], RETRAIT_AGREMENT: ["#FDECEC", "#991B1B"],
  OUVERT: ["#DCFCE7", "#166534"], FERME: ["#E5E7EB", "#374151"],
  EN_FONCTION: ["#DCFCE7", "#166534"], INTERIM: ["#FEF3C7", "#92400E"], SUSPENDU: ["#FDECEC", "#991B1B"],
};

/** Couleur de médaillon d'une IMF : couleur de la région de son siège (palette de la carte). */
const PALETTE = SENEGAL_REGIONS.map((r) => r.color);
export function tonIMF(regionSiege: string | null | undefined, cle: string) {
  const r = regionSiege ? SENEGAL_REGIONS.find((g) => cleRegion(g.id) === cleRegion(regionSiege)) : undefined;
  if (r) return r.color;
  let h = 0;
  for (const c of cle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Nom de région affiché (accents de la maquette) à partir du nom renvoyé par l'API. */
export const regionAffichee = (nom: string | null | undefined) =>
  nom ? SENEGAL_REGIONS.find((g) => cleRegion(g.id) === cleRegion(nom))?.id ?? nom : null;

export const initiales = (texte: string) =>
  texte.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");

/** Avancement d'un mandat (0–100) et couleur de barre de la maquette. */
export function avancementMandat(debut: string, fin: string | null) {
  if (!fin) return { prog: 30, color: "#C9A44C" };
  const d = new Date(debut).getTime(), f = new Date(fin).getTime(), n = Date.now();
  const prog = Math.max(0, Math.min(100, Math.round((100 * (n - d)) / Math.max(1, f - d))));
  return { prog, color: prog >= 100 ? "#B91C1C" : prog > 85 ? "#D97706" : "#C9A44C" };
}
