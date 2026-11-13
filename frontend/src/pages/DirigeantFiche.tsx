import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, requete } from "../api/client";
import { libelle } from "../api/libelles";
import type { Dirigeant, Mandat } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useReferentiels } from "../components/Filtres";
import { Formulaire } from "../components/Formulaire";
import { Badge, Champ, EnTete, Etat } from "../components/ui";
import { useApi } from "../components/useApi";
import { CHAMPS_DIRIGEANT, champsMandat, versFormData } from "./formulaires";

/** Fiche dirigeant : chaque consultation est journalisée côté API (OBJ-09). */
export function DirigeantFiche() {
  const { id } = useParams();
  const { peutEcrire } = useAuth();
  const naviguer = useNavigate();
  const ref = useReferentiels();
  const [edition, setEdition] = useState(false);
  const [mandat, setMandat] = useState<Mandat | "nouveau" | null>(null);
  const { donnees: d, erreur, chargement, recharger } = useApi<Dirigeant>(`/dirigeants/${id}/`);
  if (!d) return <Etat chargement={chargement} erreur={erreur} />;

  const imfs = ref.imfs.map((i) => ({ value: i.id, label: i.sigle || i.nom }));
  const mandatActuel = mandat && mandat !== "nouveau" ? mandat : null;
  const urlMandats = `/dirigeants/${d.id}/mandats/`;

  return (
    <>
      <p><Link to="/dirigeants">← Dirigeants</Link></p>
      <EnTete titre={d.nom_complet} sousTitre="Consultation enregistrée dans le journal d'audit"
        actions={peutEcrire && (<>
          <button className="btn" onClick={() => setEdition(true)}>Modifier</button>
          <button className="btn btn-danger" onClick={async () => {
            if (!window.confirm(`Désactiver « ${d.nom_complet} » ?`)) return;
            await api.delete(`/dirigeants/${d.id}/`);
            naviguer("/dirigeants");
          }}>Désactiver</button>
        </>)} />
      <dl className="grille-lecture">
        <Champ label="Téléphone" valeur={d.telephone} />
        <Champ label="Email professionnel" valeur={d.email_professionnel} />
        <Champ label="Email secondaire" valeur={d.email_secondaire} />
      </dl>

      <div className="entete">
        <h2>Mandats (historique)</h2>
        {peutEcrire && <button className="btn btn-primaire" onClick={() => setMandat("nouveau")}>+ Nouveau mandat</button>}
      </div>
      <table className="tableau">
        <thead><tr><th>IMF</th><th>Fonction</th><th>Début</th><th>Fin</th><th>Statut</th><th>Justificatif</th>{peutEcrire && <th />}</tr></thead>
        <tbody>
          {d.mandats.map((m) => (
            <tr key={m.id}>
              <td><Link to={`/imf/${m.imf}`}>{m.imf_nom}</Link></td>
              <td>{libelle("fonction_mandat", m.fonction_mandat)}</td>
              <td>{m.date_debut}</td><td>{m.date_fin ?? "—"}</td>
              <td><Badge valeur={m.statut_mandat}>{libelle("statut_mandat", m.statut_mandat)}</Badge></td>
              <td>
                {m.fichier_justificatif && <a href={m.fichier_justificatif} target="_blank" rel="noreferrer">Fichier</a>}
                {m.documents_justificatifs && <> <a href={m.documents_justificatifs} target="_blank" rel="noreferrer">Lien</a></>}
                {!m.fichier_justificatif && !m.documents_justificatifs && "—"}
              </td>
              {peutEcrire && (
                <td className="actions-ligne">
                  <button className="btn btn-lien" onClick={() => setMandat(m)}>Modifier</button>
                  <button className="btn btn-lien danger" onClick={async () => {
                    if (!window.confirm("Supprimer ce mandat ?")) return;
                    await api.delete(`${urlMandats}${m.id}/`);
                    recharger();
                  }}>Supprimer</button>
                </td>
              )}
            </tr>
          ))}
          {d.mandats.length === 0 && <tr><td colSpan={7} className="muet">Aucun mandat.</td></tr>}
        </tbody>
      </table>

      {edition && (
        <Formulaire titre="Modifier le dirigeant" champs={CHAMPS_DIRIGEANT} initial={d} fermer={() => setEdition(false)}
          soumettre={async (v) => { await api.patch(`/dirigeants/${d.id}/`, v); recharger(); }} />
      )}
      {mandat && (
        <Formulaire titre={mandatActuel ? "Modifier le mandat" : "Nouveau mandat"} champs={champsMandat(imfs)}
          initial={mandatActuel ?? { statut_mandat: "EN_FONCTION" }} fermer={() => setMandat(null)}
          soumettre={async (v) => {
            const fd = versFormData(v);
            // Vider la date de fin en modification : il faut l'envoyer explicitement vide.
            if (mandatActuel && !v.date_fin) fd.append("date_fin", "");
            const methode = mandatActuel ? "PATCH" : "POST";
            const chemin = mandatActuel ? `${urlMandats}${mandatActuel.id}/` : urlMandats;
            await requete(chemin, { method: methode, body: fd });
            recharger();
          }} />
      )}
    </>
  );
}
