import type { StatsRegion } from "../components/carto/SenegalMap";
import { cleRegion } from "../data/senegalRegions";

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
