import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, qs } from "../api/client";
import { libelle, options } from "../api/libelles";
import type { IMF, IMFResume, Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Select } from "../components/Filtres";
import { Formulaire, versPoint } from "../components/Formulaire";
import { Badge, EnTete, Etat, Pagination } from "../components/ui";
import { useApi } from "../components/useApi";
import { CHAMPS_IMF } from "./formulaires";

export function IMFListe() {
  const { peutEcrire } = useAuth();
  const naviguer = useNavigate();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: "", type_imf: "", statut_reglementaire: "" });
  const [creation, setCreation] = useState(false);
  const { donnees, erreur, chargement } = useApi<Page<IMFResume>>(`/imf/${qs({ ...f, page })}`);
  const filtrer = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };

  return (
    <>
      <EnTete titre="Institutions de Microfinance"
        actions={peutEcrire && <button className="btn btn-primaire" onClick={() => setCreation(true)}>+ Nouvelle IMF</button>} />
      <div className="barre-filtres">
        <label className="filtre"><span>Recherche</span>
          <input placeholder="Nom ou sigle" value={f.search} onChange={(e) => filtrer({ search: e.target.value })} /></label>
        <Select label="Type" valeur={f.type_imf} onChange={(v) => filtrer({ type_imf: v })} options={options("type_imf")} />
        <Select label="Statut" valeur={f.statut_reglementaire} onChange={(v) => filtrer({ statut_reglementaire: v })} options={options("statut_reglementaire").filter((o) => o.value !== "RADIE")} />
      </div>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <table className="tableau">
        <thead><tr><th>Dénomination</th><th>Sigle</th><th>Type</th><th>Statut</th><th>Points de service</th></tr></thead>
        <tbody>
          {donnees?.results.map((i) => (
            <tr key={i.id}>
              <td><Link to={`/imf/${i.id}`}>{i.nom}</Link></td>
              <td>{i.sigle || "—"}</td>
              <td>{libelle("type_imf", i.type_imf)}</td>
              <td><Badge valeur={i.statut_reglementaire}>{libelle("statut_reglementaire", i.statut_reglementaire)}</Badge></td>
              <td>{i.nb_points_service}</td>
            </tr>
          ))}
          {donnees?.results.length === 0 && <tr><td colSpan={5} className="muet">Aucune IMF.</td></tr>}
        </tbody>
      </table>
      <Pagination page={donnees} numero={page} onChange={setPage} />
      {creation && (
        <Formulaire titre="Nouvelle IMF" champs={CHAMPS_IMF} initial={{ statut_reglementaire: "EN_COURS" }} fermer={() => setCreation(false)}
          soumettre={async ({ latitude, longitude, ...v }) => {
            const imf = await api.post<IMF>("/imf/", { ...v, localisation_siege: versPoint(latitude, longitude) });
            naviguer(`/imf/${imf.id}`);
          }} />
      )}
    </>
  );
}
