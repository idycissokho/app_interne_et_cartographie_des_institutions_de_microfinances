/**
 * Écran 07 — Institutions (maquette-carto-imf/ecrans/07-institutions.dc.html).
 */
import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, qs, telecharger } from "../api/client";
import type { Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AppLayout } from "../components/layout/AppLayout";
import { telechargerCsv } from "../lib/csv";
import { STATUT_IMF_LONG, TYPE_IMF_LONG, initiales, regionAffichee } from "../lib/metier";
import { Badge, BoutonIcone, CadreTableau, CelluleActions, ChampRecherche, EnTete, EtatVide, LignesChargement, Pagination, Pastille, TON_STATUT, Tableau } from "../components/tableau/Tableau";
import { useDonnees, type Compte } from "../lib/useDonnees";

interface Ligne {
  id: string; nom: string; sigle: string; type_imf: string; statut_reglementaire: string; email: string;
  region_siege: string | null; a_gps: boolean; nb_points_service: number; nb_dirigeants_en_fonction: number; bailleurs_noms: string[];
}

const TABMAP: [string, string][] = [["Toutes", ""], ["En activité", "EN_ACTIVITE"], ["OPR", "OPR"], ["Retrait d'agrément", "RETRAIT_AGREMENT"]];
const TYPES: [string, string][] = [["Tous", ""], ["Mutuelle", "MUTUELLE"], ["Coopérative", "COOPERATIVE"], ["Société Anonyme", "SA"], ["Association", "ASSOCIATION"]];
// Exception demandée : le tableau des institutions affiche 8 lignes par page (6 ailleurs).
const TAILLE = 8;
const barreBtn: CSSProperties = { height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid #D6D3D1", background: "#FFFFFF", color: "#0B1424", font: "inherit", fontSize: "var(--t-sm)", fontWeight: 500, cursor: "pointer" };
const pastilleImf: CSSProperties = { width: 36, height: 36, flex: "none", borderRadius: 8, background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-xs)", fontWeight: 600 };

export function Institutions() {
  const naviguer = useNavigate();
  // Diagramme de cas d'utilisation : créer / désactiver / importer / exporter = ADMIN.
  const { estAdmin } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("statut") ?? "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [version, setVersion] = useState(0);
  const [statutLot, setStatutLot] = useState(false);

  const base = { type_imf: type, search: q };
  const { donnees: d } = useDonnees<{ rows: Page<Ligne>; t0: Compte; t1: Compte; t2: Compte; t3: Compte }>(
    {
      rows: `/imf/${qs({ ...base, statut_reglementaire: tab, page, page_size: TAILLE })}`,
      t0: `/imf/${qs({ ...base, page_size: 1 })}`,
      t1: `/imf/${qs({ ...base, statut_reglementaire: "EN_ACTIVITE", page_size: 1 })}`,
      t2: `/imf/${qs({ ...base, statut_reglementaire: "OPR", page_size: 1 })}`,
      t3: `/imf/${qs({ ...base, statut_reglementaire: "RETRAIT_AGREMENT", page_size: 1 })}`,
    },
    [version],
  );
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const compte = [d.t0, d.t1, d.t2, d.t3].map((c) => c?.count ?? 0);
  const choisis = rows.filter((r) => sel[r.id]);
  const allSel = rows.length > 0 && choisis.length === rows.length;
  const filtrer = (f: () => void) => { f(); setPage(1); setSel({}); };
  const recharger = () => { setSel({}); setVersion((v) => v + 1); };

  async function changerStatut(statut: string) {
    await Promise.all(choisis.map((r) => api.patch(`/imf/${r.id}/`, { statut_reglementaire: statut })));
    setStatutLot(false);
    recharger();
  }
  async function archiver(r: Ligne) {
    if (!window.confirm(`Désactiver l'institution « ${r.nom} » ? Elle n'apparaîtra plus dans le référentiel.`)) return;
    await api.delete(`/imf/${r.id}/`);
    recharger();
  }
  const exporterSelection = () =>
    telechargerCsv("institutions_selection.csv", [
      ["nom", "sigle", "type_imf", "statut_reglementaire", "email", "region_siege", "points", "dirigeants", "bailleurs"],
      ...choisis.map((r) => [r.nom, r.sigle, r.type_imf, r.statut_reglementaire, r.email, regionAffichee(r.region_siege), r.nb_points_service, r.nb_dirigeants_en_fonction, r.bailleurs_noms.join(" · ")]),
    ]);

  return (
    <AppLayout active="imf" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="in-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Référentiels</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Institutions de microfinance</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Le référentiel réglementaire des IMF : identité, statut, siège et bailleurs.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {estAdmin && <Link to="/donnees" style={{ height: 46, padding: "0 16px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>Importer</Link>}
            {estAdmin && <button type="button" onClick={() => telecharger("/importation/export/IMF/", "export_imf.csv")} style={{ height: 46, padding: "0 16px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Exporter CSV</button>}
            {estAdmin && <Link to="/imf/nouveau" style={{ height: 46, padding: "0 18px", borderRadius: 10, background: "#C9A44C", fontSize: "var(--t-md)", fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouvelle IMF</Link>}
          </div>
        </header>

        <nav className="in-up d1" aria-label="Filtrer par statut réglementaire" style={{ display: "flex", gap: 6, borderBottom: "1px solid #E7E5E4", flexWrap: "wrap" }}>
          {TABMAP.map(([label, v], i) => {
            const on = v === tab;
            return (
              <button key={label} type="button" aria-pressed={on} onClick={() => filtrer(() => setTab(v))} style={{ border: "none", background: "transparent", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: -1, ...(on ? { color: "#0B1424", boxShadow: "inset 0 -2px 0 #C9A44C" } : { color: "#6B7280" }) }}>
                {label} <span style={{ fontSize: "var(--t-2xs)", fontWeight: 700, padding: "2px 8px", borderRadius: 999, ...(on ? { background: "#0B1424", color: "#FFFFFF" } : { background: "#F0EFED", color: "#4A5568" }) }}>{compte[i]}</span>
              </button>
            );
          })}
        </nav>

        <CadreTableau className="in-up d2"
          barre={<>
            <ChampRecherche libelle="Rechercher une institution" placeholder="Rechercher par nom, sigle ou adresse…" valeur={q} onChange={(v) => filtrer(() => setQ(v))} />
            {TYPES.map(([label, v]) => <Pastille key={label} actif={v === type} onClick={() => filtrer(() => setType(v))}>{label}</Pastille>)}
          </>}
          pied={<Pagination page={page} pages={pages} onPage={(n) => { setPage(n); setSel({}); }} resume={total ? `${(page - 1) * TAILLE + 1}–${(page - 1) * TAILLE + rows.length} sur ${total} institutions` : "0 institution"} />}>
          {choisis.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", background: "#FAFAF9", borderBottom: "1px solid #E7E5E4", fontSize: "var(--t-sm)", flexWrap: "wrap" }}>
              <b style={{ fontWeight: 600 }}>{choisis.length} sélectionnée{choisis.length > 1 ? "s" : ""}</b>
              {estAdmin && <button type="button" onClick={exporterSelection} style={barreBtn}>Exporter la sélection</button>}
              {!statutLot && <button type="button" onClick={() => setStatutLot(true)} style={barreBtn}>Changer le statut</button>}
              {statutLot && Object.entries(STATUT_IMF_LONG).map(([k, l]) => <button key={k} type="button" onClick={() => changerStatut(k)} style={barreBtn}>{l}</button>)}
              <button type="button" onClick={() => { setSel({}); setStatutLot(false); }} style={{ ...barreBtn, marginLeft: "auto", border: "none", background: "transparent", color: "#4A5568" }}>Annuler</button>
            </div>
          )}
          <Tableau largeurMin={980}>
            <thead>
              <tr>
                <EnTete style={{ width: 18 }}><input type="checkbox" className="in-check" aria-label="Tout sélectionner" checked={allSel} onChange={() => setSel(allSel ? {} : Object.fromEntries(rows.map((r) => [r.id, true])))} /></EnTete>
                <EnTete>Institution</EnTete><EnTete>Type</EnTete><EnTete>Statut</EnTete><EnTete>Siège</EnTete><EnTete num>Points</EnTete><EnTete num>Dirigeants</EnTete><EnTete>Bailleurs</EnTete><EnTete><span className="sr-only">Actions</span></EnTete>
              </tr>
            </thead>
            <tbody>
              {!d.rows && <LignesChargement colonnes={9} lignes={TAILLE} />}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label=""><input type="checkbox" className="in-check" aria-label={`Sélectionner ${r.nom}`} checked={!!sel[r.id]} onChange={() => setSel({ ...sel, [r.id]: !sel[r.id] })} /></td>
                  <td className="principal"><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={pastilleImf}>{initiales(r.sigle || r.nom)}</span><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.nom}</div><span className="muet">{r.sigle ? `${r.sigle}${r.email ? " · " : ""}` : ""}{r.email || (r.sigle ? "" : "—")}</span></div></div></td>
                  <td data-label="Type" style={{ color: "#4A5568" }}>{TYPE_IMF_LONG[r.type_imf]}</td>
                  <td data-label="Statut"><Badge ton={TON_STATUT[r.statut_reglementaire]}>{STATUT_IMF_LONG[r.statut_reglementaire]}</Badge></td>
                  <td data-label="Siège"><div>{regionAffichee(r.region_siege) ?? "—"}</div>{!r.a_gps && <span className="muet">Sans coordonnées GPS</span>}</td>
                  <td data-label="Points" className="num">{r.nb_points_service}</td>
                  <td data-label="Dirigeants" className="num">{r.nb_dirigeants_en_fonction}</td>
                  <td data-label="Bailleurs" style={{ color: "#4A5568", fontSize: "var(--t-sm)" }}>{r.bailleurs_noms.length ? r.bailleurs_noms.join(", ") : "—"}</td>
                  <CelluleActions>
                    <Link className="tbl-icone" to={`/consultation?imf=${r.id}`} aria-label="Voir la fiche" title="Voir la fiche"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></Link>
                    <BoutonIcone libelle="Modifier" onClick={() => naviguer(`/imf/${r.id}/modifier`)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg></BoutonIcone>
                    {estAdmin && <BoutonIcone libelle="Archiver" onClick={() => archiver(r)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg></BoutonIcone>}
                  </CelluleActions>
                </tr>
              ))}
            </tbody>
          </Tableau>
          {d.rows && rows.length === 0 && <EtatVide titre="Aucune institution ne correspond">Essayez un autre mot-clé ou retirez un filtre.</EtatVide>}
        </CadreTableau>
      </main>
    </AppLayout>
  );
}
