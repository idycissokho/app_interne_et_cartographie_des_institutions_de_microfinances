import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, qs } from "../api/client";
import { options } from "../api/libelles";
import type { Dirigeant, DirigeantResume, Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Select, useReferentiels } from "../components/Filtres";
import { Formulaire } from "../components/Formulaire";
import { EnTete, Etat, Pagination } from "../components/ui";
import { useApi } from "../components/useApi";
import { CHAMPS_DIRIGEANT } from "./formulaires";

export function DirigeantsListe() {
  const { peutEcrire } = useAuth();
  const ref = useReferentiels();
  const naviguer = useNavigate();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: "", mandats__fonction_mandat: "", mandats__imf: "" });
  const [creation, setCreation] = useState(false);
  const { donnees, erreur, chargement } = useApi<Page<DirigeantResume>>(`/dirigeants/${qs({ ...f, page })}`);
  const filtrer = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };

  return (
    <>
      <EnTete titre="Dirigeants des IMF"
        actions={peutEcrire && <button className="btn btn-primaire" onClick={() => setCreation(true)}>+ Nouveau dirigeant</button>} />
      <div className="barre-filtres">
        <label className="filtre"><span>Recherche</span>
          <input placeholder="Nom, prénom ou email" value={f.search} onChange={(e) => filtrer({ search: e.target.value })} /></label>
        <Select label="Fonction" valeur={f.mandats__fonction_mandat} onChange={(v) => filtrer({ mandats__fonction_mandat: v })} options={options("fonction_mandat")} />
        <Select label="IMF" valeur={f.mandats__imf} onChange={(v) => filtrer({ mandats__imf: v })} options={ref.imfs.map((i) => ({ value: i.id, label: i.sigle || i.nom }))} />
      </div>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <table className="tableau">
        <thead><tr><th>Nom complet</th><th>Téléphone</th><th>Email professionnel</th><th>Mandats</th></tr></thead>
        <tbody>
          {donnees?.results.map((d) => (
            <tr key={d.id}>
              <td><Link to={`/dirigeants/${d.id}`}>{d.nom_complet}</Link></td>
              <td>{d.telephone || "—"}</td><td>{d.email_professionnel || "—"}</td><td>{d.nb_mandats}</td>
            </tr>
          ))}
          {donnees?.results.length === 0 && <tr><td colSpan={4} className="muet">Aucun dirigeant.</td></tr>}
        </tbody>
      </table>
      <Pagination page={donnees} numero={page} onChange={setPage} />
      {creation && (
        <Formulaire titre="Nouveau dirigeant" champs={CHAMPS_DIRIGEANT} fermer={() => setCreation(false)}
          soumettre={async (v) => {
            const d = await api.post<Dirigeant>("/dirigeants/", v);
            naviguer(`/dirigeants/${d.id}`);
          }} />
      )}
    </>
  );
}
