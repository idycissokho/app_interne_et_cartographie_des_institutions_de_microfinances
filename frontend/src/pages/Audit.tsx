import { useState } from "react";

import { qs } from "../api/client";
import type { EntreeAudit, Page } from "../api/types";
import { Select } from "../components/Filtres";
import { EnTete, Etat, Pagination } from "../components/ui";
import { useApi } from "../components/useApi";

const ACTIONS = ["CREATION", "MODIFICATION", "SUPPRESSION", "CONSULTATION", "CONNEXION", "DECONNEXION",
  "CHANGEMENT_MOT_DE_PASSE", "IMPORTATION", "EXPORTATION"].map((a) => ({ value: a, label: a }));

export function Audit() {
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: "", action: "" });
  const { donnees, erreur, chargement } = useApi<Page<EntreeAudit>>(`/audit/${qs({ ...f, page })}`);
  return (
    <>
      <EnTete titre="Journal d'audit" sousTitre="Lecture seule — réservé aux administrateurs" />
      <div className="barre-filtres">
        <label className="filtre"><span>Recherche</span>
          <input placeholder="Utilisateur, objet…" value={f.search} onChange={(e) => { setF({ ...f, search: e.target.value }); setPage(1); }} /></label>
        <Select label="Action" valeur={f.action} onChange={(v) => { setF({ ...f, action: v }); setPage(1); }} options={ACTIONS} />
      </div>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <table className="tableau">
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Rôle</th><th>Action</th><th>Objet</th><th>Détail</th></tr></thead>
        <tbody>
          {donnees?.results.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.date_action).toLocaleString("fr-FR")}</td>
              <td>{e.utilisateur_email ?? "—"}</td><td>{e.role}</td><td>{e.action}</td>
              <td className="mono">{e.objet_concerne}</td>
              <td className="muet">{String(e.details.libelle ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={donnees} numero={page} onChange={setPage} />
    </>
  );
}
