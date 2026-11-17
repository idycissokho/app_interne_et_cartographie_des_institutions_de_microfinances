/**
 * Écran 10 — Dirigeants et mandats : référentiel consultable (recherche, filtres par
 * institution / fonction / statut / région, tri par colonne, regroupement), fiche dirigeant
 * et modale de mandat en 2 étapes. Base visuelle : maquette-carto-imf/ecrans/10-dirigeants.dc.html.
 * Les filtres vivent dans l'URL (?imf=…&fonction=…) : une vue filtrée se partage et se retrouve.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, qs, requete } from "../api/client";
import type { Mandat, Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ChoixIMF } from "../components/dirigeants/ChoixIMF";
import { FicheDirigeant, dateCourte, echeance } from "../components/dirigeants/FicheDirigeant";
import { EMAIL_OK, Erreur, Etapes, FileDrop, Label, Modal, Toast, btnPrimaire, btnSecondaire, erreursChamps } from "../components/form";
import { AppLayout } from "../components/layout/AppLayout";
import { CODE_FONCTION, isoJour, nombre } from "../lib/format";
import { FAMILLE_FONCTION, FONCTIONS, LIBELLE_FONCTION, STATUT_IMF_COURT, STATUT_MANDAT, TYPE_IMF_COURT, avancementMandat, initiales, regionAffichee } from "../lib/metier";
import { URL_IMF_OPTIONS, URL_REGIONS, URL_STATISTIQUES, type AgregatZone, type ImfOption, type Statistiques } from "../lib/stats";
import { Badge, BoutonIcone, CadreTableau, CelluleActions, EnTete, EtatVide, LigneGroupe, LignesChargement, Pagination, TON_STATUT, Tableau } from "../components/tableau/Tableau";
import { useDonnees } from "../lib/useDonnees";

interface DirigeantRes { id: string; nom_complet: string; email_professionnel: string; nb_mandats: number }

/** Familles de fonctions : [valeur de FAMILLE_FONCTION, libellé de la pastille]. */
const FAMILLES: [string, string][] = [["Gouvernance", "Conseils"], ["Direction", "Direction"], ["Comités", "Comités"], ["Contrôle", "Contrôle"]];
const fonctionsDe = (famille: string) => FONCTIONS.filter(([v]) => FAMILLE_FONCTION[v] === famille);
const STATUTS: [string, string, string][] = [["EN_FONCTION", "En fonction", "#15803D"], ["INTERIM", "Intérim", "#D97706"], ["SUSPENDU", "Suspendu", "#B91C1C"]];
const ALERTES: Record<string, string> = { sans_justificatif: "Sans justificatif", echeance: "Échéance dépassée ou sous 30 j" };
/** Tri par colonne → champs de ?ordering= (le premier est inversé pour un tri décroissant). */
const TRIS: Record<string, string[]> = {
  dirigeant: ["dirigeant__nom", "dirigeant__prenom", "-date_debut"],
  fonction: ["fonction_mandat", "dirigeant__nom"],
  imf: ["imf__nom", "imf", "dirigeant__nom"],
  debut: ["date_debut", "dirigeant__nom"],
  statut: ["statut_mandat", "dirigeant__nom"],
};
/** Regroupement : les lignes d'un même groupe doivent se suivre. */
const GROUPES: Record<string, string> = {
  imf: "imf__nom,imf,fonction_mandat,dirigeant__nom",
  dirigeant: "dirigeant__nom,dirigeant__prenom,dirigeant,-date_debut",
};
const TAILLE = 20;
const chip = (on: boolean): CSSProperties => ({ font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, padding: "9px 14px", borderRadius: 999, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#FFFFFF", border: "1px solid #0B1424" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #E7E5E4" }) });
const seg = (on: boolean): CSSProperties => ({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, border: "none", borderRadius: 9, font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", ...(on ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 1px 2px rgba(11,20,36,.08)" } : { background: "transparent", color: "#6B7280" }) });
const champ: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const selectFiltre: CSSProperties = { cursor: "pointer", flex: "1 1 170px", minWidth: 0, width: "auto" };
const badgeFonction: CSSProperties = { fontSize: "var(--t-xs)", fontWeight: 600, color: "#44403C", background: "#F5F5F4", padding: "3px 7px", borderRadius: 6, whiteSpace: "nowrap" };
const avatar: CSSProperties = { width: 36, height: 36, flex: "none", borderRadius: "50%", background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-xs)", fontWeight: 600 };
const nomFichier = (url: string) => decodeURIComponent(url.split("/").pop() ?? "Fichier");
const Icone = ({ d, taille = 16 }: { d: string; taille?: number }) => <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const I_OEIL = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6";
const I_CRAYON = "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4";
const I_LOUPE = "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14M20 20l-3.6-3.6";

export function Dirigeants() {
  // Diagramme : créer un mandat = ADMIN, modifier un mandat ou un dirigeant = SUPERVISEUR/ADMIN, consulter = tous.
  const { estAdmin, peutModifier } = useAuth();
  const [params, setParams] = useSearchParams();
  const p = (cle: string) => params.get(cle) ?? "";
  const q = p("q"), imf = p("imf"), fonction = p("fonction"), famille = p("famille"), statut = p("statut"), region = p("region");
  const alerte = p("alerte") in ALERTES ? p("alerte") : "";
  const groupe = p("groupe") in GROUPES ? p("groupe") : "";
  const desc = p("tri").startsWith("-");
  const cleTri = p("tri").replace(/^-/, "") in TRIS ? p("tri").replace(/^-/, "") : "dirigeant";
  const page = Math.max(1, Number(p("page")) || 1);
  /** Modifie des filtres dans l'URL (valeur vide = filtre retiré) et revient à la page 1. */
  const maj = (modifs: Record<string, string>) => setParams((avant) => {
    const s = new URLSearchParams(avant);
    if (!("page" in modifs)) s.delete("page");
    Object.entries(modifs).forEach(([k, v]) => (v ? s.set(k, v) : s.delete(k)));
    return s;
  }, { replace: true });

  const [saisie, setSaisie] = useState(q);
  const [fiche, setFiche] = useState<string | null>(null);
  const [modale, setModale] = useState<null | { mandat?: Mandat; dirigeant?: DirigeantRes; retour?: string }>(null);
  const [toast, setToast] = useState<{ titre: string; texte: string } | null>(null);

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => { if (saisie.trim() !== q) maj({ q: saisie.trim() }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);
  // Filtre retiré ailleurs (pastille, « Tout effacer ») : le champ suit.
  useEffect(() => { setSaisie((s) => (s.trim() === q ? s : q)); }, [q]);

  const ordering = groupe
    ? GROUPES[groupe]
    : TRIS[cleTri].map((c, i) => (i === 0 && desc ? `-${c}` : c)).join(",");
  const dans30j = new Date();
  dans30j.setDate(dans30j.getDate() + 30);
  const { donnees: d } = useDonnees<{ rows: Page<Mandat>; imfs: ImfOption[]; regions: AgregatZone[]; stats: Statistiques }>({
    rows: `/dirigeants/mandats/${qs({
      page, page_size: TAILLE, ordering, search: q, imf, imf__region: region, statut_mandat: statut,
      fonction_mandat: fonction, fonction_mandat__in: fonction ? "" : fonctionsDe(famille).map(([v]) => v).join(","),
      sans_justificatif: alerte === "sans_justificatif" ? "true" : "", date_fin__lte: alerte === "echeance" ? isoJour(dans30j) : "",
    })}`,
    imfs: URL_IMF_OPTIONS, regions: URL_REGIONS, stats: URL_STATISTIQUES,
  });
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const imfs = d.imfs ?? [];
  const institution = imfs.find((i) => i.id === imf);
  const nomRegion = (id: string) => regionAffichee((d.regions ?? []).find((z) => z.id === id)?.nom) ?? "Région";

  // Filtres actifs, rappelés en pastilles au-dessus du tableau : [libellé, filtre à retirer].
  const actifs: [string, Record<string, string>][] = [
    ...(q ? [[`« ${q} »`, { q: "" }] as [string, Record<string, string>]] : []),
    ...(imf ? [[institution ? institution.sigle || institution.nom : "Institution", { imf: "" }] as [string, Record<string, string>]] : []),
    ...(fonction ? [[LIBELLE_FONCTION[fonction] ?? fonction, { fonction: "" }] as [string, Record<string, string>]] : []),
    ...(famille && !fonction ? [[FAMILLES.find((x) => x[0] === famille)?.[1] ?? famille, { famille: "" }] as [string, Record<string, string>]] : []),
    ...(statut ? [[STATUT_MANDAT[statut] ?? statut, { statut: "" }] as [string, Record<string, string>]] : []),
    ...(region ? [[nomRegion(region), { region: "" }] as [string, Record<string, string>]] : []),
    ...(alerte ? [[ALERTES[alerte], { alerte: "" }] as [string, Record<string, string>]] : []),
  ];
  const toutEffacer = () => { setSaisie(""); setParams(groupe ? { groupe } : {}, { replace: true }); };

  const st = d.stats;
  const kpis: { n?: number; label: string; color: string; alerte?: string }[] = [
    { n: st?.dirigeants.en_fonction, label: "Dirigeants en fonction", color: "#C9A44C" },
    { n: st?.mandats.total, label: "Mandats enregistrés", color: "#1F4E79" },
    { n: st?.mandats.sans_justificatif, label: "Sans justificatif", color: "#B45309", alerte: "sans_justificatif" },
    { n: st?.mandats.echeance_30j, label: "Échéance dépassée ou < 30 j", color: "#B91C1C", alerte: "echeance" },
  ];

  const colDirigeant = groupe !== "dirigeant", colImf = groupe !== "imf";
  const nbColonnes = 5 + Number(colDirigeant) + Number(colImf);
  const cleGroupe = (r: Mandat) => (groupe === "imf" ? r.imf : groupe === "dirigeant" ? r.dirigeant : "");
  const Th = ({ cle, children }: { cle?: string; children: ReactNode }) => {
    const actif = !!cle && !groupe && cleTri === cle;
    return <EnTete tri={cle ? { actif, desc, onClick: () => maj({ groupe: "", tri: actif && !desc ? `-${cle}` : cle === "dirigeant" ? "" : cle }) } : undefined}>{children}</EnTete>;
  };
  const ouvrirModale = (m: NonNullable<typeof modale>) => { setFiche(null); setModale(m); };
  const fermerModale = () => { if (modale?.retour) setFiche(modale.retour); setModale(null); };
  const annoncer = (titre: string, texte: string) => { setToast({ titre, texte }); setTimeout(() => setToast(null), 3500); };

  return (
    <AppLayout active="dirigeants" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="di-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Référentiels / Gouvernance</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Dirigeants et mandats</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>PCA, DG, gérants, comités. Chaque consultation de fiche est journalisée.</p>
          </div>
          {estAdmin && <button type="button" onClick={() => setModale({})} style={{ height: 46, padding: "0 18px", borderRadius: 10, border: "none", background: "#C9A44C", font: "inherit", fontSize: "var(--t-md)", fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouveau mandat</button>}
        </header>

        {/* Indicateurs ; les deux alertes filtrent la liste d'un clic. */}
        <div className="di-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 14 }}>
          {kpis.map((k) => {
            const on = !!k.alerte && alerte === k.alerte;
            const style: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, padding: "16px 18px", borderRadius: 12, textAlign: "left", font: "inherit", color: "#0B1424", background: on ? "#FAFAF9" : "#FFFFFF", border: on ? "1.5px solid #C9A44C" : "1px solid #E7E5E4" };
            const contenu = (<>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", fontWeight: 500, color: "#4A5568" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: k.color }} />{k.label}</span>
              <b style={{ fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>{k.n === undefined ? "—" : nombre(k.n)}</b>
              {k.alerte && <span style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#8A6A1F" }}>{on ? "Filtre actif — retirer" : "Afficher ces mandats →"}</span>}
            </>);
            return k.alerte
              ? <button key={k.label} type="button" className="di-kpi" aria-pressed={on} onClick={() => maj({ alerte: on ? "" : k.alerte! })} style={{ ...style, cursor: "pointer" }}>{contenu}</button>
              : <div key={k.label} className="di-kpi" style={style}>{contenu}</div>;
          })}
        </div>

        {/* Recherche et filtres */}
        <section className="di-up d1" aria-label="Recherche et filtres" style={{ position: "relative", zIndex: 5, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "2 1 300px", minWidth: 0 }}>
              <span style={{ position: "absolute", left: 14, top: 14, color: "#9AA3B2", pointerEvents: "none", display: "flex" }}><Icone d={I_LOUPE} taille={18} /></span>
              <input className="fi-input ps-input" type="search" aria-label="Rechercher un dirigeant ou une institution" placeholder="Rechercher un nom, un prénom, un email, un téléphone, une institution…" value={saisie} onChange={(e) => setSaisie(e.target.value)} style={{ paddingLeft: 42 }} />
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}><ChoixIMF imfs={imfs} valeur={imf} onChange={(id) => maj({ imf: id })} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select className="fi-input ps-input" aria-label="Filtrer par fonction" value={fonction} onChange={(e) => maj({ fonction: e.target.value, famille: "" })} style={selectFiltre}>
              <option value="">Toutes les fonctions</option>
              {FAMILLES.map(([f, l]) => <optgroup key={f} label={l}>{fonctionsDe(f).map(([v, lib]) => <option key={v} value={v}>{lib}</option>)}</optgroup>)}
            </select>
            <select className="fi-input ps-input" aria-label="Filtrer par statut du mandat" value={statut} onChange={(e) => maj({ statut: e.target.value })} style={selectFiltre}>
              <option value="">Tous les statuts</option>
              {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="fi-input ps-input" aria-label="Filtrer par région de l'institution" value={region} onChange={(e) => maj({ region: e.target.value })} style={selectFiltre}>
              <option value="">Toutes les régions</option>
              {(d.regions ?? []).map((z) => <option key={z.id} value={z.id}>{regionAffichee(z.nom)}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" aria-pressed={!famille && !fonction} onClick={() => maj({ famille: "", fonction: "" })} style={chip(!famille && !fonction)}>Toutes les fonctions</button>
            {FAMILLES.map(([k, l]) => { const on = !fonction && famille === k; return <button key={k} type="button" aria-pressed={on} onClick={() => maj({ famille: on ? "" : k, fonction: "" })} style={chip(on)}>{l}</button>; })}
          </div>
        </section>

        {/* Institution filtrée : rappel de son identité et accès à sa fiche */}
        {institution && (
          <section className="di-up" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "16px 20px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
            <span style={{ width: 46, height: 46, flex: "none", borderRadius: 8, background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-sm)", fontWeight: 600 }}>{initiales(institution.sigle || institution.nom)}</span>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <b style={{ display: "block", fontSize: "var(--t-base)", overflowWrap: "anywhere" }}>{institution.nom}</b>
              <span style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>{[TYPE_IMF_COURT[institution.type_imf], STATUT_IMF_COURT[institution.statut_reglementaire], regionAffichee(institution.region_siege), institution.numero_agrement].filter(Boolean).join(" · ")}</span>
            </div>
            <div style={{ display: "flex", gap: 22 }}>
              <div><b style={{ display: "block", fontSize: "var(--t-xl)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{d.rows ? nombre(total) : "—"}</b><span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>mandat{total > 1 ? "s" : ""}</span></div>
              <div><b style={{ display: "block", fontSize: "var(--t-xl)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{nombre(institution.nb_points_service)}</b><span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>point{institution.nb_points_service > 1 ? "s" : ""} de service</span></div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[[`/points-service?imf=${institution.id}`, "Ses points de service →"], [`/consultation?imf=${institution.id}`, "Fiche de l'institution →"]].map(([to, l]) => <Link key={to} to={to} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #E7E5E4", color: "#0B1424", fontSize: "var(--t-sm)", fontWeight: 500, textDecoration: "none", display: "flex", alignItems: "center", boxSizing: "border-box" }}>{l}</Link>)}
            </div>
          </section>
        )}

        <CadreTableau className="di-up d1"
          barre={<>
            <span aria-live="polite" style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>{d.rows ? `${nombre(total)} mandat${total > 1 ? "s" : ""}` : "Chargement…"}</span>
            {actifs.map(([libelle, retrait]) => (
              <button key={libelle} type="button" className="tbl-filtre" title="Retirer ce filtre" onClick={() => { if ("q" in retrait) setSaisie(""); maj(retrait); }}><span>{libelle}</span><span aria-hidden="true">×</span></button>
            ))}
            {actifs.length > 0 && <button type="button" className="tbl-effacer" onClick={toutEffacer}>Tout effacer</button>}
            <div role="radiogroup" aria-label="Regrouper les mandats" className="tbl-segments">
              {([["", "Liste"], ["imf", "Par institution"], ["dirigeant", "Par dirigeant"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={groupe === k} onClick={() => maj({ groupe: k })}>{l}</button>)}
            </div>
          </>}
          pied={<Pagination page={page} pages={pages} onPage={(n) => maj({ page: n === 1 ? "" : String(n) })} resume={total ? `${(page - 1) * TAILLE + 1}–${(page - 1) * TAILLE + rows.length} sur ${nombre(total)} mandats` : "0 mandat"} />}>
          <Tableau largeurMin={980}>
            <thead><tr>
              {colDirigeant && <Th cle="dirigeant">Dirigeant</Th>}
              <Th cle="fonction">Fonction</Th>
              {colImf && <Th cle="imf">Institution</Th>}
              <Th cle="debut">Mandat</Th><Th cle="statut">Statut</Th><Th>Justificatif</Th>
              <EnTete><span className="sr-only">Actions</span></EnTete>
            </tr></thead>
            <tbody>
              {!d.rows && <LignesChargement colonnes={nbColonnes} />}
              {rows.flatMap((r, i) => {
                const av = avancementMandat(r.date_debut, r.date_fin);
                const ech = echeance(r.date_fin);
                const lien = r.fichier_justificatif || r.documents_justificatifs;
                const contact = [r.dirigeant_email, r.dirigeant_telephone].filter(Boolean).join(" · ");
                const premier = !!groupe && (i === 0 || cleGroupe(rows[i - 1]) !== cleGroupe(r));
                return [
                  premier && (
                    <LigneGroupe key={`g-${r.id}`} colonnes={nbColonnes}>
                      {groupe === "imf"
                        ? <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>{r.imf_nom}</b>{r.imf_region && <span style={{ color: "#6B7280" }}>{regionAffichee(r.imf_region)}</span>}<button type="button" className="di-lien" style={{ marginLeft: "auto", fontSize: "var(--t-sm)", fontWeight: 500, color: "#8A6A1F" }} onClick={() => maj({ imf: r.imf })}>Uniquement cette institution →</button></div>
                        : <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>{r.dirigeant_nom_complet}</b>{contact && <span style={{ color: "#6B7280" }}>{contact}</span>}<button type="button" className="di-lien" style={{ marginLeft: "auto", fontSize: "var(--t-sm)", fontWeight: 500, color: "#8A6A1F" }} onClick={() => setFiche(r.dirigeant)}>Ouvrir la fiche →</button></div>}
                    </LigneGroupe>
                  ),
                  <tr key={r.id} tabIndex={0} title="Ouvrir la fiche du dirigeant" onClick={() => setFiche(r.dirigeant)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setFiche(r.dirigeant)}>
                    {colDirigeant && <td className="principal"><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={avatar}>{initiales(r.dirigeant_nom_complet)}</span><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.dirigeant_nom_complet}</div><span className="muet" style={{ overflowWrap: "break-word" }}>{contact || "—"}</span></div></div></td>}
                    <td data-label="Fonction" className={colDirigeant ? undefined : "principal"}><div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>{CODE_FONCTION[r.fonction_mandat] && <span style={badgeFonction}>{CODE_FONCTION[r.fonction_mandat]}</span>}<span style={{ fontSize: "var(--t-sm)", color: "#4A5568" }}>{LIBELLE_FONCTION[r.fonction_mandat] ?? r.fonction_mandat}</span></div></td>
                    {colImf && <td data-label="Institution"><button type="button" className="di-lien" title="Voir tous les dirigeants de cette institution" onClick={(e) => { e.stopPropagation(); maj({ imf: r.imf }); }} style={{ fontSize: "var(--t-sm)", fontWeight: 500, lineHeight: 1.4, textAlign: "inherit" }}>{r.imf_nom}</button>{r.imf_region && <span className="muet">{[r.imf_sigle, regionAffichee(r.imf_region)].filter(Boolean).join(" · ")}</span>}</td>}
                    <td data-label="Mandat" style={{ minWidth: 180 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--t-sm)", color: "#4A5568", marginBottom: 6, whiteSpace: "nowrap" }}><span>{dateCourte(r.date_debut)}</span><span>{r.date_fin ? dateCourte(r.date_fin) : "sans échéance"}</span></div><div className="tbl-jauge"><div style={{ background: av.color, width: `${av.prog}%` }} /></div>{ech && <div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: ech.couleur, marginTop: 4 }}>{ech.texte}</div>}</td>
                    <td data-label="Statut"><Badge ton={TON_STATUT[r.statut_mandat]}>{STATUT_MANDAT[r.statut_mandat] ?? r.statut_mandat}</Badge></td>
                    <td data-label="Justificatif">{lien
                      ? <a href={lien} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", fontWeight: 500, textDecoration: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6" /></svg>{r.fichier_justificatif ? nomFichier(r.fichier_justificatif) : "Lien externe"}</a>
                      : <Badge ton="alerte">Manquant</Badge>}</td>
                    <CelluleActions>
                      <BoutonIcone libelle={`Voir la fiche de ${r.dirigeant_nom_complet}`} onClick={(e) => { e.stopPropagation(); setFiche(r.dirigeant); }}><Icone d={I_OEIL} /></BoutonIcone>
                      {peutModifier && <BoutonIcone libelle={`Modifier le mandat de ${r.dirigeant_nom_complet}`} onClick={(e) => { e.stopPropagation(); ouvrirModale({ mandat: r }); }}><Icone d={I_CRAYON} /></BoutonIcone>}
                    </CelluleActions>
                  </tr>,
                ];
              })}
            </tbody>
          </Tableau>
          {d.rows && rows.length === 0 && <EtatVide titre="Aucun mandat ne correspond">{actifs.length > 0 ? <>Élargissez la recherche ou <button type="button" className="di-lien" style={{ color: "#8A6A1F" }} onClick={toutEffacer}>effacez les filtres</button>.</> : "Aucun mandat n'est encore enregistré."}</EtatVide>}
        </CadreTableau>
      </main>
      {fiche && <FicheDirigeant key={fiche} id={fiche} onClose={() => setFiche(null)}
        onModifierMandat={(m) => ouvrirModale({ mandat: m, retour: fiche })}
        onAjouterMandat={(dir) => ouvrirModale({ dirigeant: { id: dir.id, nom_complet: dir.nom_complet, email_professionnel: dir.email_professionnel, nb_mandats: dir.mandats.length }, retour: fiche })}
        onVoirInstitution={(id) => { setFiche(null); setSaisie(""); setParams({ imf: id }, { replace: true }); }}
        onEnregistre={(texte) => annoncer("Dirigeant mis à jour", texte)} />}
      {modale && <ModaleMandat mandat={modale.mandat} dirigeant={modale.dirigeant} onClose={fermerModale} onSaved={(m) => { fermerModale(); annoncer("Mandat enregistré", m); }} />}
      {toast && <Toast ton="ok" titre={toast.titre} texte={toast.texte} bas={28} />}
    </AppLayout>
  );
}

/** Création ou modification d'un mandat. `dirigeant` : ajout d'un mandat à un dirigeant déjà choisi (depuis sa fiche). */
function ModaleMandat({ mandat, dirigeant, onClose, onSaved }: { mandat?: Mandat; dirigeant?: DirigeantRes; onClose: () => void; onSaved: (msg: string) => void }) {
  const edition = !!mandat;
  const [step, setStep] = useState(edition || dirigeant ? 2 : 1);
  const [mode, setMode] = useState<"existing" | "new">(dirigeant ? "existing" : "new");
  const [q, setQ] = useState("");
  const [trouves, setTrouves] = useState<DirigeantRes[]>([]);
  const [choisi, setChoisi] = useState<DirigeantRes | null>(mandat ? { id: mandat.dirigeant, nom_complet: mandat.dirigeant_nom_complet, email_professionnel: mandat.dirigeant_email, nb_mandats: 0 } : dirigeant ?? null);
  const [p, setP] = useState({ prenom: "", nom: "", tel: "", email: "", email2: "" });
  const [m, setM] = useState({ imf: mandat?.imf ?? "", fonction: mandat?.fonction_mandat ?? "DG", debut: mandat?.date_debut ?? "", fin: mandat?.date_fin ?? "", statut: mandat?.statut_mandat ?? "EN_FONCTION", lien: mandat?.documents_justificatifs ?? "" });
  const [fichier, setFichier] = useState<File | null>(null);
  const [avecLien, setAvecLien] = useState(!!mandat?.documents_justificatifs);
  const [touched, setTouched] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const { donnees: r } = useDonnees<{ imfs: ImfOption[] }>({ imfs: URL_IMF_OPTIONS });

  useEffect(() => {
    if (mode !== "existing") return;
    const t = setTimeout(() => api.get<Page<DirigeantRes>>(`/dirigeants/${qs({ search: q, page_size: 5 })}`).then((x) => setTrouves(x.results)).catch(() => setTrouves([])), 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  const nomComplet = mode === "existing" || edition ? choisi?.nom_complet ?? "" : `${p.prenom} ${p.nom}`.trim();
  const err1 = {
    prenom: touched && mode === "new" && !p.prenom.trim() ? "Le prénom est obligatoire." : erreurs.prenom,
    nom: touched && mode === "new" && !p.nom.trim() ? "Le nom est obligatoire." : erreurs.nom,
    email: !EMAIL_OK(p.email) ? "Adresse email invalide." : erreurs.email_professionnel,
    email2: !EMAIL_OK(p.email2) ? "Adresse email invalide." : erreurs.email_secondaire,
    choix: touched && mode === "existing" && !choisi ? "Sélectionnez un dirigeant." : undefined,
  };
  const finAvantDebut = !!(m.debut && m.fin && m.fin < m.debut);
  const err2 = {
    imf: touched && !m.imf ? "L'institution est obligatoire." : erreurs.imf,
    debut: touched && !m.debut ? "La date de début est obligatoire." : erreurs.date_debut,
    fin: finAvantDebut ? "La date de fin doit être postérieure à la date de début." : erreurs.date_fin,
    lien: erreurs.documents_justificatifs, fichier: erreurs.fichier_justificatif,
  };

  function continuer() {
    setTouched(true);
    if (mode === "new" ? !p.prenom.trim() || !p.nom.trim() || err1.email || err1.email2 : !choisi) return;
    setTouched(false); setErreurs({}); setStep(2);
  }

  async function enregistrer() {
    setTouched(true);
    if (!m.imf || !m.debut || finAvantDebut) return;
    setEnvoi(true);
    try {
      let dirigeantId = choisi?.id;
      if (!edition && mode === "new") {
        try {
          const d = await api.post<{ id: string }>("/dirigeants/", { prenom: p.prenom.trim(), nom: p.nom.trim(), telephone: p.tel.trim(), email_professionnel: p.email.trim(), email_secondaire: p.email2.trim() });
          dirigeantId = d.id;
          setChoisi({ id: d.id, nom_complet: nomComplet, email_professionnel: p.email, nb_mandats: 0 });
          setMode("existing");
        } catch (e) {
          setErreurs(erreursChamps(e)); setStep(1); return;
        }
      }
      const fd = new FormData();
      fd.append("imf", m.imf); fd.append("fonction_mandat", m.fonction); fd.append("date_debut", m.debut);
      fd.append("date_fin", m.fin); fd.append("statut_mandat", m.statut); fd.append("documents_justificatifs", avecLien ? m.lien.trim() : "");
      if (fichier) fd.append("fichier_justificatif", fichier);
      // En multipart, DRF lit un booléen absent comme False : le mandat serait créé déjà désactivé.
      if (!edition) fd.append("is_active", "true");
      const chemin = edition ? `/dirigeants/${mandat!.dirigeant}/mandats/${mandat!.id}/` : `/dirigeants/${dirigeantId}/mandats/`;
      await requete(chemin, { method: edition ? "PATCH" : "POST", body: fd });
      onSaved(`${LIBELLE_FONCTION[m.fonction]} · ${nomComplet}`);
    } catch (e) {
      setErreurs(erreursChamps(e));
    } finally {
      setEnvoi(false);
    }
  }

  const cls = (bad?: string | false) => "fi-input ps-input" + (bad ? " bad" : "");
  return (
    <Modal titre={edition ? "Modifier le mandat" : "Nouveau mandat"} sousTitre="Identifiez le dirigeant, puis décrivez sa fonction dans l'IMF." onClose={onClose}
      entete={!edition && <div style={{ padding: "0 26px 18px 26px" }}><Etapes etapes={["Dirigeant", "Mandat et justificatif"]} courante={step} /></div>}
      pied={<>
        <button type="button" onClick={() => (step === 1 || edition ? onClose() : setStep(1))} style={btnSecondaire}>{step === 1 || edition ? "Annuler" : "Retour"}</button>
        <button type="button" className="di-primary" disabled={envoi} onClick={step === 1 ? continuer : enregistrer} style={{ ...btnPrimaire, display: "flex", alignItems: "center", gap: 8 }}>{step === 1 ? "Continuer" : "Enregistrer le mandat"} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (step === 1) continuer(); else enregistrer(); }} style={{ padding: "4px 26px 22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
        {step === 1 && (<>
          <div role="radiogroup" style={{ display: "flex", padding: 4, borderRadius: 10, background: "#F5F5F4", gap: 2 }}>
            {([["existing", "Dirigeant existant"], ["new", "Nouveau dirigeant"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} style={seg(mode === k)}>{l}</button>)}
          </div>
          {mode === "existing" && (<>
            <div style={champ}><Label htmlFor="di-find">Rechercher un dirigeant</Label><input id="di-find" className="fi-input ps-input" placeholder="Nom, prénom ou email…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {trouves.map((t) => {
                const on = choisi?.id === t.id;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setChoisi(t)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, font: "inherit", color: "#0B1424", cursor: "pointer", textAlign: "left", ...(on ? { border: "1.5px solid #C9A44C", background: "#FAFAF9" } : { border: "1.5px solid #D6D3D1", background: "#FFFFFF" }) }}>
                    <span style={{ width: 38, height: 38, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-xs)", fontWeight: 700, ...(on ? { background: "#0B1424", color: "#FFFFFF" } : { background: "#F5F5F4", color: "#44403C" }) }}>{initiales(t.nom_complet)}</span>
                    <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: "var(--t-md)" }}>{t.nom_complet}</b><span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{t.nb_mandats} mandat{t.nb_mandats > 1 ? "s" : ""}{t.email_professionnel ? ` · ${t.email_professionnel}` : ""}</span></span>
                    <span style={{ width: 18, height: 18, flex: "none", borderRadius: "50%", boxSizing: "border-box", ...(on ? { border: "5px solid #C9A44C" } : { border: "2px solid #A8A29E" }) }} />
                  </button>
                );
              })}
              {trouves.length === 0 && <span className="fi-help">Aucun dirigeant trouvé.</span>}
              <Erreur>{err1.choix}</Erreur>
            </div>
          </>)}
          {mode === "new" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="ps-grille2">
              <div style={champ}><Label htmlFor="di-prenom" requis>Prénom</Label><input id="di-prenom" className={cls(err1.prenom)} value={p.prenom} onChange={(e) => setP({ ...p, prenom: e.target.value })} /><Erreur>{err1.prenom}</Erreur></div>
              <div style={champ}><Label htmlFor="di-nom" requis>Nom</Label><input id="di-nom" className={cls(err1.nom)} value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} /><Erreur>{err1.nom}</Erreur></div>
              <div style={champ}><Label htmlFor="di-tel">Téléphone</Label><input id="di-tel" className={cls(erreurs.telephone)} value={p.tel} onChange={(e) => setP({ ...p, tel: e.target.value })} placeholder="+221 77 000 00 00" inputMode="tel" /></div>
              <div style={champ}><Label htmlFor="di-mail">Email professionnel</Label><input id="di-mail" type="email" className={cls(err1.email)} value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} placeholder="prenom.nom@imf.sn" /><Erreur>{err1.email}</Erreur></div>
              <div style={{ ...champ, gridColumn: "span 2" }} className="ps-plein"><label className="fi-label" htmlFor="di-mail2">Email secondaire <span style={{ fontWeight: 500, color: "#6B7280" }}>(optionnel)</span></label><input id="di-mail2" type="email" className={cls(err1.email2)} value={p.email2} onChange={(e) => setP({ ...p, email2: e.target.value })} placeholder="adresse personnelle" /><Erreur>{err1.email2}</Erreur></div>
            </div>
          )}
        </>)}

        {step === 2 && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
            <span style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-xs)", fontWeight: 600 }}>{initiales(nomComplet)}</span>
            <div style={{ flex: 1 }}><b style={{ fontSize: "var(--t-md)" }}>{nomComplet}</b><div style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{edition || mode === "existing" ? "Dirigeant existant" : "Nouveau dirigeant"}</div></div>
            {!edition && <button type="button" onClick={() => setStep(1)} style={{ border: "none", background: "transparent", color: "#8A6A1F", font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer" }}>Modifier</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="ps-grille2">
            <div style={champ}><Label htmlFor="di-imf" requis>Institution</Label><select id="di-imf" className={cls(err2.imf)} value={m.imf} onChange={(e) => setM({ ...m, imf: e.target.value })}><option value="">Choisir…</option>{(r.imfs ?? []).map((i) => <option key={i.id} value={i.id}>{i.nom}{i.sigle ? ` (${i.sigle})` : ""}</option>)}</select><Erreur>{err2.imf}</Erreur></div>
            <div style={champ}><Label htmlFor="di-fct" requis>Fonction</Label><select id="di-fct" className={cls(erreurs.fonction_mandat)} value={m.fonction} onChange={(e) => setM({ ...m, fonction: e.target.value })}>{FONCTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={champ}><Label htmlFor="di-deb" requis>Début du mandat</Label><input id="di-deb" type="date" className={cls(err2.debut)} value={m.debut} onChange={(e) => setM({ ...m, debut: e.target.value })} /><Erreur>{err2.debut}</Erreur></div>
            <div style={champ}><Label htmlFor="di-fin">Fin du mandat</Label><input id="di-fin" type="date" className={cls(err2.fin)} value={m.fin} onChange={(e) => setM({ ...m, fin: e.target.value })} />{err2.fin ? <Erreur>{err2.fin}</Erreur> : <span className="fi-help">Doit être postérieure au début. Laisser vide si indéterminée.</span>}</div>
          </div>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="fi-label" style={{ marginBottom: 8 }}>Statut du mandat</legend>
            <div role="radiogroup" style={{ display: "flex", padding: 4, borderRadius: 10, background: "#F5F5F4", gap: 2 }}>
              {STATUTS.map(([k, l, c]) => <button key={k} type="button" role="radio" aria-checked={m.statut === k} onClick={() => setM({ ...m, statut: k })} style={seg(m.statut === k)}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l}</button>)}
            </div>
          </fieldset>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="fi-label">Document justificatif</span>
            <FileDrop id="di-file" accept=".pdf,.jpg,.jpeg,.png" titre="Déposez le PV, la décision, l'arrêté ou la lettre" formats="PDF, JPG ou PNG" fichier={fichier} onFichier={setFichier} />
            {!fichier && mandat?.fichier_justificatif && <span className="fi-help">Fichier actuel : <a href={mandat.fichier_justificatif} target="_blank" rel="noreferrer">{nomFichier(mandat.fichier_justificatif)}</a></span>}
            <Erreur>{err2.fichier}</Erreur>
            {!avecLien
              ? <span className="fi-help">Ou collez un lien vers un document externe : <a href="#" onClick={(e) => { e.preventDefault(); setAvecLien(true); }}>ajouter un lien</a></span>
              : <><input className={cls(err2.lien)} type="url" placeholder="https://…" value={m.lien} onChange={(e) => setM({ ...m, lien: e.target.value })} aria-label="Lien vers un document externe" /><Erreur>{err2.lien}</Erreur></>}
          </div>
          <Erreur>{erreurs.__global}</Erreur>
        </>)}
      </form>
    </Modal>
  );
}
