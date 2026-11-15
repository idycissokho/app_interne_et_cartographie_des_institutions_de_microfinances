import type { StatsRegion } from "../components/carto/SenegalMap";
import { cleRegion } from "../data/senegalRegions";

/** Compteurs de GET /cartographie/statistiques/ (tableau de bord, supervision, en-têtes de listes). */
export interface Statistiques {
  imf: {
    total: number; agreees: number; agreees_depuis_janvier: number; en_cours: number; radiees: number;
    incompletes: number; avec_bailleur: number; par_type: Record<string, number>;
  };
  points: { total: number; sans_gps: number; par_type: Record<string, number> };
  dirigeants: { en_fonction: number };
  mandats: { total: number; sans_justificatif: number; echeance_30j: number };
  communes: { total: number; couvertes: number };
}

/** IMF en version courte (GET /imf/options/) : listes déroulantes, filtres, annuaire. */
export interface ImfOption {
  id: string; nom: string; sigle: string; type_imf: string; statut_reglementaire: string;
  numero_agrement: string; region_siege: string | null; nb_points_service: number;
}

// Ressources partagées par plusieurs pages : une même URL = une seule entrée de cache.
export const URL_STATISTIQUES = "/cartographie/statistiques/";
export const URL_REGIONS = "/cartographie/zones/agregats/?type_zone=REGION";
export const URL_IMF_OPTIONS = "/imf/options/";

export interface AgregatZone {
  id: string;
  code: string;
  nom: string;
  nb_points_service: number;
  nb_imf: number;
  encours_total: string | null;
  depots_total: string | null;
  nb_membres_total: number | null;
  principaux_bailleurs: string[];
}

/** Agrégats API → indicateurs de <SenegalMap>, indexés par cleRegion(nom). Encours en Mds FCFA. */
export function statsParRegion(zones: AgregatZone[] | null | undefined): Record<string, StatsRegion> {
  const s: Record<string, StatsRegion> = {};
  (zones ?? []).forEach((z) => {
    s[cleRegion(z.nom)] = {
      pts: z.nb_points_service,
      imf: z.nb_imf,
      membres: z.nb_membres_total ?? 0,
      encours: Number(z.encours_total ?? 0) / 1e9,
    };
  });
  return s;
}
