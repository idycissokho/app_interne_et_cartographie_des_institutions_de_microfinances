/**
 * Écran 11 — Import et export (maquette-carto-imf/ecrans/11-import-export.dc.html).
 * Import : POST /importation/ (type_import + fichier), traitement synchrone côté API, rapport.
 */
import { useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";

import { api, telecharger } from "../api/client";
import type { Page } from "../api/types";
import { Erreur, Etapes, erreursChamps } from "../components/form";
import { AppLayout } from "../components/layout/AppLayout";
import { telechargerCsv } from "../lib/csv";
import { ilYa, nombre, pourcent } from "../lib/format";
import { useDonnees, type Compte } from "../lib/useDonnees";

type TypeImport = "IMF" | "POINTS_SERVICE" | "DIRIGEANTS";
interface Rapport { ligne: number | null; erreurs: Record<string, string>; valeurs?: Record<string, string> }
interface Importation { id: string; type_import: TypeImport; fichier: string; statut: string; nb_lignes_total: number; nb_lignes_importees: number; nb_lignes_erreur: number; taux_succes: number; rapport_erreurs: Rapport[]; utilisateur_email: string; date_creation: string }

const I: Record<TypeImport, string> = {
  IMF: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6",
  POINTS_SERVICE: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
  DIRIGEANTS: "M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.6 5.2",
};
const TY: [TypeImport, string, string][] = [["IMF", "Institutions", "Identité, statut, siège"], ["POINTS_SERVICE", "Points de service", "Agences, guichets, GPS"], ["DIRIGEANTS", "Dirigeants", "Dirigeants et mandats"]];
const LIB: Record<TypeImport, string> = { IMF: "Institutions", POINTS_SERVICE: "Points de service", DIRIGEANTS: "Dirigeants" };
const SB: Record<string, [string, string, string]> = { TERMINE: ["#DCFCE7", "#166534", "Terminé"], EN_COURS: ["#E0ECF7", "#1F4E79", "En cours"], ECHEC: ["#FDECEC", "#991B1B", "Échec"], EN_ATTENTE: ["#F1ECE0", "#4A5568", "En attente"] };
const seg = (on: boolean): CSSProperties => ({ border: "none", font: "inherit", fontSize: 14, fontWeight: 700, padding: "10px 18px", borderRadius: 10, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#F3D98C" } : { background: "transparent", color: "#4A5568" }) });
const btnS: CSSProperties = { height: 48, padding: "0 18px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 14, fontWeight: 700, color: "#0B1424", cursor: "pointer" };
const btnP: CSSProperties = { height: 48, padding: "0 22px", borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", cursor: "pointer", boxShadow: "0 10px 24px rgba(201,164,76,.35)" };
const tailleFichier = (o: number) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const extension = (nom: string) => (nom.split(".").pop() ?? "").toUpperCase();

export function Donnees() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("onglet") === "export" ? "export" : "import");
  const [step, setStep] = useState(1);
  const [type, setType] = useState<TypeImport>("POINTS_SERVICE");
  const [fichier, setFichier] = useState<File | null>(null);
  const [lignes, setLignes] = useState<number | null>(null);
  const [res, setRes] = useState<Importation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const { donnees: d } = useDonnees<{ hist: Page<Importation>; imf: Compte; pts: Compte; mandats: Compte }>({
    hist: "/importation/?page_size=5&ordering=-date_creation", imf: "/imf/?page_size=1", pts: "/points-service/?page_size=1", mandats: "/dirigeants/mandats/?page_size=1",
  }, [version]);

  function choisir(f: File | null) {
    setFichier(f); setErreur(null); setLignes(null);
    if (f && f.name.toLowerCase().endsWith(".csv")) f.text().then((t) => setLignes(Math.max(0, t.split(/\r?\n/).filter((l) => l.trim()).length - 1)));
  }
  async function lancer() {
    if (!fichier) { setErreur("Choisissez un fichier CSV ou Excel (.xlsx)."); return; }
    setStep(2); setErreur(null);
    const fd = new FormData();
    fd.append("type_import", type); fd.append("fichier", fichier);
    try {
      setRes(await api.post<Importation>("/importation/", fd));
      setStep(3); setVersion((v) => v + 1);
    } catch (e) {
      const er = erreursChamps(e);
      setErreur(er.fichier || er.type_import || er.__global || "L'import a échoué."); setStep(1);
    }
  }
  const reset = () => { setStep(1); setFichier(null); setRes(null); setLignes(null); setErreur(null); };
  const lignesErreur = (res?.rapport_erreurs ?? []).flatMap((r) => Object.entries(r.erreurs).map(([c, m]) => ({ l: r.ligne, c, v: r.valeurs?.[c] ?? "", m: typeof m === "string" ? m : JSON.stringify(m) })));
  const taux = res ? (res.nb_lignes_total ? (100 * res.nb_lignes_importees) / res.nb_lignes_total : 0) : 0;
  const exports: { id: string; t: TypeImport; label: string; count: string }[] = [
    { id: "ex-imf", t: "IMF", label: "Institutions", count: `${nombre(d.imf?.count ?? 0)} IMF` },
    { id: "ex-pts", t: "POINTS_SERVICE", label: "Points de service", count: `${nombre(d.pts?.count ?? 0)} points` },
    { id: "ex-dir", t: "DIRIGEANTS", label: "Dirigeants et mandats", count: `${nombre(d.mandats?.count ?? 0)} mandats` },
  ];

  return (
    <AppLayout active="import" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="ie-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Données</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Import et export</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Alimentez les référentiels depuis le canevas Excel standard, ou extrayez-les en CSV.</p>
          </div>
          <div role="tablist" aria-label="Import ou export" style={{ display: "flex", padding: 5, borderRadius: 14, background: "#FFFFFF", border: "1px solid #ECE5D5" }}>
            {([["import", "Importer"], ["export", "Exporter"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={seg(tab === k)}>{l}</button>)}
          </div>
        </header>

        {tab === "import" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <section className="ie-up d1" style={{ flex: "999 1 560px", minWidth: 0, borderRadius: 26, background: "#FFFFFF", border: "1px solid #ECE5D5", boxShadow: "0 24px 50px -30px rgba(11,20,36,.22)", overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #F1ECE0", background: "#FDFBF6" }}><Etapes etapes={["Type et fichier", "Traitement", "Rapport"]} courante={step} /></div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {step === 1 && (<>
                  <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    <legend style={{ fontSize: 13, fontWeight: 700, color: "#1A2333", marginBottom: 10 }}>Quel référentiel voulez-vous alimenter ? <span style={{ color: "#B08A1E" }}>*</span></legend>
                    <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12 }}>
                      {TY.map(([k, l, desc]) => {
                        const on = type === k;
                        return (
                          <button key={k} type="button" role="radio" aria-checked={on} className="ie-card" onClick={() => setType(k)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 16, borderRadius: 16, font: "inherit", color: "#0B1424", cursor: "pointer", textAlign: "left", ...(on ? { background: "#FDF8EA", border: "1.5px solid #C9A44C", boxShadow: "0 0 0 4px rgba(201,164,76,.14)" } : { background: "#FFFFFF", border: "1.5px solid #E2DCCD" }) }}>
                            <span style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", ...(on ? { background: "#0B1424", color: "#F3D98C" } : { background: "#F6F1E4", color: "#8A6A1F" }) }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I[k]} /></svg></span>
                            <b style={{ fontSize: 14 }}>{l}</b>
                            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="ie-drop" htmlFor="ie-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choisir(e.dataTransfer.files[0] ?? null); }} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "34px 20px", borderRadius: 20, border: "2px dashed #D3C9B2", background: "#FDFBF6", cursor: "pointer", textAlign: "center", transition: "border-color .15s ease, background .15s ease" }}>
                    <span style={{ width: 60, height: 60, borderRadius: 18, background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg></span>
                    <b style={{ fontSize: 16 }}>Glissez votre fichier ici</b>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>CSV ou Excel (.xlsx) · ou <span style={{ color: "#8A6A1F", fontWeight: 700 }}>parcourir</span></span>
                    <input id="ie-file" type="file" accept=".csv,.xlsx" onChange={(e) => choisir(e.target.files?.[0] ?? null)} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
                  </label>
                  {fichier && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid #ECE5D5" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#FFFFFF", background: extension(fichier.name) === "CSV" ? "#1F4E79" : "#15803D", padding: "4px 6px", borderRadius: 6 }}>{extension(fichier.name)}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{fichier.name} <span style={{ color: "#6B7280", fontWeight: 500 }}>· {tailleFichier(fichier.size)}{lignes !== null ? ` · ${nombre(lignes)} lignes` : ""}</span></span>
                      <button type="button" aria-label="Retirer le fichier" onClick={() => choisir(null)} style={{ border: "none", background: "transparent", color: "#6B7280", cursor: "pointer", fontSize: 18 }}>×</button>
                    </div>
                  )}
                  <Erreur>{erreur}</Erreur>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 14, background: "#F3ECDC", color: "#5B4A1E", fontSize: 13, flexWrap: "wrap" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M12 18v-6M9 15l3 3 3-3" /></svg><span style={{ flex: 1 }}>Utilisez le canevas standard pour éviter les erreurs de colonnes.</span><a href="#" onClick={(e) => { e.preventDefault(); telecharger(`/importation/modeles/${type}/`, `modele_${type.toLowerCase()}.csv`); }} style={{ fontWeight: 800, textDecoration: "none" }}>Télécharger le canevas</a></div>
                </>)}

                {step === 2 && (
                  <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 10px", textAlign: "center" }}>
                    <span style={{ width: 64, height: 64, borderRadius: 20, background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" /></path></svg></span>
                    <b style={{ fontSize: 18 }}>Traitement du fichier…</b>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>Lecture des lignes, contrôle des champs et géolocalisation.</span>
                    <div style={{ width: "100%", maxWidth: 420, height: 10, borderRadius: 99, background: "#F1ECE0", overflow: "hidden" }}><div className="ie-bar" style={{ height: "100%", width: "72%", borderRadius: 99, background: "linear-gradient(90deg, #C9A44C, #E9C76A)" }} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568" }}>{fichier?.name}{lignes !== null ? ` · ${nombre(lignes)} lignes` : ""}</span>
                  </div>
                )}

                {step === 3 && res && (<>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
                    <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 16, padding: 18, borderRadius: 18, background: "#0B1424", color: "#F4EFE3" }}>
                      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="8" /><circle cx="36" cy="36" r="30" fill="none" stroke="#C9A44C" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${((188.5 * taux) / 100).toFixed(1)} 188.5`} transform="rotate(-90 36 36)"><animate attributeName="stroke-dasharray" from="0 188.5" to={`${((188.5 * taux) / 100).toFixed(1)} 188.5`} dur="1.2s" fill="freeze" /></circle></svg>
                      <div><div style={{ fontSize: 30, fontWeight: 800, color: "#F3D98C" }}>{pourcent(taux, 1)}</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>Taux de succès</div></div>
                    </div>
                    <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 18, background: "#FAF7F0" }}><div style={{ fontSize: 28, fontWeight: 800 }}>{nombre(res.nb_lignes_total)}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>Lignes lues</div></div>
                    <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 18, background: "#F0FAF3" }}><div style={{ fontSize: 28, fontWeight: 800, color: "#15803D" }}>{nombre(res.nb_lignes_importees)}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>Importées</div></div>
                    <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 18, background: "#FDF1F1" }}><div style={{ fontSize: 28, fontWeight: 800, color: "#B91C1C" }}>{nombre(res.nb_lignes_erreur)}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>En erreur</div></div>
                  </div>
                  {lignesErreur.length > 0 && (
                    <div style={{ borderRadius: 18, border: "1px solid #ECE5D5", overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 16px", background: "#FDFBF6", borderBottom: "1px solid #F1ECE0" }}><b style={{ fontSize: 15 }}>Rapport d'erreurs</b><a href="#" onClick={(e) => { e.preventDefault(); telechargerCsv(`rapport_import_${res.id.slice(0, 8)}.csv`, [["Ligne", "Champ", "Valeur", "Problème"], ...lignesErreur.map((x) => [x.l ?? "", x.c, x.v, x.m])]); }} style={{ fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Télécharger le rapport (CSV)</a></div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 13 }}>
                          <thead><tr style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280" }}><th style={{ padding: "10px 16px" }}>Ligne</th><th style={{ padding: "10px 8px" }}>Champ</th><th style={{ padding: "10px 8px" }}>Valeur</th><th style={{ padding: "10px 16px" }}>Problème</th></tr></thead>
                          <tbody>
                            {lignesErreur.map((x, i) => (
                              <tr key={i} style={{ borderTop: "1px solid #F6F1E4" }}><td style={{ padding: "11px 16px", fontWeight: 800 }}>{x.l ?? "—"}</td><td style={{ padding: "11px 8px" }}><code style={{ fontSize: 12, background: "#F6F1E4", padding: "3px 7px", borderRadius: 6, color: "#6E5416" }}>{x.c}</code></td><td style={{ padding: "11px 8px", color: "#B91C1C", fontWeight: 600 }}>{x.v || "—"}</td><td style={{ padding: "11px 16px", color: "#4A5568" }}>{x.m}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>)}
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #F1ECE0", display: "flex", justifyContent: "space-between", gap: 10, background: "#FDFBF6" }}>
                <button type="button" disabled={step === 2} onClick={step === 1 ? reset : () => setStep(1)} style={btnS}>{step === 1 ? "Annuler" : "Retour"}</button>
                <button type="button" className="ie-primary" disabled={step === 2} onClick={step === 1 ? lancer : reset} style={btnP}>{step === 1 ? "Lancer l’import" : step === 2 ? "Voir le rapport" : "Nouvel import"}</button>
              </div>
            </section>

            <aside className="ie-up d2" style={{ flex: "1 1 300px", maxWidth: 380, minWidth: 0, borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={{ margin: "0 0 10px 0", fontSize: 17, fontWeight: 800 }}>Derniers imports</h2>
              {(d.hist?.results ?? []).map((h) => {
                const c = SB[h.statut] ?? SB.EN_ATTENTE;
                return (
                  <div key={h.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 4px", borderBottom: "1px solid #F6F1E4" }}>
                    <span style={{ width: 38, height: 38, flex: "none", borderRadius: 12, background: "#F6F1E4", color: "#8A6A1F", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{extension(h.fichier)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{LIB[h.type_import]}</div><div style={{ fontSize: 12, color: "#6B7280", overflowWrap: "anywhere" }}>{h.utilisateur_email} · {ilYa(h.date_creation)}</div></div>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", background: c[0], color: c[1] }}>{c[2]}</span>
                  </div>
                );
              })}
              {d.hist && d.hist.results.length === 0 && <span style={{ fontSize: 13, color: "#6B7280" }}>Aucun import pour le moment.</span>}
            </aside>
          </div>
        )}

        {tab === "export" && (
          <section className="ie-up d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
            {exports.map((x) => (
              <article key={x.id} style={{ borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 48, height: 48, flex: "none", borderRadius: 15, background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I[x.t]} /></svg></span><div><h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{x.label}</h2><div style={{ fontSize: 13, color: "#6B7280" }}>{x.count}</div></div></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><label htmlFor={x.id} style={{ fontSize: 12, fontWeight: 700, color: "#4A5568" }}>Périmètre</label><select id={x.id} disabled title="L'export porte sur tout le référentiel (filtre par région non disponible côté API)." style={{ height: 44, borderRadius: 12, border: "1.5px solid #E2DCCD", background: "#FFFFFF", padding: "0 12px", font: "inherit", fontSize: 14, color: "#0B1424" }}><option>Toutes les régions</option></select></div>
                <label title="L'export ne contient que les éléments actifs." style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#4A5568", opacity: 0.6 }}><input type="checkbox" disabled style={{ width: 18, height: 18, accentColor: "#C9A44C" }} /> Inclure les éléments archivés</label>
                <button type="button" className="ie-primary" onClick={() => telecharger(`/importation/export/${x.t}/`, `export_${x.t.toLowerCase()}.csv`)} style={{ marginTop: "auto", height: 46, borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Exporter en CSV</button>
              </article>
            ))}
          </section>
        )}
      </main>
    </AppLayout>
  );
}
