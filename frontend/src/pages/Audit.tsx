/**
 * Journal d'audit (ADMIN). Pas d'écran dédié dans la maquette (lien « # ») :
 * mise en page reprise de l'écran 07 (en-tête, chips, tableau, pagination).
 */
import { useState } from "react";

import { qs } from "../api/client";
import type { Page } from "../api/types";
import { AppLayout } from "../components/layout/AppLayout";
import { nombre, pluriel } from "../lib/format";
import { Badge, CadreTableau, ChampRecherche, EnTete, EtatVide, LignesChargement, Pagination, Pastille, Tableau, PAR_PAGE } from "../components/tableau/Tableau";
import { regionAffichee } from "../lib/metier";
import { URL_IMF_OPTIONS, URL_REGIONS, type AgregatZone, type ImfOption } from "../lib/stats";
import { useDonnees } from "../lib/useDonnees";

interface Entree { id: string; utilisateur: string | null; utilisateur_email: string | null; action: string; objet_concerne: string; role: string; date_action: string; details: Record<string, unknown> }

/** Libellés français des valeurs enregistrées dans le journal (rien n'est modifié dans le journal lui-même). */
const LIB_ACTION: Record<string, string> = {
  CONSULTATION: "Consultation", CREATION: "Création", MODIFICATION: "Modification", SUPPRESSION: "Désactivation",
  IMPORTATION: "Import", EXPORTATION: "Export", CONNEXION: "Connexion", DECONNEXION: "Déconnexion",
  CHANGEMENT_MOT_DE_PASSE: "Changement de mot de passe",
};
const LIB_STATUT_IMPORT: Record<string, string> = { EN_ATTENTE: "En attente", EN_COURS: "En cours", TERMINE: "Terminé", ECHEC: "Échec" };
const LIB_TYPE_DONNEES: Record<string, string> = { IMF: "des institutions", POINTS_SERVICE: "des points de service", DIRIGEANTS: "des dirigeants" };
const LIB_ROLE: Record<string, string> = { ADMIN: "Administrateur", SUPERVISEUR: "Superviseur", CONSULTANT: "Consultant" };
const LIB_OBJET: Record<string, string> = {
  "imf.IMF": "Institution", "imf.Bailleur": "Bailleur", "points_service.PointService": "Point de service",
  "dirigeants.Dirigeant": "Dirigeant", "dirigeants.Mandat": "Mandat", "cartographie.ZoneGeographique": "Zone géographique",
  "importation.ImportationFichier": "Import de fichier", "authentication.Utilisateur": "Compte utilisateur", "assistant.Question": "Assistant",
};
const nombreDetail = (v: unknown) => (typeof v === "number" ? v : null);

const ACTIONS: [string, string, string][] = [
  ["", "Toutes", "#0B1424"], ["CONSULTATION", "Consultations", "#0B1424"], ["CREATION", "Créations", "#15803D"], ["MODIFICATION", "Modifications", "#C9A44C"],
  ["SUPPRESSION", "Désactivations", "#B91C1C"], ["IMPORTATION", "Imports", "#1F4E79"], ["EXPORTATION", "Exports", "#2E7D6B"], ["CONNEXION", "Connexions", "#6B7280"], ["DECONNEXION", "Déconnexions", "#9AA3B2"],
];
const TAILLE = PAR_PAGE;

export function Audit() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // Listes déjà utilisées ailleurs (en cache) : noms des institutions et des régions citées par identifiant ou code.
  const { donnees: d } = useDonnees<{ rows: Page<Entree>; imfs: ImfOption[]; regions: AgregatZone[] }>({
    rows: `/audit/${qs({ action, search: q, page, page_size: TAILLE, ordering: "-date_action" })}`,
    imfs: URL_IMF_OPTIONS, regions: URL_REGIONS,
  });
  const nomImf = new Map((d.imfs ?? []).map((i) => [i.id, i.sigle || i.nom]));
  const nomRegion = new Map((d.regions ?? []).map((z) => [z.code, regionAffichee(z.nom) ?? z.nom]));

  /** Objet lisible de l'entrée : [libellé principal, nature de l'objet]. */
  const objet = (e: Entree): [string, string] => {
    const [modele, ...reste] = e.objet_concerne.split(":");
    const id = reste.join(":");
    const nature = LIB_OBJET[modele] ?? "";
    const libelle = String(e.details.libelle ?? "");
    if (modele === "export") {
      const [type, region] = reste;
      return [`Export ${LIB_TYPE_DONNEES[type] ?? type.toLowerCase()}${region ? ` — ${nomRegion.get(region) ?? region}` : ""}`, "Export de fichier"];
    }
    if (modele === "importation.ImportationFichier") {
      const type = String(e.details.type_import ?? ""), statut = String(e.details.statut ?? "");
      const comptes = [[nombreDetail(e.details.lignes_creees), "créée", "créées"], [nombreDetail(e.details.lignes_mises_a_jour), "mise à jour", "mises à jour"], [nombreDetail(e.details.lignes_erreur), "en erreur", "en erreur"]] as const;
      const resume = comptes.filter(([n]) => n !== null).map(([n, un, plusieurs]) => `${n} ${n! > 1 ? plusieurs : un}`).join(", ");
      return [`Import ${LIB_TYPE_DONNEES[type] ?? ""}${statut ? ` — ${LIB_STATUT_IMPORT[statut] ?? statut}` : ""}${resume ? ` (${resume})` : ""}`.replace(/\s+/g, " ").trim(), nature];
    }
    if (modele === "authentication.Utilisateur") {
      if (e.utilisateur && id === e.utilisateur && e.utilisateur_email) return [e.utilisateur_email, "Son propre compte"];
      return [libelle || "Compte utilisateur", nature];
    }
    if (modele === "imf.IMF" && libelle === "Dirigeants de l'IMF") return [nomImf.has(id) ? `Dirigeants de l'institution ${nomImf.get(id)}` : "Dirigeants de l'institution", nature];
    return [libelle || nature || e.objet_concerne, nature];
  };
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const couleur = (a: string) => ACTIONS.find((x) => x[0] === a)?.[2] ?? "#6B7280";

  return (
    <AppLayout active="audit" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="in-up" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Données / Traçabilité</span>
          <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Journal d'audit</h1>
          <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Toutes les actions des utilisateurs, dont les consultations des fiches dirigeants. Lecture seule.</p>
        </header>
        <CadreTableau className="in-up d1"
          barre={<>
            <ChampRecherche libelle="Rechercher dans le journal" placeholder="Utilisateur, objet…" valeur={q} onChange={(v) => { setQ(v); setPage(1); }} />
            {ACTIONS.map(([k, l]) => <Pastille key={l} actif={k === action} onClick={() => { setAction(k); setPage(1); }}>{l}</Pastille>)}
          </>}
          pied={<Pagination page={page} pages={pages} onPage={setPage} resume={`${nombre(total)} ${pluriel(total, "entrée")}`} />}>
          <Tableau largeurMin={860}>
            <thead><tr><EnTete>Date</EnTete><EnTete>Action</EnTete><EnTete>Objet</EnTete><EnTete>Utilisateur</EnTete><EnTete>Rôle</EnTete></tr></thead>
            <tbody>
              {!d.rows && <LignesChargement colonnes={5} />}
              {rows.map((e) => (
                <tr key={e.id}>
                  <td data-label="Date" style={{ whiteSpace: "nowrap", color: "#4A5568" }}>{new Date(e.date_action).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td data-label="Action"><span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: couleur(e.action) }} />{LIB_ACTION[e.action] ?? e.action}</span></td>
                  <td data-label="Objet" className="principal">{(() => {
                    const [libelle, nature] = objet(e);
                    return <>
                      <div style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{libelle}</div>
                      {/* Identifiant technique conservé, en secondaire. */}
                      <span className="muet" style={{ fontSize: "var(--t-xs)", color: "#8B8F98", overflowWrap: "anywhere" }}>{nature && nature !== libelle ? `${nature} · ` : ""}<code style={{ fontSize: "inherit" }}>{e.objet_concerne}</code></span>
                    </>;
                  })()}</td>
                  <td data-label="Utilisateur" style={{ color: "#4A5568" }}>{e.utilisateur_email ?? "—"}</td>
                  <td data-label="Rôle"><Badge point={false}>{LIB_ROLE[e.role] ?? (e.role || "—")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Tableau>
          {d.rows && rows.length === 0 && <EtatVide titre="Aucune entrée">Aucune action ne correspond à ces critères.</EtatVide>}
        </CadreTableau>
      </main>
    </AppLayout>
  );
}
