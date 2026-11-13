import "leaflet/dist/leaflet.css";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import { useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";

import { libelle, montant, options } from "../api/libelles";
import type { ZoneAgregats } from "../api/types";
import { Select } from "../components/Filtres";
import { EnTete, Etat } from "../components/ui";
import { useApi } from "../components/useApi";

type Indicateur = "nb_points_service" | "nb_imf" | "encours_total" | "depots_total" | "nb_membres_total";
const INDICATEURS: { value: Indicateur; label: string }[] = [
  { value: "nb_points_service", label: "Points de service" },
  { value: "nb_imf", label: "IMF présentes" },
  { value: "encours_total", label: "Encours" },
  { value: "depots_total", label: "Dépôts" },
  { value: "nb_membres_total", label: "Membres" },
];
const echapper = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const TEINTES = ["#eef4fb", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"];

/** Carte macro : indicateurs agrégés par région / département / commune. */
export function CarteMacro() {
  const [typeZone, setTypeZone] = useState("REGION");
  const [indicateur, setIndicateur] = useState<Indicateur>("nb_points_service");
  const agregats = useApi<ZoneAgregats[]>(`/cartographie/zones/agregats/?type_zone=${typeZone}`);
  const formes = useApi<FeatureCollection<Geometry, { id: string }>>(`/cartographie/zones/geojson/?type_zone=${typeZone}`);

  const parId = useMemo(() => new Map((agregats.donnees ?? []).map((z) => [z.id, z])), [agregats.donnees]);
  const max = Math.max(1, ...(agregats.donnees ?? []).map((z) => Number(z[indicateur] ?? 0)));

  const style = (f?: Feature<Geometry, { id: string }>): PathOptions => {
    const v = Number(parId.get(f?.properties.id ?? "")?.[indicateur] ?? 0);
    const i = v === 0 ? 0 : Math.min(TEINTES.length - 1, Math.ceil((v / max) * (TEINTES.length - 1)));
    return { color: "#334", weight: 1, fillColor: TEINTES[i], fillOpacity: 0.75 };
  };
  const popup = (f: Feature<Geometry, { id: string }>, couche: Layer) => {
    const z = parId.get(f.properties.id);
    if (!z) return;
    couche.bindPopup(
      `<strong>${echapper(z.nom)}</strong><br/>IMF : ${z.nb_imf}<br/>Points de service : ${z.nb_points_service}` +
        `<br/>Encours : ${montant(z.encours_total)}<br/>Dépôts : ${montant(z.depots_total)}<br/>Membres : ${z.nb_membres_total ?? "—"}`,
    );
  };

  const lignes = [...(agregats.donnees ?? [])].sort((a, b) => Number(b[indicateur] ?? 0) - Number(a[indicateur] ?? 0));

  return (
    <>
      <EnTete titre="Carte macro" sousTitre="Présence des IMF par zone administrative" />
      <div className="barre-filtres">
        <Select label="Niveau" valeur={typeZone} onChange={(v) => setTypeZone(v || "REGION")} options={options("type_zone")} />
        <Select label="Indicateur" valeur={indicateur} onChange={(v) => setIndicateur((v || "nb_points_service") as Indicateur)} options={INDICATEURS} />
      </div>
      <Etat chargement={agregats.chargement && !agregats.donnees} erreur={agregats.erreur || formes.erreur} />
      <div className="carte">
        <MapContainer center={[14.5, -14.45]} zoom={7}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {formes.donnees && (
            <GeoJSON key={`${typeZone}-${indicateur}-${parId.size}`} data={formes.donnees} style={style} onEachFeature={popup} />
          )}
        </MapContainer>
      </div>
      {formes.donnees && formes.donnees.features.length === 0 && (
        <div className="alerte">Aucune géométrie chargée pour ce niveau : seul le tableau est disponible.</div>
      )}
      <table className="tableau">
        <thead>
          <tr><th>{libelle("type_zone", typeZone)}</th><th>IMF</th><th>Points de service</th><th>Encours</th><th>Dépôts</th><th>Membres</th></tr>
        </thead>
        <tbody>
          {lignes.map((z) => (
            <tr key={z.id}>
              <td>{z.nom}</td><td>{z.nb_imf}</td><td>{z.nb_points_service}</td>
              <td>{montant(z.encours_total)}</td><td>{montant(z.depots_total)}</td><td>{z.nb_membres_total ?? "—"}</td>
            </tr>
          ))}
          {lignes.length === 0 && <tr><td colSpan={6} className="muet">Aucune zone de ce niveau.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
