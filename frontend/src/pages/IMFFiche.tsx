import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, qs } from "../api/client";
import { libelle, options } from "../api/libelles";
import type { IMF, Mandat, Page, PointServiceResume } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Select, useReferentiels } from "../components/Filtres";
import { Formulaire, versPoint } from "../components/Formulaire";
import { Badge, Champ, EnTete, Etat, Onglets } from "../components/ui";
import { useApi } from "../components/useApi";
import { CHAMPS_IMF } from "./formulaires";

export function IMFFiche() {
  const { id } = useParams();
  const { peutEcrire } = useAuth();
  const naviguer = useNavigate();
  const [onglet, setOnglet] = useState("infos");
  const [edition, setEdition] = useState(false);
  const { donnees: imf, erreur, chargement, recharger } = useApi<IMF>(`/imf/${id}/`);

  if (!imf) return <Etat chargement={chargement} erreur={erreur} />;
  const gps = imf.localisation_siege?.coordinates;

  async function supprimer() {
    if (!window.confirm(`Désactiver l'IMF « ${imf!.nom} » ?`)) return;
    await api.delete(`/imf/${imf!.id}/`);
    naviguer("/imf");
  }

  return (
    <>
      <p><Link to="/imf">← Institutions</Link></p>
      <EnTete titre={imf.nom} sousTitre={[imf.sigle, libelle("type_imf", imf.type_imf)].filter(Boolean).join(" · ")}
        actions={peutEcrire && (<>
          <button className="btn" onClick={() => setEdition(true)}>Modifier</button>
          <button className="btn btn-danger" onClick={supprimer}>Désactiver</button>
        </>)} />
      <Onglets actif={onglet} onChange={setOnglet} onglets={[
        { id: "infos", label: "Informations" },
        { id: "points", label: `Points de service (${imf.nb_points_service})` },
        { id: "dirigeants", label: "Dirigeants" },
      ]} />

      {onglet === "infos" && (
        <dl className="grille-lecture">
          <Champ label="Statut réglementaire" valeur={<Badge valeur={imf.statut_reglementaire}>{libelle("statut_reglementaire", imf.statut_reglementaire)}</Badge>} />
          <Champ label="Adresse du siège" valeur={imf.adresse_siege} />
          <Champ label="Coordonnées GPS" valeur={gps && `${gps[1].toFixed(5)}, ${gps[0].toFixed(5)}`} />
          <Champ label="Téléphone" valeur={imf.telephone} />
          <Champ label="Email" valeur={imf.email} />
          <Champ label="Site web" valeur={imf.site_web && <a href={imf.site_web} target="_blank" rel="noreferrer">{imf.site_web}</a>} />
          <Champ label="Bailleurs" valeur={imf.bailleurs_detail.map((b) => b.sigle || b.nom).join(", ")} />
        </dl>
      )}
      {onglet === "points" && <PointsDeLIMF imfId={imf.id} />}
      {onglet === "dirigeants" && <DirigeantsDeLIMF imfId={imf.id} />}

      {edition && (
        <Formulaire titre="Modifier l'IMF" champs={CHAMPS_IMF} fermer={() => setEdition(false)}
          initial={{ ...imf, latitude: gps?.[1], longitude: gps?.[0] }}
          soumettre={async ({ latitude, longitude, ...v }) => {
            await api.patch(`/imf/${imf.id}/`, { ...v, localisation_siege: versPoint(latitude, longitude) });
            recharger();
          }} />
      )}
      {peutEcrire && onglet === "infos" && <GestionBailleurs imf={imf} recharger={recharger} />}
    </>
  );
}

function GestionBailleurs({ imf, recharger }: { imf: IMF; recharger: () => void }) {
  const { bailleurs } = useReferentiels();
  const [choix, setChoix] = useState("");
  const disponibles = bailleurs.filter((b) => !imf.bailleurs.includes(b.id));
  if (!disponibles.length && !imf.bailleurs.length) return null;
  return (
    <div className="barre-filtres">
      <Select label="Associer un bailleur" valeur={choix} onChange={setChoix} options={disponibles.map((b) => ({ value: b.id, label: b.sigle || b.nom }))} />
      <button className="btn" disabled={!choix} onClick={async () => {
        await api.patch(`/imf/${imf.id}/`, { bailleurs: [...imf.bailleurs, choix] });
        setChoix("");
        recharger();
      }}>Associer</button>
      {imf.bailleurs_detail.map((b) => (
        <button key={b.id} className="btn btn-lien" onClick={async () => {
          await api.patch(`/imf/${imf.id}/`, { bailleurs: imf.bailleurs.filter((x) => x !== b.id) });
          recharger();
        }}>Retirer {b.sigle || b.nom}</button>
      ))}
    </div>
  );
}

function PointsDeLIMF({ imfId }: { imfId: string }) {
  const { donnees, erreur, chargement } = useApi<Page<PointServiceResume>>(`/points-service/${qs({ imf: imfId, page_size: 1000 })}`);
  return (
    <>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <table className="tableau">
        <thead><tr><th>Nom</th><th>Type</th><th>Région</th><th>Statut</th></tr></thead>
        <tbody>
          {donnees?.results.map((p) => (
            <tr key={p.id}>
              <td>{p.nom}</td><td>{libelle("type_point", p.type_point)}</td><td>{p.region_nom ?? "—"}</td>
              <td><Badge valeur={p.statut_point}>{libelle("statut_point", p.statut_point)}</Badge></td>
            </tr>
          ))}
          {donnees?.results.length === 0 && <tr><td colSpan={4} className="muet">Aucun point de service.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

/** Onglet « Dirigeants » de la fiche IMF, filtrable par fonction (DIR-08, DIR-09). */
function DirigeantsDeLIMF({ imfId }: { imfId: string }) {
  const [fonction, setFonction] = useState("");
  const { donnees, erreur, chargement } = useApi<Page<Mandat>>(`/imf/${imfId}/mandats/${qs({ fonction_mandat: fonction, page_size: 1000 })}`);
  return (
    <>
      <div className="barre-filtres">
        <Select label="Fonction" valeur={fonction} onChange={setFonction} options={options("fonction_mandat")} />
      </div>
      <Etat chargement={chargement && !donnees} erreur={erreur} />
      <table className="tableau">
        <thead><tr><th>Dirigeant</th><th>Fonction</th><th>Début</th><th>Fin</th><th>Statut</th></tr></thead>
        <tbody>
          {donnees?.results.map((m) => (
            <tr key={m.id}>
              <td><Link to={`/dirigeants/${m.dirigeant}`}>{m.dirigeant_nom_complet}</Link></td>
              <td>{libelle("fonction_mandat", m.fonction_mandat)}</td>
              <td>{m.date_debut}</td><td>{m.date_fin ?? "—"}</td>
              <td><Badge valeur={m.statut_mandat}>{libelle("statut_mandat", m.statut_mandat)}</Badge></td>
            </tr>
          ))}
          {donnees?.results.length === 0 && <tr><td colSpan={5} className="muet">Aucun dirigeant enregistré.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
