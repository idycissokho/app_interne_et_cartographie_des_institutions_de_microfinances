import { useState } from "react";

import { api, qs } from "../api/client";
import { libelle, montant, options } from "../api/libelles";
import type { Page, PointServiceResume } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Select, useReferentiels } from "../components/Filtres";
import { Formulaire, versJson, versPoint } from "../components/Formulaire";
import { Badge, EnTete, Etat, Pagination } from "../components/ui";
import { useApi } from "../components/useApi";
import { champsPoint } from "./formulaires";

interface PointDetail extends PointServiceResume {
  adresse: string; telephone: string; email: string; date_ouverture: string | null;
  encours: string; depots: string | null; nombre_membres: number | null;
  localisation: { coordinates: [number, number] } | null;
}

const NULLABLES = ["date_ouverture", "depots", "nombre_membres"];

export function PointsListe() {
  const { peutEcrire } = useAuth();
  const ref = useReferentiels();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: "", imf: "", region: "", type_point: "", statut_point: "" });
  const [edition, setEdition] = useState<PointDetail | "nouveau" | null>(null);
  const { donnees, erreur, chargement, recharger } = useApi<Page<PointServiceResume>>(`/points-service/${qs({ ...f, page })}`);
  const filtrer = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };
  const imfs = ref.imfs.map((i) => ({ value: i.id, label: i.sigle || i.nom }));

  async function ouvrir(id: string) {
    setEdition(await api.get<PointDetail>(`/points-service/${id}/`));
  }

  const actuel = edition && edition !== "nouveau" ? edition : null;
  const gps = actuel?.localisation?.coordinates;

  return (
    <>
      <EnTete titre="Points de service"
        actions={peutEcrire && <button className="btn btn-primaire" onClick={() => setEdition("nouveau")}>+ Nouveau point</button>} />
      <div className="barre-filtres">
        <label className="filtre"><span>Recherche</span>
          <input placeholder="Nom ou adresse" value={f.search} onChange={(e) => filtrer({ search: e.target.value })} /></label>
        <Select label="IMF" valeur={f.imf} onChange={(v) => filtrer({ imf: v })} options={imfs} />
        <Select label="Région" valeur={f.region} onChange={(v) => filtrer({ region: v })} options={ref.regions.map((z) => ({ value: z.id, label: z.nom }))} />
        <Select label="Type" valeur={f.type_point} onChange={(v) => filtrer({ type_point: v })} options={options("type_point")} />
        <Select label="Statut" valeur={f.statut_point} onChange={(v) => filtrer({ statut_point: v })} options={options("statut_point")} />
      </div>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <table className="tableau">
        <thead><tr><th>Nom</th><th>IMF</th><th>Type</th><th>Région</th><th>Statut</th>{peutEcrire && <th />}</tr></thead>
        <tbody>
          {donnees?.results.map((p) => (
            <tr key={p.id}>
              <td>{p.nom}</td><td>{p.imf_nom}</td><td>{libelle("type_point", p.type_point)}</td><td>{p.region_nom ?? "—"}</td>
              <td><Badge valeur={p.statut_point}>{libelle("statut_point", p.statut_point)}</Badge></td>
              {peutEcrire && (
                <td className="actions-ligne">
                  <button className="btn btn-lien" onClick={() => ouvrir(p.id)}>Modifier</button>
                  <button className="btn btn-lien danger" onClick={async () => {
                    if (!window.confirm(`Désactiver « ${p.nom} » ?`)) return;
                    await api.delete(`/points-service/${p.id}/`);
                    recharger();
                  }}>Désactiver</button>
                </td>
              )}
            </tr>
          ))}
          {donnees?.results.length === 0 && <tr><td colSpan={6} className="muet">Aucun point de service.</td></tr>}
        </tbody>
      </table>
      <Pagination page={donnees} numero={page} onChange={setPage} />
      {actuel && <p className="muet">Encours : {montant(actuel.encours)}</p>}
      {edition && (
        <Formulaire titre={actuel ? `Modifier « ${actuel.nom} »` : "Nouveau point de service"} champs={champsPoint(imfs)}
          fermer={() => setEdition(null)}
          initial={actuel ? { ...actuel, latitude: gps?.[1], longitude: gps?.[0] } : { type_point: "AGENCE", statut_point: "OUVERT", statut_reglementaire: "EN_COURS" }}
          soumettre={async ({ latitude, longitude, ...v }) => {
            const corps = { ...versJson(v, NULLABLES), localisation: versPoint(latitude, longitude), encours: v.encours || "0" };
            if (actuel) await api.patch(`/points-service/${actuel.id}/`, corps);
            else await api.post("/points-service/", corps);
            recharger();
          }} />
      )}
    </>
  );
}
