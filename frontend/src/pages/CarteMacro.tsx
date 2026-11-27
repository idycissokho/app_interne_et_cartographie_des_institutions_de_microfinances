/**
 * Écran 03 — Carte macro (maquette-carto-imf/ecrans/03-carte-macro.dc.html).
 * Niveau territorial Régions / Départements / Communes : agrégats et contours lus sur les routes
 * existantes (GET /cartographie/zones/agregats/ et /zones/geojson/ ?type_zone=…). Un niveau sans
 * aucune zone en base affiche « Données non disponibles pour ce niveau ».
 */
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { SenegalMap, scale, type Indicateur, type StatsRegion, type ZonesCarte } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { SENEGAL_REGIONS, cleRegion } from "../data/senegalRegions";
import { exporterCsv } from "../lib/exporter";
import { nombre } from "../lib/format";
import { regionAffichee } from "../lib/metier";
import { statsParRegion, type AgregatZone, URL_REGIONS, URL_STATISTIQUES, type Statistiques } from "../lib/stats";
import { useDonnees } from "../lib/useDonnees";

const IND: { k: Indicateur; label: string }[] = [
  { k: "pts", label: "Points de service" }, { k: "imf", label: "IMF" }, { k: "membres", label: "Membres" }, { k: "encours", label: "Encours" },
];
const fmt = (k: Indicateur, v: number) => {
  if (k === "membres") return v >= 1000 ? Math.round(v / 1000) + " k" : String(v);
  if (k === "encours") return v.toFixed(1).replace(".", ",");
  return String(v);
};
const seg = { border: "none", font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, padding: "9px 14px", borderRadius: 10, cursor: "pointer" } as const;
const pill = { font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer" } as const;
const kp = { borderRadius: 12, padding: "16px 18px" } as const;
const tuile: CSSProperties = { padding: 14, borderRadius: 10, border: "1px solid #E7E5E4" };

type Niveau = "REGION" | "DEPARTEMENT" | "COMMUNE";
const NIVEAUX: [Niveau, string][] = [["REGION", "Régions"], ["DEPARTEMENT", "Départements"], ["COMMUNE", "Communes"]];
/** Libellés par niveau : [singulier, pluriel]. */
const NOM_NIVEAU: Record<Niveau, [string, string]> = { REGION: ["Région", "régions"], DEPARTEMENT: ["Département", "départements"], COMMUNE: ["Commune", "communes"] };
/** « Aucune commune n'est référencée », « Aucun département n'est référencé ». */
const AUCUNE: Record<Niveau, string> = { REGION: "Aucune région n'est référencée", DEPARTEMENT: "Aucun département n'est référencé", COMMUNE: "Aucune commune n'est référencée" };
interface ZoneAgregee extends AgregatZone { parent: string | null }
interface ContoursZones { type: "FeatureCollection"; features: ZonesCarte["geojson"]["features"] }
interface Ligne extends StatsRegion { id: string; nom: string; color: string; bailleurs: string[]; parentNom: string | null }

export function CarteMacro() {
  const { utilisateur, estAdmin } = useAuth();
  const [sel, setSel] = useState("Dakar");
  const [ind, setInd] = useState<Indicateur>("pts");
  const [mode, setMode] = useState<"regions" | "choro">("regions");
  const [niveau, setNiveau] = useState<Niveau>("REGION");
  // Zone sélectionnée dans un niveau plus fin (identifiant) ; vide = la première du classement.
  const [selZone, setSelZone] = useState("");
  const fin = niveau !== "REGION";
  const { donnees: d } = useDonnees<{ zones: AgregatZone[]; stats: Statistiques; fines: ZoneAgregee[]; contours: ContoursZones }>({
    zones: URL_REGIONS, stats: URL_STATISTIQUES,
    fines: fin ? `/cartographie/zones/agregats/?type_zone=${niveau}` : null,
    contours: fin ? `/cartographie/zones/geojson/?type_zone=${niveau}` : null,
  });

  const stats = statsParRegion(d.zones);
  const parCle = new Map((d.zones ?? []).map((z) => [cleRegion(z.nom), z]));
  const R: Ligne[] = SENEGAL_REGIONS.map((g) => ({ id: g.id, nom: g.id, color: g.color, parentNom: null, ...(stats[cleRegion(g.id)] ?? { pts: 0, imf: 0, membres: 0, encours: 0 }), bailleurs: parCle.get(cleRegion(g.id))?.principaux_bailleurs ?? [] }));
  // Indicateurs nationaux (bandeau du haut) : toujours la somme des régions, quel que soit le niveau.
  const sum = (k: Indicateur) => R.reduce((a, r) => a + r[k], 0);

  // Niveau fin : chaque zone prend la couleur de sa région (rattachement parent → région).
  const regionParId = new Map((d.zones ?? []).map((z) => [z.id, regionAffichee(z.nom) ?? z.nom]));
  const couleurRegion = new Map(SENEGAL_REGIONS.map((g) => [g.id, g.color]));
  const fines = d.fines ?? [];
  const statsFines = statsParRegion(fines.map((z) => ({ ...z, nom: z.id })));
  const F: Ligne[] = fines.map((z) => {
    const region = z.parent ? regionParId.get(z.parent) ?? null : null;
    return { id: z.id, nom: z.nom, color: (region && couleurRegion.get(region)) || "#C9A44C", parentNom: region, ...(statsFines[cleRegion(z.id)] ?? { pts: 0, imf: 0, membres: 0, encours: 0 }), bailleurs: z.principaux_bailleurs };
  });
  const L = fin ? F : R;
  const chargementFin = fin && (d.fines === undefined || d.contours === undefined);
  const indisponible = fin && !chargementFin && F.length === 0;

  const total = L.reduce((a, r) => a + r[ind], 0) || 1;
  const max = Math.max(0, ...L.map((r) => r[ind])) || 1;
  const sorted = L.slice().sort((a, b) => b[ind] - a[ind] || a.nom.localeCompare(b.nom, "fr"));
  const cur: Ligne | undefined = fin ? sorted.find((r) => r.id === selZone) ?? sorted[0] : R.find((r) => r.id === sel) ?? R[0];
  const rank = cur ? sorted.indexOf(cur) + 1 : 0;
  const share = cur ? cur[ind] / total : 0;
  const indLabel = IND.find((i) => i.k === ind)!.label;
  const [nomSingulier, nomPluriel] = NOM_NIVEAU[niveau];
  const choisir = (id: string) => (fin ? setSelZone(id) : setSel(id));

  // Calque des zones fines pour la carte : couleur de la région, ou échelle de l'indicateur.
  const zonesCarte: ZonesCarte | null = fin ? {
    libelle: nomSingulier,
    geojson: d.contours ?? { type: "FeatureCollection", features: [] },
    couleurs: Object.fromEntries(F.map((r) => [r.id, mode === "choro" ? scale(Math.sqrt(r[ind] / max)) : r.color])),
    opacite: mode === "choro" ? 0.78 : 0.55,
    stats: Object.fromEntries(F.map((r) => [r.id, { pts: r.pts, imf: r.imf, membres: r.membres, encours: r.encours }])),
    noms: Object.fromEntries(F.map((r) => [r.id, r.nom])),
    selected: cur?.id ?? "",
    onPick: setSelZone,
  } : null;
  const lienPoints = !cur ? "/carte/micro" : niveau === "REGION" ? `/carte/micro?region=${encodeURIComponent(cur.id)}` : niveau === "DEPARTEMENT" ? `/points-service?departement=${cur.id}` : `/points-service?commune=${cur.id}`;

  const kpis = [
    { label: "IMF présentes", value: nombre(d.stats?.imf.total ?? 0), style: { ...kp, background: "#FFFFFF", border: "1px solid #E7E5E4" }, sub: "#6B7280" },
    { label: "Points de service", value: nombre(sum("pts")), style: { ...kp, background: "#FFFFFF", border: "1px solid #E7E5E4" }, sub: "#6B7280" },
    { label: "Membres", value: (sum("membres") / 1e6).toFixed(2).replace(".", ",") + " M", style: { ...kp, background: "#FFFFFF", border: "1px solid #E7E5E4" }, sub: "#6B7280" },
    { label: "Encours (Mds FCFA)", value: sum("encours").toFixed(0), style: { ...kp, background: "#FFFFFF", border: "1px solid #E7E5E4" }, sub: "#6B7280" },
  ];

  const exporter = () =>
    exporterCsv("carte_macro_regions.csv", [
      ["Rang", "Région", "IMF présentes", "Points de service", "Membres", "Encours (Mds FCFA)", "Principaux bailleurs"],
      ...sorted.map((r, i) => [i + 1, r.id, r.imf, r.pts, r.membres, r.encours.toFixed(2).replace(".", ","), r.bailleurs.join(" · ")]),
    ]);

  return (
    <AppLayout active="macro">
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="cm-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Pilotage / Vision territoriale</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Carte macro du secteur</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Agrégats par zone : IMF présentes, points de service, membres, encours.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div role="group" aria-label="Niveau territorial" style={{ display: "flex", padding: 5, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
              {NIVEAUX.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={k === niveau} onClick={() => { setNiveau(k); setSelZone(""); }} style={{ ...seg, ...(k === niveau ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 1px 2px rgba(11,20,36,.08), 0 0 0 1px #E7E5E4" } : { background: "transparent", color: "#6B7280" }) }}>{l}</button>
              ))}
            </div>
            {estAdmin && <button type="button" onClick={exporter} style={{ height: 46, padding: "0 18px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", color: "#0B1424", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Exporter</button>}
          </div>
        </header>

        <section className="cm-in d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap: 14 }}>
          {kpis.map((k) => (
            <div key={k.label} style={k.style}>
              <div style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: k.sub }}>{k.label}</div>
              <div style={{ fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </section>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <section className="cm-in d2 cm-cadre" style={{ flex: "999 1 560px", minWidth: 0, position: "relative", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 20, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
              <div role="group" aria-label="Mode de coloration" style={{ display: "flex", padding: 4, borderRadius: 10, background: "#F5F5F4" }}>
                {([{ k: "regions", label: "Par région" }, { k: "choro", label: "Par indicateur" }] as const).map((m) => (
                  <button key={m.k} type="button" aria-pressed={m.k === mode} onClick={() => setMode(m.k)} style={{ ...seg, ...(m.k === mode ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 2px 8px rgba(11,20,36,.08)" } : { background: "transparent", color: "#6B7280" }) }}>{m.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {IND.map((i) => (
                  <button key={i.k} type="button" aria-pressed={i.k === ind} onClick={() => { setInd(i.k); setMode("choro"); }} style={{ ...pill, ...(i.k === ind ? { background: "#C9A44C", color: "#0B1424", border: "1px solid #C9A44C" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #E7E5E4" }) }}>{i.label}</button>
                ))}
              </div>
            </div>

            <div className="cm-carte" style={{ height: 600, position: "relative", borderRadius: 12 }}>
              <SenegalMap theme="light" fillMode={mode} indicator={ind} stats={stats} selected={fin ? "" : sel} flow showLabels={false} onPick={setSel} rayon={20} agrandir=".cm-cadre" zones={zonesCarte} />
              {indisponible && <div className="cm-indispo" role="status"><b>Données non disponibles pour ce niveau</b><span>{AUCUNE[niveau]} dans la base.</span></div>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {mode === "choro" && !indisponible && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "var(--t-xs)", color: "#4A5568" }}><b style={{ color: "#0B1424" }}>{indLabel}</b><span>faible</span><span style={{ width: 180, height: 10, borderRadius: 99, background: "linear-gradient(90deg, #F7EED3, #EBD594, #D9B65E, #C29433, #9A7124, #6E4F17, #43300D)" }} /><span>élevé</span></div>
              )}
              {mode === "regions" && !indisponible && <div style={{ fontSize: "var(--t-xs)", color: "#4A5568" }}>{fin ? `${niveau === "COMMUNE" ? "Chaque commune" : "Chaque département"} prend la couleur de sa région. Cliquez une zone pour afficher son profil.` : "Chaque région a sa couleur. Cliquez une région pour afficher son profil."}</div>}
              <div style={{ fontSize: "var(--t-2xs)", color: "#6B7280" }}>Limites administratives : Gouvernement du Sénégal / OCHA via geoBoundaries (CC BY 3.0 IGO)</div>
            </div>
          </section>

          <aside style={{ flex: "1 1 340px", maxWidth: 400, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {(indisponible || chargementFin || !cur) ? (
              <article className="cm-in d2" style={{ borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 22 }}>
                {chargementFin
                  ? <div style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>Chargement des {nomPluriel}…</div>
                  : <div className="tbl-vide" style={{ padding: "32px 8px" }}><b>Données non disponibles pour ce niveau</b>{AUCUNE[niveau]} : le classement et le profil ne peuvent pas être affichés.</div>}
              </article>
            ) : (<>
            <article className="cm-in d2" style={{ borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 22, display: "flex", flexDirection: "column", gap: 16, position: "relative", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: cur.color, boxShadow: "0 0 0 1px rgba(11,20,36,.12)" }} />
                  <div><div style={{ fontSize: "var(--t-xs)", fontWeight: 500, color: "#6B7280" }}>{nomSingulier}{cur.parentNom ? ` · Région de ${cur.parentNom}` : ""}</div><div style={{ fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>{cur.nom}</div></div>
                </div>
                <span className="badge sans-point">{rank === 1 ? (niveau === "DEPARTEMENT" ? "1ᵉʳ" : "1ʳᵉ") : `${rank}ᵉ`} / {sorted.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, position: "relative" }}>
                <div style={tuile}><div style={{ fontSize: "var(--t-xl)", fontWeight: 700 }}>{cur.imf}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>IMF présentes</div></div>
                <div style={tuile}><div style={{ fontSize: "var(--t-xl)", fontWeight: 700 }}>{cur.pts}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>Points de service</div></div>
                <div style={tuile}><div style={{ fontSize: "var(--t-xl)", fontWeight: 700 }}>{fmt("membres", cur.membres)}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>Membres</div></div>
                <div style={tuile}><div style={{ fontSize: "var(--t-xl)", fontWeight: 700 }}>{fmt("encours", cur.encours)}</div><div style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>Encours (Mds FCFA)</div></div>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-xs)", color: "#6B7280", marginBottom: 6 }}><span>Part nationale · {indLabel}</span><b style={{ color: "#0B1424", fontWeight: 600 }}>{(share * 100).toFixed(1).replace(".", ",")} %</b></div>
                <div style={{ height: 6, borderRadius: 99, background: "#F0EFED", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 99, background: "#C9A44C", width: `${Math.min(100, Math.max(2, Math.round(share * 100 * 2.2)))}%`, transition: "width .6s cubic-bezier(.2,.7,.2,1)" }} /></div>
              </div>
              <div style={{ fontSize: "var(--t-sm)", color: "#6B7280", position: "relative" }}>Principaux bailleurs : <span style={{ color: "#0B1424", fontWeight: 500 }}>{cur.bailleurs.length ? cur.bailleurs.join(" · ") : "—"}</span></div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
                <Link to={lienPoints} style={{ flex: 1, minWidth: 140, height: 44, borderRadius: 10, background: "#C9A44C", color: "#0B1424", fontSize: "var(--t-sm)", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Voir les points <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
                <Link to={utilisateur?.role === "CONSULTANT" ? "/consultation" : "/imf"} style={{ flex: 1, minWidth: 120, height: 44, borderRadius: 10, border: "1px solid #E7E5E4", color: "#0B1424", fontSize: "var(--t-sm)", fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>Liste des IMF</Link>
              </div>
            </article>

            <article className="cm-in d3" style={{ borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "4px 8px 10px 8px" }}><h2 style={{ margin: 0, fontSize: "var(--t-base)", fontWeight: 700 }}>Classement des {sorted.length} {nomPluriel}</h2><span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{indLabel}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, ...(sorted.length > 14 ? { maxHeight: 560, overflowY: "auto" } : {}) }}>
              {sorted.map((r, i) => (
                <button key={r.id} type="button" className="cm-row" onClick={() => choisir(r.id)} aria-pressed={r.id === cur.id} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", font: "inherit", color: "#0B1424", padding: "9px 8px", borderRadius: 10, cursor: "pointer", background: r.id === cur.id ? "#F5F5F4" : "transparent" }}>
                  <span style={{ width: 20, fontSize: "var(--t-xs)", fontWeight: 700, color: "#9AA3B2" }}>{i + 1}</span>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} />
                  <span title={r.nom} style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: "var(--t-md)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom}</span>
                  <span style={{ width: 90, height: 6, borderRadius: 99, background: "#F0EFED", overflow: "hidden" }}><span style={{ display: "block", height: "100%", borderRadius: 99, background: r.color, width: `${Math.round((100 * r[ind]) / max)}%`, transition: "width .6s ease" }} /></span>
                  <span style={{ width: 56, textAlign: "right", fontSize: "var(--t-sm)", fontWeight: 700 }}>{fmt(ind, r[ind])}</span>
                </button>
              ))}
              </div>
            </article>
            </>)}
          </aside>
        </div>
      </main>
    </AppLayout>
  );
}
