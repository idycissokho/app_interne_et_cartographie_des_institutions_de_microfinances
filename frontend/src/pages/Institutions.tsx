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
import { SB, STATUT_IMF_LONG, TYPE_IMF_LONG, initiales, regionAffichee, tonIMF } from "../lib/metier";
import { useDonnees, type Compte } from "../lib/useDonnees";

interface Ligne {
  id: string; nom: string; sigle: string; type_imf: string; statut_reglementaire: string; email: string;
  region_siege: string | null; a_gps: boolean; nb_points_service: number; nb_dirigeants_en_fonction: number; bailleurs_noms: string[];
}

const TABMAP: [string, string][] = [["Toutes", ""], ["Agréées", "AGREE"], ["En cours", "EN_COURS"], ["Radiées", "RADIEE"]];
const TYPES: [string, string][] = [["Tous", ""], ["Mutuelle", "MUTUELLE"], ["Coopérative", "COOPERATIVE"], ["Société Anonyme", "SA"], ["Association", "ASSOCIATION"]];
const TAILLE = 20;
const chip = (on: boolean): CSSProperties => ({ height: 44, font: "inherit", fontSize: 13, fontWeight: 700, padding: "0 14px", borderRadius: 12, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#F3D98C", border: "1px solid #0B1424" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #ECE5D5" }) });
const barreBtn: CSSProperties = { height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "#F4EFE3", font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const pageBtn = (on = false): CSSProperties => ({ width: 36, height: 36, borderRadius: 10, font: "inherit", cursor: "pointer", ...(on ? { border: "none", background: "#0B1424", color: "#F3D98C", fontWeight: 800 } : { border: "1px solid #ECE5D5", background: "#FFFFFF", color: "#0B1424", fontWeight: 700 }) });
const th: CSSProperties = { padding: "12px 8px" };
const td: CSSProperties = { padding: "14px 8px" };

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
      t1: `/imf/${qs({ ...base, statut_reglementaire: "AGREE", page_size: 1 })}`,
      t2: `/imf/${qs({ ...base, statut_reglementaire: "EN_COURS", page_size: 1 })}`,
      t3: `/imf/${qs({ ...base, statut_reglementaire: "RADIEE", page_size: 1 })}`,
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
  const numeros = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2 || n === 1 || n === pages);

  return (
    <AppLayout active="imf" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="in-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Référentiels</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Institutions de microfinance</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Le référentiel réglementaire des IMF : identité, statut, siège et bailleurs.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {estAdmin && <Link to="/donnees" style={{ height: 46, padding: "0 16px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", fontSize: 14, fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>Importer</Link>}
            {estAdmin && <button type="button" onClick={() => telecharger("/importation/export/IMF/", "export_imf.csv")} style={{ height: 46, padding: "0 16px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 14, fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Exporter CSV</button>}
            {estAdmin && <Link to="/imf/nouveau" style={{ height: 46, padding: "0 18px", borderRadius: 14, background: "#C9A44C", fontSize: 14, fontWeight: 800, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", boxShadow: "0 10px 24px rgba(201,164,76,.35)", boxSizing: "border-box" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouvelle IMF</Link>}
          </div>
        </header>

        <nav className="in-up d1" aria-label="Filtrer par statut réglementaire" style={{ display: "flex", gap: 6, borderBottom: "1px solid #ECE5D5", flexWrap: "wrap" }}>
          {TABMAP.map(([label, v], i) => {
            const on = v === tab;
            return (
              <button key={label} type="button" aria-pressed={on} onClick={() => filtrer(() => setTab(v))} style={{ border: "none", background: "transparent", font: "inherit", fontSize: 14, fontWeight: 700, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: -1, ...(on ? { color: "#0B1424", boxShadow: "inset 0 -2px 0 #C9A44C" } : { color: "#6B7280" }) }}>
                {label} <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, ...(on ? { background: "#C9A44C", color: "#0B1424" } : { background: "#F1ECE0", color: "#4A5568" }) }}>{compte[i]}</span>
              </button>
            );
          })}
        </nav>

        <section className="in-up d2" style={{ borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", boxShadow: "0 24px 50px -30px rgba(11,20,36,.22)", overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "16px 18px", borderBottom: "1px solid #F1ECE0" }}>
            <label className="in-search" style={{ flex: "1 1 280px", display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 14px", borderRadius: 12, border: "1.5px solid #ECE5D5", background: "#FFFFFF", color: "#6B7280", boxSizing: "border-box" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" aria-label="Rechercher une institution" placeholder="Rechercher par nom, sigle ou adresse…" value={q} onChange={(e) => filtrer(() => setQ(e.target.value))} style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 14, flex: 1, minWidth: 0, color: "#0B1424" }} />
            </label>
            {TYPES.map(([label, v]) => <button key={label} type="button" aria-pressed={v === type} onClick={() => filtrer(() => setType(v))} style={chip(v === type)}>{label}</button>)}
          </div>

          {choisis.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "#0B1424", color: "#F4EFE3", fontSize: 13, flexWrap: "wrap" }}>
              <b style={{ color: "#F3D98C" }}>{choisis.length} sélectionnée(s)</b>
              {estAdmin && <button type="button" onClick={exporterSelection} style={barreBtn}>Exporter la sélection</button>}
              {!statutLot && <button type="button" onClick={() => setStatutLot(true)} style={barreBtn}>Changer le statut</button>}
              {statutLot && Object.entries(STATUT_IMF_LONG).map(([k, l]) => <button key={k} type="button" onClick={() => changerStatut(k)} style={{ ...barreBtn, borderColor: "rgba(243,217,140,.55)", color: "#F3D98C" }}>{l}</button>)}
              <button type="button" onClick={() => { setSel({}); setStatutLot(false); }} style={{ marginLeft: "auto", height: 32, padding: "0 12px", borderRadius: 9, border: "none", background: "rgba(255,255,255,.08)", color: "#F4EFE3", font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Annuler</button>
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280", background: "#FDFBF6" }}>
                  <th style={{ padding: "12px 18px", width: 18 }}><input type="checkbox" className="in-check" aria-label="Tout sélectionner" checked={allSel} onChange={() => setSel(allSel ? {} : Object.fromEntries(rows.map((r) => [r.id, true])))} /></th>
                  <th style={th}>Institution</th><th style={th}>Type</th><th style={th}>Statut</th><th style={th}>Siège</th><th style={{ ...th, textAlign: "right" }}>Points</th><th style={{ ...th, textAlign: "right" }}>Dirigeants</th><th style={th}>Bailleurs</th><th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = SB[r.statut_reglementaire];
                  return (
                    <tr key={r.id} className="in-row" style={{ borderTop: "1px solid #F6F1E4" }}>
                      <td style={{ padding: "14px 18px" }}><input type="checkbox" className="in-check" aria-label={`Sélectionner ${r.nom}`} checked={!!sel[r.id]} onChange={() => setSel({ ...sel, [r.id]: !sel[r.id] })} /></td>
                      <td style={td}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 40, height: 40, flex: "none", borderRadius: 12, background: tonIMF(r.region_siege, r.id), color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{r.sigle || initiales(r.nom)}</span><div><div style={{ fontWeight: 800 }}>{r.nom}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{r.email || "—"}</div></div></div></td>
                      <td style={{ ...td, color: "#1A2333", fontWeight: 600 }}>{TYPE_IMF_LONG[r.type_imf]}</td>
                      <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap", background: c[0], color: c[1] }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{STATUT_IMF_LONG[r.statut_reglementaire]}</span></td>
                      <td style={td}><div style={{ fontWeight: 600 }}>{regionAffichee(r.region_siege) ?? "—"}</div><div style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>{r.a_gps ? <span style={{ color: "#15803D", fontWeight: 700 }}>● GPS</span> : <span style={{ color: "#B45309", fontWeight: 700 }}>○ sans GPS</span>}</div></td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{r.nb_points_service}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{r.nb_dirigeants_en_fonction}</td>
                      <td style={td}><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{r.bailleurs_noms.map((b) => <span key={b} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 7, background: "#F3ECDC", color: "#6E5416" }}>{b}</span>)}</div></td>
                      <td style={{ padding: "14px 18px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link className="in-icon" to={`/consultation?imf=${r.id}`} aria-label="Voir la fiche" title="Voir la fiche"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></Link>
                        <button type="button" className="in-icon" onClick={() => naviguer(`/imf/${r.id}/modifier`)} aria-label="Modifier" title="Modifier"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg></button>
                        {estAdmin && <button type="button" className="in-icon" onClick={() => archiver(r)} aria-label="Archiver" title="Archiver"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {d.rows && rows.length === 0 && (
            <div style={{ padding: "48px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <span style={{ width: 56, height: 56, borderRadius: 18, background: "#F3ECDC", color: "#8A6A1F", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></span>
              <b style={{ fontSize: 16 }}>Aucune institution ne correspond</b>
              <span style={{ fontSize: 13, color: "#6B7280" }}>Essayez un autre mot-clé ou retirez un filtre.</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 18px", borderTop: "1px solid #F1ECE0", fontSize: 13, color: "#4A5568" }}>
            <span>{total ? `${(page - 1) * TAILLE + 1}–${(page - 1) * TAILLE + rows.length} sur ${total} institutions affichées` : "0 institution"}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" aria-label="Page précédente" disabled={page <= 1} onClick={() => { setPage(page - 1); setSel({}); }} style={{ ...pageBtn(), color: "#4A5568", fontWeight: 400 }}>‹</button>
              {numeros.map((n) => <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => { setPage(n); setSel({}); }} style={pageBtn(n === page)}>{n}</button>)}
              <button type="button" aria-label="Page suivante" disabled={page >= pages} onClick={() => { setPage(page + 1); setSel({}); }} style={{ ...pageBtn(), color: "#4A5568", fontWeight: 400 }}>›</button>
            </div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
