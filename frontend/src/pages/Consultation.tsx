/**
 * Écran 06 — Espace consultation : annuaire + fiche IMF en lecture seule
 * (maquette-carto-imf/ecrans/06-espace-consultation.dc.html).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SenegalMap } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge, PAR_PAGE, Pagination, TON_STATUT } from "../components/tableau/Tableau";
import { CODE_FONCTION, nombre } from "../lib/format";
import {
  FAMILLE_FONCTION, LIBELLE_FONCTION, STATUT_IMF_COURT, STATUT_MANDAT, STATUT_POINT, TYPE_IMF_COURT, TYPE_POINT,
  avancementMandat, initiales, regionAffichee,
} from "../lib/metier";
import { statsParRegion, type AgregatZone, URL_IMF_OPTIONS, URL_REGIONS } from "../lib/stats";
import { useDonnees } from "../lib/useDonnees";

interface ImfLigne { id: string; nom: string; sigle: string; type_imf: string; statut_reglementaire: string; region_siege: string | null; nb_points_service: number }
const VIDE: ImfLigne[] = [];
interface ImfFiche extends ImfLigne { adresse_siege: string; telephone: string; email: string; site_web: string; nb_regions_couvertes: number; nb_dirigeants_en_fonction: number; nb_membres_total: number | null; numero_agrement: string; type_sfd: string; affiliation: string; forme_juridique: string; annee_creation: number | null; ninea: string; capital: string | null; nb_beneficiaires: number | null; situation: string; nb_membres_ca: number | null; nb_membres_cs: number | null; nb_membres_cc: number | null; url_fiche: string; bailleurs_detail: { id: string; nom: string; sigle: string }[]; localisation_siege: unknown }
interface PointLigne { id: string; nom: string; type_point: string; statut_point: string; region_nom: string | null }
interface MandatLigne { id: string; dirigeant_nom_complet: string; fonction_mandat: string; statut_mandat: string; date_debut: string; date_fin: string | null; fichier_justificatif: string | null; documents_justificatifs: string }

const chip = (on: boolean): CSSProperties => ({ font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#FFFFFF", border: "1px solid #0B1424" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #E7E5E4" }) });
const kpi: CSSProperties = { padding: 16, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" };
const ligne: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #F0EFED" };
const TABS = [{ k: "apercu", label: "Aperçu" }, { k: "pts", label: "Points de service" }, { k: "dir", label: "Dirigeants" }, { k: "bail", label: "Bailleurs" }] as const;
const CHIPS: [string, string][] = [["", "Toutes"], ["MUTUELLE", "Mutuelle"], ["COOPERATIVE", "Coopérative"], ["SA", "SA"], ["ASSOCIATION", "Association"]];
const DCHIPS = ["Tous", "Gouvernance", "Direction", "Comités", "Contrôle"];

export function Consultation() {
  // Bouton « Itinéraire » : mêmes rôles que la section (SUPERVISEUR, ADMIN).
  const { peutModifier } = useAuth();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState("");
  const [sel, setSel] = useState<string | null>(params.get("imf"));
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("apercu");
  const [dchip, setDchip] = useState("Tous");
  // Listes paginées par 6 (annuaire, points de service et dirigeants de la fiche).
  const [pageListe, setPageListe] = useState(1);
  const [pagePts, setPagePts] = useState(1);
  const [pageDirs, setPageDirs] = useState(1);
  useEffect(() => { setPageListe(1); }, [q, type]);
  useEffect(() => { setPagePts(1); setPageDirs(1); }, [sel, dchip]);

  const { donnees: l } = useDonnees<{ imfs: ImfLigne[]; zones: AgregatZone[] }>({ imfs: URL_IMF_OPTIONS, zones: URL_REGIONS });
  const imfs = l.imfs ?? VIDE;
  useEffect(() => { if (!sel && imfs.length) setSel(imfs[0].id); }, [imfs, sel]);

  const { donnees: f } = useDonnees<{ fiche: ImfFiche; pts: Page<PointLigne>; dirs: Page<MandatLigne> }>({
    fiche: sel ? `/imf/${sel}/` : null,
    pts: sel && tab === "pts" ? `/points-service/?imf=${sel}&page_size=1000&ordering=nom` : null,
    dirs: sel && tab === "dir" ? `/imf/${sel}/mandats/?page_size=1000` : null,
  });

  const qq = q.toLowerCase();
  const list = imfs.filter((m) => (!type || m.type_imf === type) && (!qq || `${m.nom} ${m.sigle} ${m.region_siege ?? ""} ${TYPE_IMF_COURT[m.type_imf]}`.toLowerCase().includes(qq)));
  const cur = f.fiche && f.fiche.id === sel ? f.fiche : null;
  // Pastille : sigle court (5 lettres au plus) sinon initiales, pour rester lisible dans le carré.
  const court = (m: ImfLigne) => { const s = (m.sigle || "").trim().split(/\s+/)[0]; return s && s.length <= 5 ? s : initiales(m.nom); };
  const dirs = (f.dirs?.results ?? []).filter((d) => dchip === "Tous" || FAMILLE_FONCTION[d.fonction_mandat] === dchip);
  const tranche = <T,>(liste: T[], page: number) => liste.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
  const nbPages = (n: number) => Math.max(1, Math.ceil(n / PAR_PAGE));
  const pts = f.pts?.results ?? [];

  return (
    <AppLayout active="consultation" minHeight={1300}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 48px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22 }}>
        <header className="co-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Consultation</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Annuaire des institutions</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Consultez les fiches IMF, leurs points de service et leurs dirigeants.</p>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", fontWeight: 500, color: "#4A5568", border: "1px solid #E7E5E4", padding: "8px 12px", borderRadius: 8 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>Accès en lecture seule</span>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <section className="co-in d1" style={{ flex: "1 1 320px", maxWidth: 400, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="co-search" style={{ display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 16px", borderRadius: 12, background: "#FFFFFF", border: "1.5px solid #E7E5E4", color: "#6B7280", boxSizing: "border-box" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" aria-label="Rechercher une IMF" placeholder="Nom, sigle ou région…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: "var(--t-md)", flex: 1, minWidth: 0, color: "#0B1424" }} />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CHIPS.map(([v, label]) => <button key={label} type="button" aria-pressed={v === type} onClick={() => setType(v)} style={chip(v === type)}>{label}</button>)}
            </div>
            <div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280", padding: "4px 4px 0 4px" }}>{list.length} institution{list.length > 1 ? "s" : ""}</div>
            {tranche(list, pageListe).map((m) => {
              const on = m.id === sel;
              return (
                <button key={m.id} type="button" className="co-item" aria-pressed={on} onClick={() => { setSel(m.id); setDchip("Tous"); if (window.innerWidth < 900) document.querySelector(".co-fiche")?.scrollIntoView({ behavior: "smooth" }); }} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", font: "inherit", color: "#0B1424", padding: 14, borderRadius: 12, cursor: "pointer", ...(on ? { background: "#FFFFFF", border: "1.5px solid #C9A44C" } : { background: "#FFFFFF", border: "1px solid #E7E5E4" }) }}>
                  <span style={{ width: 46, height: 46, flex: "none", borderRadius: 10, background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-sm)", fontWeight: 700 }}>{court(m)}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: "var(--t-base)", fontWeight: 700 }}>{m.nom}</span>
                    <span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{TYPE_IMF_COURT[m.type_imf]} · {regionAffichee(m.region_siege) ?? "Région non renseignée"}</span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Badge ton={TON_STATUT[m.statut_reglementaire]}>{STATUT_IMF_COURT[m.statut_reglementaire]}</Badge>
                    <span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}><b style={{ color: "#0B1424" }}>{m.nb_points_service}</b> points</span>
                  </span>
                </button>
              );
            })}
            {list.length > PAR_PAGE && <div className="liste-pied"><Pagination page={pageListe} pages={nbPages(list.length)} onPage={setPageListe} resume={`${(pageListe - 1) * PAR_PAGE + 1}–${Math.min(pageListe * PAR_PAGE, list.length)} sur ${list.length}`} /></div>}
          </section>

          <section className="co-in d2 co-fiche" style={{ flex: "999 1 520px", minWidth: 0, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", overflow: "hidden" }}>
            {cur && (<>
              <div style={{ position: "relative", padding: "26px 26px 0 26px", background: "#FFFFFF", borderBottom: "1px solid #E7E5E4" }}>
                <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ width: 64, height: 64, borderRadius: 12, background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-base)", fontWeight: 600 }}>{court(cur)}</span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}><Badge ton={TON_STATUT[cur.statut_reglementaire]}>{STATUT_IMF_COURT[cur.statut_reglementaire]}</Badge><Badge point={false}>{TYPE_IMF_COURT[cur.type_imf]}</Badge></div>
                    <div style={{ fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>{cur.nom}</div>
                    <div style={{ fontSize: "var(--t-sm)", color: "#6B7280", marginTop: 2 }}>Siège : {cur.adresse_siege}{cur.region_siege ? `, ${regionAffichee(cur.region_siege)}` : ""}</div>
                  </div>
                  {peutModifier && cur.localisation_siege != null && <Link to={`/itineraire?type=institution&id=${cur.id}`} style={{ height: 44, padding: "0 16px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", fontSize: "var(--t-sm)", fontWeight: 600, color: "#0B1424", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M18 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" /></svg>Itinéraire</Link>}
                  <button type="button" onClick={() => window.print()} style={{ height: 44, padding: "0 16px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Fiche PDF</button>
                </div>
                <div role="tablist" aria-label="Sections de la fiche IMF" style={{ position: "relative", display: "flex", gap: 4, marginTop: 22, flexWrap: "wrap" }}>
                  {TABS.map((t) => (
                    <button key={t.k} type="button" role="tab" aria-selected={t.k === tab} onClick={() => setTab(t.k)} style={{ border: "none", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, padding: "12px 4px", marginRight: 18, marginBottom: -1, background: "transparent", cursor: "pointer", ...(t.k === tab ? { color: "#0B1424", boxShadow: "inset 0 -2px 0 #C9A44C" } : { color: "#6B7280" }) }}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "24px 26px 28px 26px" }}>
                {tab === "apercu" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                    <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                        <div style={kpi}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700 }}>{cur.nb_points_service}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280", fontWeight: 500 }}>Points de service</div></div>
                        <div style={kpi}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700 }}>{cur.nb_regions_couvertes}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280", fontWeight: 500 }}>Régions couvertes</div></div>
                        <div style={kpi}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700 }}>{cur.nb_dirigeants_en_fonction}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280", fontWeight: 500 }}>Dirigeants en fonction</div></div>
                        <div style={kpi}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700 }}>{cur.nb_membres_total != null ? nombre(cur.nb_membres_total) : "—"}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280", fontWeight: 500 }}>Membres</div></div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--t-md)" }}>
                        <div style={ligne}><span style={{ color: "#6B7280" }}>Sigle</span><b>{cur.sigle || "—"}</b></div>
                        <div style={ligne}><span style={{ color: "#6B7280" }}>Téléphone</span><b>{cur.telephone || "—"}</b></div>
                        <div style={ligne}><span style={{ color: "#6B7280" }}>Email</span><b style={{ overflowWrap: "anywhere" }}>{cur.email || "—"}</b></div>
                        {/* Informations de l'annuaire DRS-SFD : affichées seulement si elles sont renseignées. */}
                        {([
                          ["N° d'agrément", cur.numero_agrement],
                          ["Type de SFD", cur.type_sfd],
                          ["Affiliation", cur.affiliation],
                          ["Forme juridique", cur.forme_juridique],
                          ["Année de création", cur.annee_creation],
                          ["NINEA", cur.ninea],
                          ["Capital", cur.capital != null ? `${nombre(Number(cur.capital))} FCFA` : ""],
                          ["Bénéficiaires", cur.nb_beneficiaires != null ? nombre(cur.nb_beneficiaires) : ""],
                          ["Situation", cur.situation],
                          ["Membres CA / CS / CC", [cur.nb_membres_ca, cur.nb_membres_cs, cur.nb_membres_cc].some((n) => n != null) ? [cur.nb_membres_ca, cur.nb_membres_cs, cur.nb_membres_cc].map((n) => n ?? "—").join(" / ") : ""],
                        ] as [string, string | number | null][]).filter(([, v]) => v !== "" && v != null).map(([libelle, v]) => (
                          <div key={libelle} style={ligne}><span style={{ color: "#6B7280" }}>{libelle}</span><b style={{ overflowWrap: "anywhere", textAlign: "right" }}>{v}</b></div>
                        ))}
                        <div style={{ ...ligne, borderBottom: "none" }}><span style={{ color: "#6B7280" }}>Site web</span>{cur.site_web ? <a href={cur.site_web} target="_blank" rel="noreferrer" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{cur.site_web.replace(/^https?:\/\//, "")}</a> : <b>—</b>}</div>
                      </div>
                    </div>
                    <div style={{ flex: "1 1 280px", minWidth: 0, height: 320, borderRadius: 12, border: "1px solid #E7E5E4", overflow: "hidden", boxSizing: "border-box" }}>
                      <SenegalMap theme="light" fillMode="muted" stats={statsParRegion(l.zones)} selected={regionAffichee(cur.region_siege) ?? ""} flow showLabels={false} rayon={15} />
                    </div>
                  </div>
                )}

                {tab === "dir" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DCHIPS.map((c) => <button key={c} type="button" aria-pressed={c === dchip} onClick={() => setDchip(c)} style={chip(c === dchip)}>{c}</button>)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 12 }}>
                      {tranche(dirs, pageDirs).map((d) => {
                        const av = avancementMandat(d.date_debut, d.date_fin);
                        const lien = d.fichier_justificatif || d.documents_justificatifs;
                        return (
                          <div key={d.id} style={{ padding: 16, borderRadius: 12, border: "1px solid #E7E5E4", background: "#FFFFFF", display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ width: 44, height: 44, flex: "none", borderRadius: 8, background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-xs)", fontWeight: 700 }}>{CODE_FONCTION[d.fonction_mandat]}</span>
                              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: "var(--t-md)", fontWeight: 700 }}>{d.dirigeant_nom_complet}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{LIBELLE_FONCTION[d.fonction_mandat]}</div></div>
                              <Badge ton={TON_STATUT[d.statut_mandat]}>{STATUT_MANDAT[d.statut_mandat]}</Badge>
                            </div>
                            <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-2xs)", color: "#6B7280", marginBottom: 5 }}><span>Mandat {d.date_debut.slice(0, 4)}</span><span>{d.date_fin ? d.date_fin.slice(0, 4) : "[à définir]"}</span></div><div style={{ height: 6, borderRadius: 99, background: "#E7E5E4", overflow: "hidden" }}><div className="co-bar" style={{ height: "100%", borderRadius: 99, background: av.color, width: `${av.prog}%` }} /></div></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-xs)", color: "#8A6A1F", fontWeight: 600 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6" /></svg>
                              {lien ? <a href={lien} target="_blank" rel="noreferrer" style={{ color: "#8A6A1F" }}>Justificatif</a> : <span style={{ color: "#6B7280" }}>Aucun justificatif</span>}
                            </div>
                          </div>
                        );
                      })}
                      {f.dirs && dirs.length === 0 && <div style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>Aucun dirigeant pour ce filtre.</div>}
                    </div>
                    {dirs.length > PAR_PAGE && <div className="liste-pied"><Pagination page={pageDirs} pages={nbPages(dirs.length)} onPage={setPageDirs} resume={`${(pageDirs - 1) * PAR_PAGE + 1}–${Math.min(pageDirs * PAR_PAGE, dirs.length)} sur ${dirs.length} mandats`} /></div>}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "#F5F5F4", color: "#5B4A1E", fontSize: "var(--t-sm)" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>Votre consultation de cette fiche est enregistrée dans le journal d'audit.</div>
                  </div>
                )}

                {tab === "pts" && (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 520 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1fr 0.8fr", gap: 12, padding: "0 10px 10px 10px", fontSize: "var(--t-xs)", fontWeight: 500, color: "#6B7280", borderBottom: "1px solid #F0EFED" }}><span>Point</span><span>Type</span><span>Région</span><span>Statut</span></div>
                      {tranche(pts, pagePts).map((p) => (
                        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1fr 0.8fr", gap: 12, alignItems: "center", padding: "12px 10px", borderBottom: "1px solid #F5F5F4", fontSize: "var(--t-sm)" }}><b>{p.nom}</b><span>{TYPE_POINT[p.type_point]}</span><span style={{ color: "#4A5568" }}>{regionAffichee(p.region_nom) ?? "—"}</span><span style={{ justifySelf: "start" }}><Badge ton={TON_STATUT[p.statut_point]}>{STATUT_POINT[p.statut_point]}</Badge></span></div>
                      ))}
                      {f.pts && f.pts.results.length === 0 && <div style={{ fontSize: "var(--t-sm)", color: "#6B7280", padding: "12px 10px" }}>Aucun point de service.</div>}
                    </div>
                    {pts.length > PAR_PAGE && <div className="liste-pied"><Pagination page={pagePts} pages={nbPages(pts.length)} onPage={setPagePts} resume={`${(pagePts - 1) * PAR_PAGE + 1}–${Math.min(pagePts * PAR_PAGE, pts.length)} sur ${pts.length} points`} /></div>}
                  </div>
                )}

                {tab === "bail" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
                    {cur.bailleurs_detail.map((b) => (
                      <div key={b.id} style={{ padding: 18, borderRadius: 12, border: "1px solid #E7E5E4" }}><div style={{ fontSize: "var(--t-base)", fontWeight: 700 }}>{b.sigle || b.nom}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280", marginTop: 4 }}>{b.sigle && b.sigle !== b.nom ? b.nom : "Bailleur associé"}</div></div>
                    ))}
                    <div style={{ padding: 18, borderRadius: 12, border: "1.5px dashed #D6D3D1", color: "#6B7280", fontSize: "var(--t-sm)", display: "flex", alignItems: "center" }}>Les bailleurs associés sont optionnels (V1).</div>
                  </div>
                )}
              </div>
            </>)}
          </section>
        </div>
      </main>
    </AppLayout>
  );
}
