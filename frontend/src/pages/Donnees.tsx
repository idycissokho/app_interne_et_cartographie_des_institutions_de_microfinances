/**
 * Écran 11 — Import et export (maquette-carto-imf/ecrans/11-import-export.dc.html).
 * Import : POST /importation/ (type_import + fichier) ; le serveur répond aussitôt et traite le
 * fichier en tâche de fond. L'écran suit la progression (GET /importation/<id>/), puis affiche le rapport.
 * L'import suivi est mémorisé (sessionStorage) : en quittant puis en revenant sur la page, on retrouve
 * la même progression, puis le même rapport jusqu'à « Nouvel import ».
 * Le rapport distingue les lignes nouvelles, celles déjà en base (mises à jour) et les doublons du fichier.
 * Export : tout le référentiel, ou une seule région.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";

import { cacheRequetes } from "../api/cache";
import { api, qs } from "../api/client";
import { exporter, exporterCsv } from "../lib/exporter";
import { notifier } from "../lib/notifier";
import { memoireImport, notificationImport } from "../lib/suiviImport";
import type { Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Erreur, Etapes, erreursChamps } from "../components/form";
import { AppLayout } from "../components/layout/AppLayout";
import { CadreTableau, EnTete, PAR_PAGE, Pagination, Tableau } from "../components/tableau/Tableau";
import { ilYa, nombre, pluriel, pourcent } from "../lib/format";
import { URL_REGIONS, URL_STATISTIQUES, type AgregatZone, type Statistiques } from "../lib/stats";
import { useDonnees } from "../lib/useDonnees";

type TypeImport = "IMF" | "POINTS_SERVICE" | "DIRIGEANTS";
interface Rapport { ligne: number | null; erreurs: Record<string, string>; valeurs?: Record<string, string> }
// fichier : null quand le fichier d'origine a été effacé (démonstration : anonymisation des dirigeants).
/** Ligne désignant un enregistrement déjà en base (« base ») ou déjà vu plus haut dans le fichier (« fichier »). */
interface Doublon { ligne: number; libelle: string; nature: "base" | "fichier"; ligne_precedente?: number }
interface Importation { id: string; type_import: TypeImport; fichier: string | null; statut: string; nb_lignes_total: number; nb_lignes_importees: number; nb_lignes_erreur: number; nb_lignes_creees?: number; nb_lignes_mises_a_jour?: number; doublons?: Doublon[]; taux_succes: number; rapport_erreurs: Rapport[]; utilisateur_email: string; date_creation: string }

const I: Record<TypeImport, string> = {
  IMF: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6",
  POINTS_SERVICE: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
  DIRIGEANTS: "M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.6 5.2",
};
const TY: [TypeImport, string, string][] = [["IMF", "Institutions", "Liste officielle : IMF, sièges, dirigeants"], ["POINTS_SERVICE", "Points de service", "Agences, guichets, GPS"], ["DIRIGEANTS", "Dirigeants", "Dirigeants et mandats"]];
const LIB: Record<TypeImport, string> = { IMF: "Institutions", POINTS_SERVICE: "Points de service", DIRIGEANTS: "Dirigeants" };
const SB: Record<string, [string, string, string]> = { TERMINE: ["#DCFCE7", "#166534", "Terminé"], EN_COURS: ["#E0ECF7", "#1F4E79", "En cours"], ECHEC: ["#FDECEC", "#991B1B", "Échec"], EN_ATTENTE: ["#F0EFED", "#4A5568", "En attente"] };
const seg = (on: boolean): CSSProperties => ({ border: "none", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, padding: "10px 18px", borderRadius: 10, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#FFFFFF" } : { background: "transparent", color: "#4A5568" }) });
const btnS: CSSProperties = { height: 48, padding: "0 18px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", cursor: "pointer" };
const btnP: CSSProperties = { height: 48, padding: "0 22px", borderRadius: 10, border: "none", background: "#C9A44C", font: "inherit", fontSize: "var(--t-md)", fontWeight: 700, color: "#0B1424", cursor: "pointer" };
/** Canevas à télécharger par type : la liste officielle des IMF (Excel) pour les institutions. */
const CANEVAS: Record<TypeImport, [string, string]> = {
  IMF: ["modele_liste_imf.xlsx", "Importez la liste officielle des IMF telle quelle : une ligne par institution, dirigeants compris."],
  POINTS_SERVICE: ["modele_points_service.csv", "Utilisez le canevas standard pour éviter les erreurs de colonnes."],
  DIRIGEANTS: ["modele_dirigeants.csv", "Utilisez le canevas standard pour éviter les erreurs de colonnes."],
};
/** Statuts d'un import pas encore terminé : l'écran interroge alors le serveur. */
const EN_TRAITEMENT = new Set(["EN_ATTENTE", "EN_COURS"]);
const tailleFichier = (o: number) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const extension = (nom: string | null | undefined) => (nom ? (nom.split(/[?#]/)[0].split(".").pop() ?? "") : "").toUpperCase();
/** Extension affichée dans l'historique : celle du fichier, sinon celle du format attendu pour le type. */
const extensionImport = (h: Importation) => extension(h.fichier) || (h.type_import === "IMF" ? "XLSX" : "CSV");
/** Nom du fichier importé, tiré de son adresse sur le serveur (« importations/2026/11/liste.xlsx »). */
const nomFichier = (url: string | null | undefined) => (url ? decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "") : "");
/** Import suivi par cet onglet : retrouvé en revenant sur la page (progression, puis rapport). */
const memoire = memoireImport;

export function Donnees() {
  const [params] = useSearchParams();
  const { utilisateur } = useAuth();
  const [tab, setTab] = useState(params.get("onglet") === "export" ? "export" : "import");
  const [step, setStep] = useState(1);
  const [type, setType] = useState<TypeImport>("IMF");
  const [fichier, setFichier] = useState<File | null>(null);
  const [lignes, setLignes] = useState<number | null>(null);
  const [res, setRes] = useState<Importation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pageErreurs, setPageErreurs] = useState(1);
  const [pageDoublons, setPageDoublons] = useState(1);
  const [regionExport, setRegionExport] = useState<Record<TypeImport, string>>({ IMF: "", POINTS_SERVICE: "", DIRIGEANTS: "" });
  const { donnees: d } = useDonnees<{ hist: Page<Importation>; stats: Statistiques; regions: AgregatZone[] }>({
    hist: "/importation/?page_size=5&ordering=-date_creation", stats: URL_STATISTIQUES, regions: URL_REGIONS,
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
      setPageErreurs(1); setPageDoublons(1);
      // Réponse immédiate : la suite (progression puis rapport) est suivie par l'effet ci-dessous.
      const cree = await api.post<Importation>("/importation/", fd);
      memoire.ecrire(cree.id);
      setSuivi(cree);
      notificationImport.id = notifier.attente("Import lancé",
        `${LIB[type]} · ${fichier.name}. Vous pouvez continuer à naviguer : une notification annoncera la fin.`);
    } catch (e) {
      const er = erreursChamps(e);
      setErreur(er.fichier || er.type_import || er.__global || "L'import a échoué."); setStep(1);
      notifier.erreur("Fichier refusé", er.fichier || er.type_import || er.__global || "L'import n'a pas pu démarrer.");
    }
  }
  // Suivi de l'import en tâche de fond : état relu toutes les 1,5 s jusqu'à la fin du traitement.
  const [suivi, setSuivi] = useState<Importation | null>(null);
  useEffect(() => {
    if (!suivi) return;
    if (!EN_TRAITEMENT.has(suivi.statut)) {
      setRes(suivi); setStep(3); setSuivi(null); setVersion((v) => v + 1);
      void cacheRequetes.invalidateQueries(); // cartes, listes et compteurs reflètent les données importées
      return;
    }
    const minuteur = window.setTimeout(() => {
      api.get<Importation>(`/importation/${suivi.id}/`).then(setSuivi, () => setSuivi((s) => (s ? { ...s } : s)));
    }, 1500);
    return () => window.clearTimeout(minuteur);
  }, [suivi]);
  // Retour sur la page : l'import suivi par cet onglet est repris là où il en était (progression ou
  // rapport) ; à défaut, un import encore en cours lancé par cet utilisateur.
  const repris = useRef(false);
  function reprendre(i: Importation) {
    memoire.ecrire(i.id);
    setType(i.type_import);
    if (EN_TRAITEMENT.has(i.statut)) { setSuivi(i); setStep(2); } else { setRes(i); setStep(3); }
  }
  useEffect(() => {
    if (repris.current) return;
    const id = memoire.lire();
    if (id) {
      repris.current = true;
      api.get<Importation>(`/importation/${id}/`).then(reprendre, () => memoire.effacer());
      return;
    }
    const enCours = d.hist?.results.find((h) => EN_TRAITEMENT.has(h.statut) && h.utilisateur_email === utilisateur?.email);
    if (d.hist) repris.current = true;
    if (enCours) reprendre(enCours);
  }, [d.hist, utilisateur?.email]);
  const traitees = suivi ? suivi.nb_lignes_importees + suivi.nb_lignes_erreur : 0;
  const progression = suivi?.statut === "EN_COURS" && suivi.nb_lignes_total ? Math.min(1, traitees / suivi.nb_lignes_total) : null;

  // Un import d'une session précédente encore en cours : l'historique se met à jour tout seul.
  const histEnCours = (d.hist?.results ?? []).some((h) => EN_TRAITEMENT.has(h.statut));
  useEffect(() => {
    if (!histEnCours) return;
    const minuteur = window.setInterval(() => setVersion((v) => v + 1), 3000);
    return () => window.clearInterval(minuteur);
  }, [histEnCours]);

  const reset = () => { memoire.effacer(); setStep(1); setFichier(null); setRes(null); setSuivi(null); setLignes(null); setErreur(null); };
  const doublons = res?.doublons ?? [];
  const nbBase = doublons.filter((x) => x.nature === "base").length;
  const nbFichier = doublons.length - nbBase;
  const situation = (x: Doublon) => (x.nature === "base"
    ? "Déjà dans la base : mis à jour, aucun doublon créé"
    : `Répété dans le fichier (même enregistrement que la ligne ${x.ligne_precedente}) : non dupliqué`);
  const lignesErreur = (res?.rapport_erreurs ?? []).flatMap((r) => Object.entries(r.erreurs).map(([c, m]) => ({ l: r.ligne, c, v: r.valeurs?.[c] ?? "", m: typeof m === "string" ? m : JSON.stringify(m) })));
  const taux = res ? (res.nb_lignes_total ? (100 * res.nb_lignes_importees) / res.nb_lignes_total : 0) : 0;
  const zone = (t: TypeImport) => d.regions?.find((z) => z.id === regionExport[t]);
  const exports: { id: string; t: TypeImport; label: string; count: string }[] = [
    { id: "ex-imf", t: "IMF", label: "Liste officielle des IMF", count: `${nombre(zone("IMF")?.nb_imf ?? d.stats?.imf.total ?? 0)} IMF et leurs dirigeants · Excel` },
    { id: "ex-pts", t: "POINTS_SERVICE", label: "Points de service", count: (() => { const n = zone("POINTS_SERVICE")?.nb_points_service ?? d.stats?.points.total ?? 0; return `${nombre(n)} ${pluriel(n, "point")}`; })() },
    { id: "ex-dir", t: "DIRIGEANTS", label: "Dirigeants et mandats", count: zone("DIRIGEANTS") ? `Mandats dans les IMF de ${zone("DIRIGEANTS")!.nom}` : `${nombre(d.stats?.mandats.total ?? 0)} ${pluriel(d.stats?.mandats.total, "mandat")}` },
  ];
  const regionsTriees = [...(d.regions ?? [])].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <AppLayout active="import" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="ie-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Données</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Import et export</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Importez la liste officielle des IMF (institutions, sièges et dirigeants en une fois), ou extrayez les référentiels.</p>
          </div>
          <div role="tablist" aria-label="Import ou export" style={{ display: "flex", padding: 5, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
            {([["import", "Importer"], ["export", "Exporter"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={seg(tab === k)}>{l}</button>)}
          </div>
        </header>

        {tab === "import" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <section className="ie-up d1" style={{ flex: "999 1 560px", minWidth: 0, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #F0EFED", background: "#FFFFFF" }}><Etapes etapes={["Type et fichier", "Traitement", "Rapport"]} courante={step} /></div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {step === 1 && (<>
                  <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    <legend style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "#1A2333", marginBottom: 10 }}>Quel référentiel voulez-vous alimenter ? <span style={{ color: "#B08A1E" }}>*</span></legend>
                    <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12 }}>
                      {TY.map(([k, l, desc]) => {
                        const on = type === k;
                        return (
                          <button key={k} type="button" role="radio" aria-checked={on} className="ie-card" onClick={() => setType(k)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 16, borderRadius: 12, font: "inherit", color: "#0B1424", cursor: "pointer", textAlign: "left", ...(on ? { background: "#FAFAF9", border: "1.5px solid #C9A44C", boxShadow: "0 0 0 4px rgba(201,164,76,.14)" } : { background: "#FFFFFF", border: "1.5px solid #D6D3D1" }) }}>
                            <span style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", ...(on ? { background: "#F5F5F4", color: "#0B1424" } : { background: "#F5F5F4", color: "#8A6A1F" }) }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I[k]} /></svg></span>
                            <b style={{ fontSize: "var(--t-md)" }}>{l}</b>
                            <span style={{ fontSize: "var(--t-xs)", color: "#6B7280", fontWeight: 500 }}>{desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="ie-drop" htmlFor="ie-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choisir(e.dataTransfer.files[0] ?? null); }} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "34px 20px", borderRadius: 12, border: "2px dashed #A8A29E", background: "#FFFFFF", cursor: "pointer", textAlign: "center", transition: "border-color .15s ease, background .15s ease" }}>
                    <span style={{ width: 60, height: 60, borderRadius: 12, background: "#F5F5F4", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg></span>
                    <b style={{ fontSize: "var(--t-base)" }}>Glissez votre fichier ici</b>
                    <span style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>CSV ou Excel (.xlsx) · ou <span style={{ color: "#8A6A1F", fontWeight: 600 }}>parcourir</span></span>
                    <input id="ie-file" type="file" accept=".csv,.xlsx" onChange={(e) => choisir(e.target.files?.[0] ?? null)} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
                  </label>
                  {fichier && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid #E7E5E4" }}>
                      <span style={{ fontSize: "var(--t-2xs)", fontWeight: 700, color: "#FFFFFF", background: extension(fichier.name) === "CSV" ? "#1F4E79" : "#15803D", padding: "4px 6px", borderRadius: 6 }}>{extension(fichier.name)}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t-md)", fontWeight: 500, overflowWrap: "anywhere" }}>{fichier.name} <span style={{ color: "#6B7280", fontWeight: 500 }}>· {tailleFichier(fichier.size)}{lignes !== null ? ` · ${nombre(lignes)} ${pluriel(lignes, "ligne")}` : ""}</span></span>
                      <button type="button" aria-label="Retirer le fichier" onClick={() => choisir(null)} style={{ border: "none", background: "transparent", color: "#6B7280", cursor: "pointer", fontSize: "var(--t-lg)" }}>×</button>
                    </div>
                  )}
                  <Erreur>{erreur}</Erreur>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "#F5F5F4", color: "#5B4A1E", fontSize: "var(--t-sm)", flexWrap: "wrap" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M12 18v-6M9 15l3 3 3-3" /></svg><span style={{ flex: 1 }}>{CANEVAS[type][1]}</span><a href="#" onClick={(e) => { e.preventDefault(); void exporter(`/importation/modeles/${type}/`, CANEVAS[type][0], `Canevas d'import · ${LIB[type]}`); }} style={{ fontWeight: 700, textDecoration: "none" }}>Télécharger le canevas</a></div>
                </>)}

                {step === 2 && (
                  <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 10px", textAlign: "center" }}>
                    <span style={{ width: 64, height: 64, borderRadius: 12, background: "#F5F5F4", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" /></path></svg></span>
                    <b style={{ fontSize: "var(--t-lg)" }}>{!suivi ? "Envoi du fichier…" : suivi.statut === "EN_ATTENTE" ? "En attente de traitement…" : progression === null ? "Lecture du fichier…" : "Traitement du fichier…"}</b>
                    <span style={{ fontSize: "var(--t-md)", color: "#6B7280" }}>Lecture des lignes, contrôle des champs et géolocalisation.</span>
                    <div role="progressbar" aria-label="Progression de l'import" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progression === null ? undefined : Math.round(progression * 100)}
                      style={{ width: "100%", maxWidth: 420, height: 10, borderRadius: 99, background: "#F0EFED", overflow: "hidden" }}>
                      <div className={progression === null ? "ie-bar ie-indetermine" : undefined} style={{ height: "100%", width: progression === null ? "35%" : `${Math.max(2, progression * 100)}%`, borderRadius: 99, background: "#C9A44C", transition: "width .6s ease" }} />
                    </div>
                    {progression !== null && suivi && (
                      <span style={{ fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424" }}>
                        {nombre(traitees)} sur {nombre(suivi.nb_lignes_total)} {pluriel(suivi.nb_lignes_total, "ligne traitée", "lignes traitées")} · {pourcent(progression * 100)}
                        {suivi.nb_lignes_erreur > 0 && <span style={{ color: "#B91C1C", fontWeight: 500 }}> · {nombre(suivi.nb_lignes_erreur)} {pluriel(suivi.nb_lignes_erreur, "rejetée")}</span>}
                      </span>
                    )}
                    <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "#4A5568" }}>{LIB[suivi?.type_import ?? type]} · {fichier?.name ?? nomFichier(suivi?.fichier)}{lignes !== null ? ` · ${nombre(lignes)} ${pluriel(lignes, "ligne")}` : ""}</span>
                    <span style={{ fontSize: "var(--t-sm)", color: "#6B7280", maxWidth: 440 }}>Vous pouvez quitter cette page : l'import continue sur le serveur et son résultat apparaîtra dans l'historique.</span>
                  </div>
                )}

                {step === 3 && res && (<>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
                    <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 16, padding: 18, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
                      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" fill="none" stroke="#F0EFED" strokeWidth="8" /><circle cx="36" cy="36" r="30" fill="none" stroke="#C9A44C" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${((188.5 * taux) / 100).toFixed(1)} 188.5`} transform="rotate(-90 36 36)"><animate attributeName="stroke-dasharray" from="0 188.5" to={`${((188.5 * taux) / 100).toFixed(1)} 188.5`} dur="1.2s" fill="freeze" /></circle></svg>
                      <div><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700 }}>{pourcent(taux, 1)}</div><div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>Taux de succès</div></div>
                    </div>
                    <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700 }}>{nombre(res.nb_lignes_total)}</div><div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>Lignes lues</div></div>
                    <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "#15803D" }}>{nombre(res.nb_lignes_creees ?? res.nb_lignes_importees)}</div><div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>Nouvelles</div></div>
                    {res.nb_lignes_mises_a_jour !== undefined && <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "#1F4E79" }}>{nombre(res.nb_lignes_mises_a_jour)}</div><div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>Déjà en base (mises à jour)</div></div>}
                    <div style={{ flex: "1 1 120px", padding: 18, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "#B91C1C" }}>{nombre(res.nb_lignes_erreur)}</div><div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>En erreur</div></div>
                  </div>
                  {doublons.length > 0 && (
                    <CadreTableau
                      pied={doublons.length > PAR_PAGE ? <Pagination page={pageDoublons} pages={Math.ceil(doublons.length / PAR_PAGE)} onPage={setPageDoublons} resume={`${nombre(doublons.length)} ${pluriel(doublons.length, "ligne")}`} /> : undefined}
                      barre={<><div style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: "var(--t-base)", fontWeight: 600 }}>Doublons détectés</b><span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{nombre(nbBase)} déjà dans la base · {nombre(nbFichier)} {pluriel(nbFichier, "répété")} dans le fichier · aucun enregistrement dupliqué</span></div><a href="#" onClick={(e) => { e.preventDefault(); exporterCsv(`doublons_import_${res.id.slice(0, 8)}.csv`, [["Ligne", "Enregistrement", "Situation"], ...doublons.map((x) => [x.ligne, x.libelle, situation(x)])]); }} style={{ marginLeft: "auto", fontSize: "var(--t-sm)", fontWeight: 500, textDecoration: "none" }}>Télécharger la liste (CSV)</a></>}>
                      <Tableau largeurMin={520}>
                        <thead><tr><EnTete num>Ligne</EnTete><EnTete>Enregistrement</EnTete><EnTete>Situation</EnTete></tr></thead>
                        <tbody>
                          {doublons.slice((pageDoublons - 1) * PAR_PAGE, pageDoublons * PAR_PAGE).map((x) => (
                            <tr key={`${x.ligne}-${x.nature}`}>
                              <td data-label="Ligne" className="num">{x.ligne}</td>
                              <td data-label="Enregistrement" style={{ fontWeight: 500 }}>{x.libelle}</td>
                              <td data-label="Situation" style={{ color: x.nature === "fichier" ? "#B45309" : "#4A5568" }}>{situation(x)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Tableau>
                    </CadreTableau>
                  )}
                  {lignesErreur.length > 0 && (
                    <CadreTableau
                      pied={lignesErreur.length > PAR_PAGE ? <Pagination page={pageErreurs} pages={Math.ceil(lignesErreur.length / PAR_PAGE)} onPage={setPageErreurs} resume={`${lignesErreur.length} erreurs`} /> : undefined}
                      barre={<><b style={{ fontSize: "var(--t-base)", fontWeight: 600 }}>Rapport d'erreurs</b><a href="#" onClick={(e) => { e.preventDefault(); exporterCsv(`rapport_import_${res.id.slice(0, 8)}.csv`, [["Ligne", "Champ", "Valeur", "Problème"], ...lignesErreur.map((x) => [x.l ?? "", x.c, x.v, x.m])]); }} style={{ marginLeft: "auto", fontSize: "var(--t-sm)", fontWeight: 500, textDecoration: "none" }}>Télécharger le rapport (CSV)</a></>}>
                      <Tableau largeurMin={520}>
                        <thead><tr><EnTete num>Ligne</EnTete><EnTete>Champ</EnTete><EnTete>Valeur</EnTete><EnTete>Problème</EnTete></tr></thead>
                        <tbody>
                          {lignesErreur.slice((pageErreurs - 1) * PAR_PAGE, pageErreurs * PAR_PAGE).map((x, i) => (
                            <tr key={i}>
                              <td data-label="Ligne" className="num">{x.l ?? "—"}</td>
                              <td data-label="Champ"><code style={{ fontSize: "var(--t-xs)", background: "#F5F5F4", padding: "3px 7px", borderRadius: 6, color: "#44403C" }}>{x.c}</code></td>
                              <td data-label="Valeur" style={{ color: "#B91C1C" }}>{x.v || "—"}</td>
                              <td data-label="Problème" style={{ color: "#4A5568" }}>{x.m}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Tableau>
                    </CadreTableau>
                  )}
                </>)}
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "space-between", gap: 10, background: "#FFFFFF" }}>
                <button type="button" disabled={step === 2} onClick={step === 1 ? reset : () => { memoire.effacer(); setStep(1); }} style={btnS}>{step === 1 ? "Annuler" : "Retour"}</button>
                <button type="button" className="ie-primary" disabled={step === 2} onClick={step === 1 ? lancer : reset} style={btnP}>{step === 1 ? "Lancer l’import" : step === 2 ? "Voir le rapport" : "Nouvel import"}</button>
              </div>
            </section>

            <aside className="ie-up d2" style={{ flex: "1 1 300px", maxWidth: 380, minWidth: 0, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={{ margin: "0 0 10px 0", fontSize: "var(--t-lg)", fontWeight: 700 }}>Derniers imports</h2>
              {(d.hist?.results ?? []).map((h) => {
                const c = SB[h.statut] ?? SB.EN_ATTENTE;
                return (
                  <div key={h.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 4px", borderBottom: "1px solid #F5F5F4" }}>
                    <span style={{ width: 38, height: 38, flex: "none", borderRadius: 10, background: "#F5F5F4", color: "#8A6A1F", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-2xs)", fontWeight: 700 }}>{extensionImport(h)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{LIB[h.type_import]}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280", overflowWrap: "anywhere" }}>{h.utilisateur_email} · {ilYa(h.date_creation)}</div></div>
                    <span style={{ fontSize: "var(--t-2xs)", fontWeight: 700, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", background: c[0], color: c[1] }}>{c[2]}{h.statut === "EN_COURS" && h.nb_lignes_total ? ` · ${pourcent((100 * (h.nb_lignes_importees + h.nb_lignes_erreur)) / h.nb_lignes_total)}` : ""}</span>
                  </div>
                );
              })}
              {d.hist && d.hist.results.length === 0 && <span style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>Aucun import pour le moment.</span>}
            </aside>
          </div>
        )}

        {tab === "export" && (
          <section className="ie-up d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
            {exports.map((x) => (
              <article key={x.id} style={{ borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 48, height: 48, flex: "none", borderRadius: 10, background: "#F5F5F4", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I[x.t]} /></svg></span><div><h2 style={{ margin: 0, fontSize: "var(--t-lg)", fontWeight: 700 }}>{x.label}</h2><div style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>{x.count}</div></div></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><label htmlFor={x.id} style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#4A5568" }}>Périmètre</label><select id={x.id} className="fi-input" value={regionExport[x.t]} onChange={(e) => setRegionExport((r) => ({ ...r, [x.t]: e.target.value }))} style={{ width: "100%" }}><option value="">Toutes les régions</option>{regionsTriees.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></div>
                <label title="L'export ne contient que les éléments actifs." style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--t-sm)", color: "#4A5568", opacity: 0.6 }}><input type="checkbox" disabled style={{ width: 18, height: 18, accentColor: "#C9A44C" }} /> Inclure les éléments archivés</label>
                <button type="button" className="ie-primary" onClick={() => void exporter(`/importation/export/${x.t}/${qs({ region: regionExport[x.t] })}`, x.t === "IMF" ? "liste_imf.xlsx" : `export_${x.t.toLowerCase()}.csv`, `${x.label}${zone(x.t) ? ` · ${zone(x.t)!.nom}` : " · toutes les régions"}`)} style={{ marginTop: "auto", height: 46, borderRadius: 10, border: "none", background: "#C9A44C", font: "inherit", fontSize: "var(--t-md)", fontWeight: 700, color: "#0B1424", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>{x.t === "IMF" ? "Exporter en Excel" : "Exporter en CSV"}</button>
              </article>
            ))}
          </section>
        )}
      </main>
    </AppLayout>
  );
}
