import type { IMFResume, Page, Zone } from "../api/types";
import { useApi } from "./useApi";

/** Listes de référence utilisées par les filtres et formulaires. */
export function useReferentiels() {
  const imfs = useApi<Page<IMFResume>>("/imf/?page_size=1000");
  const regions = useApi<Page<Zone>>("/cartographie/zones/?type_zone=REGION&page_size=1000");
  const bailleurs = useApi<Page<{ id: string; nom: string; sigle: string }>>("/imf/bailleurs/?page_size=1000");
  return {
    imfs: imfs.donnees?.results ?? [],
    regions: regions.donnees?.results ?? [],
    bailleurs: bailleurs.donnees?.results ?? [],
  };
}

export function Select({
  label, valeur, onChange, options,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="filtre">
      <span>{label}</span>
      <select value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tous</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
