import { useState, type FormEvent } from "react";

import { api, telecharger } from "../api/client";
import { dateFr, libelle, options } from "../api/libelles";
import type { Importation as Imp, Page } from "../api/types";
import { Badge, EnTete, Etat } from "../components/ui";
import { useApi } from "../components/useApi";

const TYPES = options("type_import");

export function Importation() {
  const [type, setType] = useState("IMF");
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<Imp | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const historique = useApi<Page<Imp>>("/importation/");

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!fichier) return;
    const fd = new FormData();
    fd.append("type_import", type);
    fd.append("fichier", fichier);
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(await api.post<Imp>("/importation/", fd));
      historique.recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <EnTete titre="Import / Export des données" sousTitre="Fichiers .csv ou .xlsx (5 Mo max). Une ligne existante est mise à jour, pas dupliquée." />
      <div className="deux-colonnes">
        <form className="panneau" onSubmit={envoyer}>
          <h2>Importer</h2>
          <label className="filtre"><span>Type de données</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></label>
          <label className="filtre"><span>Fichier</span>
            <input type="file" accept=".csv,.xlsx" required onChange={(e) => setFichier(e.target.files?.[0] ?? null)} /></label>
          <div className="actions">
            <button type="button" className="btn" onClick={() => telecharger(`/importation/modeles/${type}/`, `modele_${type}.csv`)}>Télécharger le modèle</button>
            <button className="btn btn-primaire" disabled={envoi || !fichier}>{envoi ? "Import en cours…" : "Importer"}</button>
          </div>
          {erreur && <div className="alerte alerte-erreur">{erreur}</div>}
          {resultat && <RapportImport imp={resultat} />}
        </form>
        <div className="panneau">
          <h2>Exporter (CSV)</h2>
          <p className="muet">Le fichier exporté peut être corrigé puis réimporté.</p>
          {TYPES.map((t) => (
            <button key={t.value} className="btn bloc" onClick={() => telecharger(`/importation/export/${t.value}/`, `export_${t.value}.csv`)}>
              Exporter : {t.label}
            </button>
          ))}
        </div>
      </div>
      <h2>Historique des imports</h2>
      <Etat chargement={historique.chargement && !historique.donnees} erreur={historique.erreur} />
      <table className="tableau">
        <thead><tr><th>Date</th><th>Type</th><th>Par</th><th>Statut</th><th>Lignes</th><th>Importées</th><th>Erreurs</th></tr></thead>
        <tbody>
          {historique.donnees?.results.map((i) => (
            <tr key={i.id} className="cliquable" onClick={() => setResultat(i)}>
              <td>{dateFr(i.date_creation)}</td><td>{libelle("type_import", i.type_import)}</td><td>{i.utilisateur_email}</td>
              <td><Badge valeur={i.statut}>{libelle("statut_import", i.statut)}</Badge></td>
              <td>{i.nb_lignes_total}</td><td>{i.nb_lignes_importees}</td><td>{i.nb_lignes_erreur}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RapportImport({ imp }: { imp: Imp }) {
  return (
    <div className={`alerte ${imp.statut === "ECHEC" ? "alerte-erreur" : imp.nb_lignes_erreur ? "" : "alerte-succes"}`}>
      <strong>{libelle("statut_import", imp.statut)}</strong> — {imp.nb_lignes_importees} / {imp.nb_lignes_total} ligne(s) importée(s)
      {imp.rapport_erreurs.length > 0 && (
        <ul className="rapport">
          {imp.rapport_erreurs.map((e, n) => (
            <li key={n}>
              {e.ligne ? `Ligne ${e.ligne} : ` : ""}
              {Object.entries(e.erreurs).map(([k, v]) => `${k} — ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ; ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
