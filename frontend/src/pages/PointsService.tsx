/**
 * Écran 09 — Points de service : référentiel consultable (recherche, filtres par institution /
 * type / statut / région → département → commune / bailleur / GPS, tri par colonne, regroupement),
 * fiche d'un point et tiroir de création / édition.
 * Base visuelle : maquette-carto-imf/ecrans/09-points-de-service.dc.html.
 * Les filtres vivent dans l'URL (?imf=…&region=…) : une vue filtrée se partage et se retrouve.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, qs } from "../api/client";
import type { Bailleur, Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ChoixIMF } from "../components/dirigeants/ChoixIMF";
import { Drawer, EMAIL_OK, Erreur, Label, Toast, btnPrimaire, btnSecondaire, erreursChamps } from "../components/form";
import { AppLayout } from "../components/layout/AppLayout";
import { FichePoint } from "../components/points/FichePoint";
import { dansLeSenegal } from "../data/projection";
import { montantCourt, nombre } from "../lib/format";
import { STATUT_IMF_COURT, STATUT_POINT, TYPE_IMF_COURT, TYPE_POINT, initiales, regionAffichee } from "../lib/metier";
import { nombreFr, regionProche } from "../lib/region";
import { URL_IMF_OPTIONS, URL_STATISTIQUES, type ImfOption, type Statistiques } from "../lib/stats";
import { Badge, BoutonIcone, CadreTableau, CelluleActions, EnTete, EtatVide, LigneGroupe, LignesChargement, Pagination, TON_STATUT, Tableau, PAR_PAGE } from "../components/tableau/Tableau";
import { useDonnees } from "../lib/useDonnees";
import { COULEUR_TYPE_POINT } from "../styles/tokens";

interface Ligne { id: string; nom: string; imf: string; imf_nom: string; imf_sigle: string; type_point: string; statut_point: string; region: string | null; region_nom: string | null; departement_nom: string | null; commune_nom: string | null; adresse: string; lieu_dit: string; telephone: string; nombre_membres: number | null; encours: string; a_gps: boolean }
interface Detail { imf: string; nom: string; type_point: string; statut_point: string; statut_reglementaire: string; adresse: string; localisation: { coordinates: [number, number] } | null; region: string | null; departement: string | null; commune: string | null; telephone: string; email: string; date_ouverture: string | null; nombre_membres: number | null; encours: string; depots: string | null }
interface Zone { id: string; nom: string; parent: string | null }

const TAILLE = PAR_PAGE;
const TYPES = Object.entries(TYPE_POINT);
const STATUTS = Object.entries(STATUT_POINT);
const REGL: [string, string][] = [["EN_COURS", "En cours d'agrément"], ["AGREE", "Agréé"], ["RADIE", "Radié"]];
const GPS: Record<string, string> = { sans: "Sans coordonnées GPS", avec: "Géolocalisés" };
/** Tri par colonne → champs de ?ordering= (le premier est inversé pour un tri décroissant). */
const TRIS: Record<string, string[]> = {
  nom: ["nom"], imf: ["imf__nom", "imf", "nom"], type: ["type_point", "nom"], lieu: ["region__nom", "commune__nom", "nom"],
  statut: ["statut_point", "nom"], membres: ["nombre_membres", "nom"], encours: ["encours", "nom"],
};
/** Colonnes chiffrées : le premier clic affiche les plus grandes valeurs. */
const DECROISSANT_DABORD = ["membres", "encours"];
/** Regroupement : les lignes d'un même groupe doivent se suivre. */
const GROUPES: Record<string, string> = { imf: "imf__nom,imf,nom", region: "region__nom,commune__nom,nom" };
const URL_ZONES = (type: string) => `/cartographie/zones/?type_zone=${type}&page_size=1000`;
const VIDE = { imf: "", nom: "", type: "AGENCE", statut: "OUVERT", regl: "EN_COURS", adresse: "", lat: "", lon: "", region: "", departement: "", commune: "", tel: "", email: "", date: "", membres: "", encours: "", depots: "" };
const champ: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const selectFiltre: CSSProperties = { cursor: "pointer", flex: "1 1 170px", minWidth: 0, width: "auto" };
const boutonEntete: CSSProperties = { height: 46, padding: "0 16px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" };
const Icone = ({ d, taille = 16 }: { d: string; taille?: number }) => <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const I_OEIL = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6";
const I_CRAYON = "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4";
const I_LOUPE = "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14M20 20l-3.6-3.6";
type Retrait = [string, Record<string, string>];

export function PointsService() {
  // Diagramme : ajouter = ADMIN, modifier = SUPERVISEUR/ADMIN, consulter = tous les rôles.
  const { estAdmin, peutModifier } = useAuth();
  const [params, setParams] = useSearchParams();
  const p = (cle: string) => params.get(cle) ?? "";
  const q = p("q"), imf = p("imf"), statut = p("statut"), region = p("region"), departement = p("departement"), commune = p("commune"), bailleur = p("bailleur");
  const type = p("type") in TYPE_POINT ? p("type") : "";
  // ?sans_gps=true : ancien lien de l'espace supervision.
  const gps = p("gps") in GPS ? p("gps") : p("sans_gps") === "true" ? "sans" : "";
  const groupe = p("groupe") in GROUPES ? p("groupe") : "";
  const desc = p("tri").startsWith("-");
  const cleTri = p("tri").replace(/^-/, "") in TRIS ? p("tri").replace(/^-/, "") : "nom";
  const page = Math.max(1, Number(p("page")) || 1);
  /** Modifie des filtres dans l'URL (valeur vide = filtre retiré) et revient à la page 1. */
  const maj = (modifs: Record<string, string>) => setParams((avant) => {
    const s = new URLSearchParams(avant);
    if (!("page" in modifs)) s.delete("page");
    if ("gps" in modifs) s.delete("sans_gps");
    Object.entries(modifs).forEach(([k, v]) => (v ? s.set(k, v) : s.delete(k)));
    return s;
  }, { replace: true });

  const [saisie, setSaisie] = useState(q);
  const [fiche, setFiche] = useState<string | null>(null);
  const [tiroir, setTiroir] = useState<null | { id?: string; retour?: string }>(params.get("nouveau") && estAdmin ? {} : null);
  const [toast, setToast] = useState<string | null>(null);

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => { if (saisie.trim() !== q) maj({ q: saisie.trim() }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);
  // Filtre retiré ailleurs (pastille, « Tout effacer ») : le champ suit.
  useEffect(() => { setSaisie((s) => (s.trim() === q ? s : q)); }, [q]);

  const ordering = groupe ? GROUPES[groupe] : TRIS[cleTri].map((c, i) => (i === 0 && desc ? `-${c}` : c)).join(",");
  const { donnees: d } = useDonnees<{ rows: Page<Ligne>; stats: Statistiques; imfs: ImfOption[]; regions: Page<Zone>; depts: Page<Zone>; communes: Page<Zone>; bailleurs: Page<Bailleur> }>({
    rows: `/points-service/${qs({ page, page_size: TAILLE, ordering, search: q, imf, type_point: type, statut_point: statut, region, departement, commune, bailleur, sans_gps: gps === "sans" ? "true" : gps === "avec" ? "false" : "" })}`,
    stats: URL_STATISTIQUES, imfs: URL_IMF_OPTIONS,
    regions: URL_ZONES("REGION"), depts: URL_ZONES("DEPARTEMENT"),
    // Les communes (plusieurs centaines) ne sont chargées qu'une fois un département choisi.
    communes: departement || commune ? URL_ZONES("COMMUNE") : null,
    bailleurs: "/imf/bailleurs/?page_size=1000",
  });
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const imfs = d.imfs ?? [];
  const institution = imfs.find((i) => i.id === imf);
  const regions = d.regions?.results ?? [];
  const avecDepartements = (d.depts?.results ?? []).length > 0 || !!departement || !!commune;
  const depts = (d.depts?.results ?? []).filter((z) => !region || z.parent === region);
  const communes = (d.communes?.results ?? []).filter((z) => !departement || z.parent === departement);
  const nomZone = (liste: Zone[] | undefined, id: string, defaut: string) => { const z = (liste ?? []).find((x) => x.id === id); return z ? regionAffichee(z.nom) ?? z.nom : defaut; };

  // Filtres actifs, rappelés en pastilles au-dessus du tableau : [libellé, filtre à retirer].
  const actifs = ([
    q && [`« ${q} »`, { q: "" }],
    imf && [institution ? institution.sigle || institution.nom : "Institution", { imf: "" }],
    type && [TYPE_POINT[type], { type: "" }],
    statut && [STATUT_POINT[statut] ?? statut, { statut: "" }],
    region && [nomZone(d.regions?.results, region, "Région"), { region: "", departement: "", commune: "" }],
    departement && [nomZone(d.depts?.results, departement, "Département"), { departement: "", commune: "" }],
    commune && [nomZone(d.communes?.results, commune, "Commune"), { commune: "" }],
    bailleur && [(() => { const b = (d.bailleurs?.results ?? []).find((x) => x.id === bailleur); return b ? b.sigle || b.nom : "Bailleur"; })(), { bailleur: "" }],
    gps && [GPS[gps], { gps: "" }],
  ] as (Retrait | "")[]).filter((x): x is Retrait => !!x);
  const toutEffacer = () => { setSaisie(""); setParams(groupe ? { groupe } : {}, { replace: true }); };

  const st = d.stats?.points;
  const tuiles: { n?: number; label: string; color: string; on: boolean; clic: () => void }[] = [
    { n: st?.total, label: "Tous les points", color: "#0B1424", on: !type && !gps, clic: () => maj({ type: "", gps: "" }) },
    ...TYPES.map(([k, l]) => ({ n: st?.par_type[k], label: k === "SIEGE" ? "Sièges sociaux" : k === "BUREAU" ? "Bureaux de représentation" : `${l}s`, color: COULEUR_TYPE_POINT[k], on: type === k, clic: () => maj({ type: type === k ? "" : k }) })),
    { n: st?.sans_gps, label: "Sans coordonnées GPS", color: "#B45309", on: gps === "sans", clic: () => maj({ gps: gps === "sans" ? "" : "sans" }) },
  ];

  const colImf = groupe !== "imf";
  const nbColonnes = 7 + Number(colImf);
  const cleGroupe = (r: Ligne) => (groupe === "imf" ? r.imf : groupe === "region" ? r.region ?? "" : "");
  const enTete = (cle: string, libelle: string, num = false) => {
    const actif = !groupe && cleTri === cle;
    const suivant = actif ? (desc ? cle : `-${cle}`) : DECROISSANT_DABORD.includes(cle) ? `-${cle}` : cle;
    return <EnTete key={cle} num={num} tri={{ actif, desc, onClick: () => maj({ groupe: "", tri: suivant === "nom" ? "" : suivant }) }}>{libelle}</EnTete>;
  };
  const lienCarte = `/carte/micro${qs({ region: region ? nomZone(d.regions?.results, region, "") : "" })}`;
  const fermerTiroir = () => {
    if (tiroir?.retour) setFiche(tiroir.retour);
    setTiroir(null);
    if (params.get("nouveau")) maj({ nouveau: "" });
  };

  return (
    <AppLayout active="points" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="ps-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Référentiels</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Points de service</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Sièges, agences, guichets et bureaux de représentation.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to={lienCarte} style={boutonEntete}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>Voir sur la carte</Link>
            {estAdmin && <button type="button" onClick={() => setTiroir({})} style={{ height: 46, padding: "0 18px", borderRadius: 10, border: "none", background: "#C9A44C", font: "inherit", fontSize: "var(--t-md)", fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouveau point</button>}
          </div>
        </header>

        {/* Indicateurs : chaque tuile filtre la liste d'un clic (type de point, points sans GPS). */}
        <section className="ps-up d1" aria-label="Filtrer par type de point" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 12 }}>
          {tuiles.map((k) => (
            <button key={k.label} type="button" className="di-kpi" aria-pressed={k.on} onClick={k.clic} style={{ padding: 16, borderRadius: 12, display: "flex", alignItems: "center", gap: 12, textAlign: "left", font: "inherit", color: "#0B1424", cursor: "pointer", background: k.on ? "#FAFAF9" : "#FFFFFF", border: k.on ? "1.5px solid #C9A44C" : "1px solid #E7E5E4" }}>
              <span style={{ width: 8, height: 8, flex: "none", borderRadius: "50%", background: k.color, alignSelf: "flex-start", marginTop: 9 }} />
              <span><span style={{ display: "block", fontSize: "var(--t-xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>{k.n === undefined ? "—" : nombre(k.n)}</span><span style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>{k.label}</span></span>
            </button>
          ))}
        </section>

        {/* Recherche et filtres */}
        <section className="ps-up d1" aria-label="Recherche et filtres" style={{ position: "relative", zIndex: 5, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "2 1 300px", minWidth: 0 }}>
              <span style={{ position: "absolute", left: 14, top: 14, color: "#9AA3B2", pointerEvents: "none", display: "flex" }}><Icone d={I_LOUPE} taille={18} /></span>
              <input className="fi-input ps-input" type="search" aria-label="Rechercher un point de service" placeholder="Rechercher un point, une adresse, une localité, un téléphone, une institution…" value={saisie} onChange={(e) => setSaisie(e.target.value)} style={{ paddingLeft: 42 }} />
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}><ChoixIMF imfs={imfs} valeur={imf} onChange={(id) => maj({ imf: id })} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select className="fi-input ps-input" aria-label="Filtrer par région" value={region} onChange={(e) => maj({ region: e.target.value, departement: "", commune: "" })} style={selectFiltre}>
              <option value="">Toutes les régions</option>
              {regions.map((z) => <option key={z.id} value={z.id}>{regionAffichee(z.nom) ?? z.nom}</option>)}
            </select>
            {/* Départements et communes : proposés seulement si ces découpages sont chargés dans la base. */}
            {avecDepartements && (<>
              <select className="fi-input ps-input" aria-label="Filtrer par département" value={departement} onChange={(e) => maj({ departement: e.target.value, commune: "" })} style={selectFiltre}>
                <option value="">{region ? "Tous ses départements" : "Tous les départements"}</option>
                {depts.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
              </select>
              <select className="fi-input ps-input" aria-label="Filtrer par commune" value={commune} disabled={!departement && !commune} onChange={(e) => maj({ commune: e.target.value })} style={{ ...selectFiltre, ...(!departement && !commune ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}>
                <option value="">{departement ? "Toutes ses communes" : "Commune (choisir un département)"}</option>
                {communes.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
              </select>
            </>)}
            <select className="fi-input ps-input" aria-label="Filtrer par type de point" value={type} onChange={(e) => maj({ type: e.target.value })} style={selectFiltre}>
              <option value="">Tous les types</option>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="fi-input ps-input" aria-label="Filtrer par statut du point" value={statut} onChange={(e) => maj({ statut: e.target.value })} style={selectFiltre}>
              <option value="">Tous les statuts</option>
              {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="fi-input ps-input" aria-label="Filtrer par bailleur de l'institution" value={bailleur} onChange={(e) => maj({ bailleur: e.target.value })} style={selectFiltre}>
              <option value="">Tous les bailleurs</option>
              {(d.bailleurs?.results ?? []).map((b) => <option key={b.id} value={b.id}>{b.sigle || b.nom}</option>)}
            </select>
            <select className="fi-input ps-input" aria-label="Filtrer par géolocalisation" value={gps} onChange={(e) => maj({ gps: e.target.value })} style={selectFiltre}>
              <option value="">Avec ou sans GPS</option>
              {Object.entries(GPS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </section>

        {/* Institution filtrée : rappel de son identité et accès à ses dirigeants */}
        {institution && (
          <section className="ps-up" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "16px 20px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
            <span style={{ width: 46, height: 46, flex: "none", borderRadius: 8, background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-sm)", fontWeight: 600 }}>{initiales(institution.sigle || institution.nom)}</span>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <b style={{ display: "block", fontSize: "var(--t-base)", overflowWrap: "anywhere" }}>{institution.nom}</b>
              <span style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>{[TYPE_IMF_COURT[institution.type_imf], STATUT_IMF_COURT[institution.statut_reglementaire], regionAffichee(institution.region_siege), institution.numero_agrement].filter(Boolean).join(" · ")}</span>
            </div>
            <div><b style={{ display: "block", fontSize: "var(--t-xl)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{d.rows ? nombre(total) : "—"}</b><span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>point{total > 1 ? "s" : ""} de service</span></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[[`/dirigeants?imf=${institution.id}`, "Ses dirigeants →"], [`/consultation?imf=${institution.id}`, "Fiche de l'institution →"]].map(([to, l]) => <Link key={to} to={to} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #E7E5E4", color: "#0B1424", fontSize: "var(--t-sm)", fontWeight: 500, textDecoration: "none", display: "flex", alignItems: "center", boxSizing: "border-box" }}>{l}</Link>)}
            </div>
          </section>
        )}

        <CadreTableau className="ps-up d2"
          barre={<>
            <span aria-live="polite" style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>{d.rows ? `${nombre(total)} point${total > 1 ? "s" : ""} de service` : "Chargement…"}</span>
            {actifs.map(([libelle, retrait]) => (
              <button key={libelle} type="button" className="tbl-filtre" title="Retirer ce filtre" onClick={() => { if ("q" in retrait) setSaisie(""); maj(retrait); }}><span>{libelle}</span><span aria-hidden="true">×</span></button>
            ))}
            {actifs.length > 0 && <button type="button" className="tbl-effacer" onClick={toutEffacer}>Tout effacer</button>}
            <div role="radiogroup" aria-label="Regrouper les points de service" className="tbl-segments">
              {([["", "Liste"], ["imf", "Par institution"], ["region", "Par région"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={groupe === k} onClick={() => maj({ groupe: k })}>{l}</button>)}
            </div>
          </>}
          pied={<Pagination page={page} pages={pages} onPage={(n) => maj({ page: n === 1 ? "" : String(n) })} resume={total ? `${(page - 1) * TAILLE + 1}–${(page - 1) * TAILLE + rows.length} sur ${nombre(total)} points` : "0 point"} />}>
          <Tableau largeurMin={1020}>
            <thead><tr>
              {enTete("nom", "Point de service")}
              {colImf && enTete("imf", "Institution")}
              {enTete("type", "Type")}{enTete("lieu", "Localisation")}{enTete("statut", "Statut")}
              {enTete("membres", "Membres", true)}{enTete("encours", "Encours", true)}
              <EnTete><span className="sr-only">Actions</span></EnTete>
            </tr></thead>
            <tbody>
              {!d.rows && <LignesChargement colonnes={nbColonnes} />}
              {rows.flatMap((r, i) => {
                const col = COULEUR_TYPE_POINT[r.type_point];
                const premier = !!groupe && (i === 0 || cleGroupe(rows[i - 1]) !== cleGroupe(r));
                const nomRegion = regionAffichee(r.region_nom);
                const lieu = r.commune_nom ?? nomRegion;
                const lieuDetail = [r.departement_nom, r.commune_nom ? nomRegion : null].filter(Boolean).join(" · ");
                return [
                  premier && (
                    <LigneGroupe key={`g-${r.id}`} colonnes={nbColonnes}>
                      {groupe === "imf"
                        ? <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>{r.imf_nom}</b>{r.imf_sigle && <span style={{ color: "#6B7280" }}>{r.imf_sigle}</span>}<button type="button" className="di-lien" style={{ marginLeft: "auto", fontSize: "var(--t-sm)", fontWeight: 500, color: "#8A6A1F" }} onClick={() => maj({ imf: r.imf })}>Uniquement cette institution →</button></div>
                        : <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>{regionAffichee(r.region_nom) ?? "Région non déterminée"}</b>{r.region && <button type="button" className="di-lien" style={{ marginLeft: "auto", fontSize: "var(--t-sm)", fontWeight: 500, color: "#8A6A1F" }} onClick={() => maj({ region: r.region!, departement: "", commune: "" })}>Uniquement cette région →</button>}</div>}
                    </LigneGroupe>
                  ),
                  <tr key={r.id} tabIndex={0} title="Ouvrir la fiche du point" onClick={() => setFiche(r.id)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setFiche(r.id)}>
                    <td className="principal"><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.nom}</div>{(r.adresse || r.lieu_dit || r.telephone) && <span className="muet">{[r.adresse || r.lieu_dit, r.telephone].filter(Boolean).join(" · ")}</span>}</div></td>
                    {colImf && <td data-label="Institution"><button type="button" className="di-lien" title="Voir tous les points de cette institution" onClick={(e) => { e.stopPropagation(); maj({ imf: r.imf }); }} style={{ fontSize: "var(--t-sm)", fontWeight: 500, lineHeight: 1.4, textAlign: "inherit" }}>{r.imf_nom}</button>{r.imf_sigle && <span className="muet">{r.imf_sigle}</span>}</td>}
                    <td data-label="Type" style={{ whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#4A5568" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />{TYPE_POINT[r.type_point]}</span></td>
                    <td data-label="Localisation"><div>{lieu ?? "—"}</div>{lieuDetail && <span className="muet">{lieuDetail}</span>}{!r.a_gps && <span className="muet" style={{ color: "#B45309" }}>Sans GPS</span>}</td>
                    <td data-label="Statut"><Badge ton={TON_STATUT[r.statut_point === "SUSPENDU" ? "SUSPENDU_POINT" : r.statut_point]}>{STATUT_POINT[r.statut_point] ?? r.statut_point}</Badge></td>
                    <td data-label="Membres" className="num">{r.nombre_membres != null ? nombre(r.nombre_membres) : "—"}</td>
                    <td data-label="Encours" className="num">{montantCourt(r.encours)}</td>
                    <CelluleActions>
                      <BoutonIcone libelle={`Voir la fiche de ${r.nom}`} onClick={(e) => { e.stopPropagation(); setFiche(r.id); }}><Icone d={I_OEIL} /></BoutonIcone>
                      {peutModifier && <BoutonIcone libelle={`Modifier ${r.nom}`} onClick={(e) => { e.stopPropagation(); setTiroir({ id: r.id }); }}><Icone d={I_CRAYON} /></BoutonIcone>}
                    </CelluleActions>
                  </tr>,
                ];
              })}
            </tbody>
          </Tableau>
          {d.rows && rows.length === 0 && <EtatVide titre="Aucun point de service ne correspond">{actifs.length > 0 ? <>Élargissez la recherche ou <button type="button" className="di-lien" style={{ color: "#8A6A1F" }} onClick={toutEffacer}>effacez les filtres</button>.</> : "Aucun point de service n'est encore enregistré."}</EtatVide>}
        </CadreTableau>
      </main>
      {fiche && <FichePoint key={fiche} id={fiche} onClose={() => setFiche(null)}
        onModifier={() => { setTiroir({ id: fiche, retour: fiche }); setFiche(null); }}
        onVoirInstitution={(id) => { setFiche(null); setSaisie(""); setParams({ imf: id }, { replace: true }); }} />}
      {tiroir && (
        <TiroirPoint id={tiroir.id} imfInitiale={tiroir.id ? "" : imf} onClose={fermerTiroir}
          onSaved={(msg) => { fermerTiroir(); setToast(msg); setTimeout(() => setToast(null), 3500); }} />
      )}
      {toast && <Toast ton="ok" titre="Point de service enregistré" texte={toast} bas={28} />}
    </AppLayout>
  );
}

function TiroirPoint({ id, imfInitiale, onClose, onSaved }: { id?: string; imfInitiale: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({ ...VIDE, imf: imfInitiale });
  const [modifies, setModifies] = useState<Record<string, boolean>>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const { donnees: r } = useDonnees<{ imfs: ImfOption[]; regions: Page<Zone>; depts: Page<Zone>; communes: Page<Zone> }>({
    imfs: URL_IMF_OPTIONS,
    regions: "/cartographie/zones/?type_zone=REGION&page_size=1000",
    depts: "/cartographie/zones/?type_zone=DEPARTEMENT&page_size=1000",
    communes: "/cartographie/zones/?type_zone=COMMUNE&page_size=1000",
  });

  useEffect(() => {
    if (!id) return;
    api.get<Detail>(`/points-service/${id}/`).then((p) => {
      const c = p.localisation?.coordinates;
      setF({
        imf: p.imf, nom: p.nom, type: p.type_point, statut: p.statut_point, regl: p.statut_reglementaire, adresse: p.adresse,
        lat: c ? String(Number(c[1].toFixed(5))) : "", lon: c ? String(Number(c[0].toFixed(5))) : "",
        region: p.region ?? "", departement: p.departement ?? "", commune: p.commune ?? "",
        tel: p.telephone, email: p.email, date: p.date_ouverture ?? "", membres: p.nombre_membres != null ? String(p.nombre_membres) : "",
        encours: Number(p.encours) ? String(Number(p.encours)) : "", depots: p.depots != null ? String(Number(p.depots)) : "",
      });
    });
  }, [id]);

  const set = (k: keyof typeof VIDE) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErreurs({}); };
  const setZone = (k: "region" | "departement" | "commune") => (v: string) => { set(k)(v); setModifies((m) => ({ ...m, [k]: true })); };
  const lat = nombreFr(f.lat), lon = nombreFr(f.lon);
  const unSeul = (f.lat === "") !== (f.lon === "");
  const hasGps = f.lat !== "" && f.lon !== "" && !isNaN(lat) && !isNaN(lon);
  const gpsHors = hasGps && !dansLeSenegal(lat, lon);
  const deduite = hasGps && !gpsHors ? regionProche(lat, lon) : "";
  const err = {
    imf: touched && !f.imf ? "L'institution est obligatoire." : erreurs.imf,
    nom: touched && !f.nom.trim() ? "Le nom du point est obligatoire." : erreurs.nom,
    email: !EMAIL_OK(f.email) ? "Adresse email invalide." : erreurs.email,
    gps: unSeul ? "Renseignez la latitude et la longitude." : gpsHors ? "Ces coordonnées sont en dehors du Sénégal (lat. 12,3 à 16,7 ; long. −17,6 à −11,3)." : erreurs.localisation,
  };

  async function enregistrer() {
    setTouched(true);
    if (!f.imf || !f.nom.trim() || err.email || unSeul || gpsHors) return;
    setEnvoi(true);
    const corps: Record<string, unknown> = {
      imf: f.imf, nom: f.nom.trim(), type_point: f.type, statut_point: f.statut, statut_reglementaire: f.regl, adresse: f.adresse.trim(),
      localisation: hasGps ? { type: "Point", coordinates: [lon, lat] } : null,
      telephone: f.tel.trim(), email: f.email.trim(), date_ouverture: f.date || null,
      nombre_membres: f.membres === "" ? null : Number(f.membres), encours: f.encours === "" ? "0" : String(nombreFr(f.encours)),
      depots: f.depots === "" ? null : String(nombreFr(f.depots)),
    };
    // Région / département / commune : envoyés seulement si l'utilisateur les a modifiés (sinon déduits du GPS).
    (["region", "departement", "commune"] as const).forEach((k) => { if (modifies[k]) corps[k] = f[k] || null; });
    try {
      if (id) await api.patch(`/points-service/${id}/`, corps);
      else await api.post("/points-service/", corps);
      onSaved(`« ${f.nom.trim()} » est disponible dans le référentiel.`);
    } catch (e) {
      setErreurs(erreursChamps(e));
    } finally {
      setEnvoi(false);
    }
  }

  const zoneOptions = (liste: Zone[] | undefined, parent: string, libAuto: string): [string, string][] => [["", libAuto], ...(liste ?? []).filter((z) => !parent || !z.parent || z.parent === parent).map((z): [string, string] => [z.id, regionAffichee(z.nom) ?? z.nom])];
  const inputCls = (bad?: string | false) => "fi-input ps-input" + (bad ? " bad" : "");

  return (
    <Drawer surTitre="Points de service" titre={id ? "Modifier le point de service" : "Nouveau point de service"} onClose={onClose}
      pied={<><button type="button" onClick={onClose} style={btnSecondaire}>Annuler</button><button type="button" className="ps-primary" disabled={envoi} onClick={enregistrer} style={btnPrimaire}>Enregistrer le point</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); enregistrer(); }} style={{ flex: 1, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={champ}><Label htmlFor="ps-imf" requis>Institution</Label><select id="ps-imf" className={inputCls(err.imf)} value={f.imf} onChange={(e) => set("imf")(e.target.value)}><option value="">Choisir une institution…</option>{(r.imfs ?? []).map((i) => <option key={i.id} value={i.id}>{i.nom}{i.sigle ? ` (${i.sigle})` : ""}</option>)}</select><Erreur>{err.imf}</Erreur></div>
          <div style={champ}><Label htmlFor="ps-nom" requis>Nom du point</Label><input id="ps-nom" className={inputCls(err.nom)} value={f.nom} onChange={(e) => set("nom")(e.target.value)} placeholder="Ex. Agence de …" /><Erreur>{err.nom}</Erreur></div>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="ps-label" style={{ marginBottom: 8 }}>Type de point <span className="ps-req">*</span></legend>
            <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {TYPES.map(([k, l]) => {
                const on = f.type === k, c = COULEUR_TYPE_POINT[k];
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set("type")(k)} style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 12px", borderRadius: 10, font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, color: "#0B1424", cursor: "pointer", textAlign: "left", ...(on ? { background: "#FAFAF9", border: "1.5px solid #C9A44C" } : { background: "#FFFFFF", border: "1.5px solid #D6D3D1" }) }}>
                    <span style={{ width: 12, height: 12, flex: "none", borderRadius: "50%", background: c, ...(on ? { boxShadow: `0 0 0 4px ${c}33` } : {}) }} />{l}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="ps-grille2">
            <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
              <legend className="ps-label" style={{ marginBottom: 8 }}>Statut du point</legend>
              <div role="radiogroup" style={{ display: "flex", padding: 4, borderRadius: 10, background: "#F5F5F4", gap: 2 }}>
                {STATUTS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.statut === k} onClick={() => set("statut")(k)} style={{ flex: 1, height: 38, border: "none", borderRadius: 9, font: "inherit", fontSize: "var(--t-xs)", fontWeight: 600, cursor: "pointer", ...(f.statut === k ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 1px 2px rgba(11,20,36,.08)" } : { background: "transparent", color: "#6B7280" }) }}>{l}</button>)}
              </div>
            </fieldset>
            <div style={champ}><Label htmlFor="ps-reg">Statut réglementaire</Label><select id="ps-reg" className={inputCls()} value={f.regl} onChange={(e) => set("regl")(e.target.value)}>{REGL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
        </div>
        <div style={{ height: 1, background: "#F0EFED" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: "var(--t-base)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>Localisation</h3>
          <div style={champ}><Label htmlFor="ps-adr">Adresse</Label><input id="ps-adr" className={inputCls(erreurs.adresse)} value={f.adresse} onChange={(e) => set("adresse")(e.target.value)} placeholder="Rue, quartier" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div style={champ}><Label htmlFor="ps-lat">Latitude</Label><input id="ps-lat" className={inputCls(err.gps)} value={f.lat} onChange={(e) => set("lat")(e.target.value)} inputMode="decimal" placeholder="14.6928" /></div>
            <div style={champ}><Label htmlFor="ps-lon">Longitude</Label><input id="ps-lon" className={inputCls(err.gps)} value={f.lon} onChange={(e) => set("lon")(e.target.value)} inputMode="decimal" placeholder="-17.4467" /></div>
          </div>
          <Erreur>{err.gps}</Erreur>
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#F5F5F4", color: "#5B4A1E", fontSize: "var(--t-sm)", lineHeight: 1.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg><span>Région, département et commune sont <b>déduits automatiquement</b> des coordonnées GPS à l'enregistrement. Vous pouvez les corriger.</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="ps-grille3">
            <div style={champ}><Label htmlFor="ps-r">Région</Label><select id="ps-r" className={inputCls(erreurs.region) + (modifies.region ? "" : " auto")} value={f.region} onChange={(e) => setZone("region")(e.target.value)}>{zoneOptions(r.regions?.results, "", deduite ? `${deduite} (déduite)` : "Déduite du GPS").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={champ}><Label htmlFor="ps-d">Département</Label><select id="ps-d" className={inputCls(erreurs.departement) + (modifies.departement ? "" : " auto")} value={f.departement} onChange={(e) => setZone("departement")(e.target.value)}>{zoneOptions(r.depts?.results, f.region, "Déduit du GPS").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={champ}><Label htmlFor="ps-c">Commune</Label><select id="ps-c" className={inputCls(erreurs.commune) + (modifies.commune ? "" : " auto")} value={f.commune} onChange={(e) => setZone("commune")(e.target.value)}>{zoneOptions(r.communes?.results, f.departement, "Déduite du GPS").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
        </div>
        <div style={{ height: 1, background: "#F0EFED" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: "var(--t-base)", fontWeight: 700 }}>Contact et ouverture</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="ps-grille2">
            <div style={champ}><Label htmlFor="ps-tel">Téléphone</Label><input id="ps-tel" className={inputCls(erreurs.telephone)} value={f.tel} onChange={(e) => set("tel")(e.target.value)} placeholder="+221 33 000 00 00" inputMode="tel" /></div>
            <div style={champ}><Label htmlFor="ps-mail">Email</Label><input id="ps-mail" type="email" className={inputCls(err.email)} value={f.email} onChange={(e) => set("email")(e.target.value)} placeholder="agence@imf.sn" /><Erreur>{err.email}</Erreur></div>
            <div style={champ}><Label htmlFor="ps-date">Date d'ouverture</Label><input id="ps-date" type="date" className={inputCls(erreurs.date_ouverture)} value={f.date} onChange={(e) => set("date")(e.target.value)} /><Erreur>{erreurs.date_ouverture}</Erreur></div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: "var(--t-base)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>Indicateurs <span style={{ fontSize: "var(--t-2xs)", fontWeight: 600, color: "#6B7280", background: "#F0EFED", padding: "3px 8px", borderRadius: 999 }}>Optionnel</span></h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="ps-grille3">
            <div style={champ}><Label htmlFor="ps-mb">Membres</Label><input id="ps-mb" className={inputCls(erreurs.nombre_membres)} value={f.membres} onChange={(e) => set("membres")(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" /><Erreur>{erreurs.nombre_membres}</Erreur></div>
            <div style={champ}><Label htmlFor="ps-enc">Encours</Label><div className="ps-unit"><input id="ps-enc" className={inputCls(erreurs.encours)} value={f.encours} onChange={(e) => set("encours")(e.target.value)} inputMode="decimal" placeholder="0" /><span>FCFA</span></div><Erreur>{erreurs.encours}</Erreur></div>
            <div style={champ}><Label htmlFor="ps-dep">Dépôts</Label><div className="ps-unit"><input id="ps-dep" className={inputCls(erreurs.depots)} value={f.depots} onChange={(e) => set("depots")(e.target.value)} inputMode="decimal" placeholder="0" /><span>FCFA</span></div><Erreur>{erreurs.depots}</Erreur></div>
          </div>
        </div>
        <Erreur>{erreurs.__global}</Erreur>
      </form>
    </Drawer>
  );
}
