import "leaflet/dist/leaflet.css";

import type { FeatureCollection, Point } from "geojson";
import { useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

import { qs } from "../api/client";
import { libelle, options } from "../api/libelles";
import { Select, useReferentiels } from "../components/Filtres";
import { EnTete, Etat } from "../components/ui";
import { useApi } from "../components/useApi";

const CENTRE_SENEGAL: [number, number] = [14.5, -14.45];
const COULEUR_STATUT: Record<string, string> = { OUVERT: "#1a7f37", FERME: "#c62828", SUSPENDU: "#d97706" };

interface Proprietes {
  id: string; nom: string; imf_nom: string; type_point: string; statut_point: string;
  region_nom: string | null; departement_nom: string | null; commune_nom: string | null;
  telephone: string; email: string;
}

/** Carte micro : un marqueur par point de service (CAR-MIC-01 à 08). */
export function CarteMicro() {
  const ref = useReferentiels();
  const [f, setF] = useState({ imf: "", region: "", type_point: "", statut_point: "", bailleur: "" });
  const { donnees, erreur, chargement } = useApi<FeatureCollection<Point, Proprietes>>(`/points-service/geojson/${qs(f)}`);
  const points = donnees?.features ?? [];

  return (
    <>
      <EnTete titre="Carte des points de service" sousTitre={`${points.length} point(s) géolocalisé(s) affiché(s)`} />
      <div className="barre-filtres">
        <Select label="IMF" valeur={f.imf} onChange={(v) => setF({ ...f, imf: v })} options={ref.imfs.map((i) => ({ value: i.id, label: i.sigle || i.nom }))} />
        <Select label="Région" valeur={f.region} onChange={(v) => setF({ ...f, region: v })} options={ref.regions.map((z) => ({ value: z.id, label: z.nom }))} />
        <Select label="Type de point" valeur={f.type_point} onChange={(v) => setF({ ...f, type_point: v })} options={options("type_point")} />
        <Select label="Statut" valeur={f.statut_point} onChange={(v) => setF({ ...f, statut_point: v })} options={options("statut_point")} />
        <Select label="Bailleur" valeur={f.bailleur} onChange={(v) => setF({ ...f, bailleur: v })} options={ref.bailleurs.map((b) => ({ value: b.id, label: b.sigle || b.nom }))} />
      </div>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <div className="carte">
        <MapContainer center={CENTRE_SENEGAL} zoom={7} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {points.map((p) => {
            const [lon, lat] = p.geometry.coordinates;
            const pr = p.properties;
            return (
              <CircleMarker key={pr.id} center={[lat, lon]} radius={7}
                pathOptions={{ color: "#fff", weight: 1.5, fillColor: COULEUR_STATUT[pr.statut_point] ?? "#555", fillOpacity: 0.9 }}>
                <Popup>
                  <strong>{pr.imf_nom}</strong>
                  <div>{pr.nom} · {libelle("type_point", pr.type_point)}</div>
                  <div className="muet">{[pr.region_nom, pr.departement_nom, pr.commune_nom].filter(Boolean).join(" / ") || "Zone non renseignée"}</div>
                  {pr.telephone && <div>Tél. : {pr.telephone}</div>}
                  {pr.email && <div>Email : {pr.email}</div>}
                  <div>Statut : {libelle("statut_point", pr.statut_point)}</div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="legende">
        {Object.entries(COULEUR_STATUT).map(([k, c]) => (
          <span key={k}><i style={{ background: c }} />{libelle("statut_point", k)}</span>
        ))}
      </div>
    </>
  );
}
