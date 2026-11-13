/**
 * Écran 04 — Carte micro (maquette-carto-imf/ecrans/04-carte-micro.dc.html).
 * Types et statuts : valeurs du backend (Bureau de représentation, Suspendu).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { Page } from "../api/types";
import { SenegalMap, type PointCarte, type StatutPoint, type TypePoint } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { projeter } from "../data/projection";
import { SENEGAL_REGIONS, cleRegion } from "../data/senegalRegions";
import { useDonnees } from "../lib/useDonnees";

interface FeaturePoint {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: { nom: string; imf: string; imf_nom: string; type_point: TypePoint; statut_point: StatutPoint; region_nom: string | null; departement_nom: string | null; commune_nom: string | null; telephone: string; email: string };
}
interface PointMicro extends PointCarte { p: FeaturePoint["properties"]; lat: number; lon: number }

const TYPES: [TypePoint, string][] = [["SIEGE", "Siège social"], ["AGENCE", "Agence"], ["GUICHET", "Guichet"], ["BUREAU", "Bureau de représentation"]];
const STATUTS: [StatutPoint, string][] = [["OUVERT", "Ouvert"], ["SUSPENDU", "Suspendu"], ["FERME", "Fermé"]];
const SB: Record<StatutPoint, [string, string]> = { OUVERT: ["#DCFCE7", "#166534"], SUSPENDU: ["#FEF3C7", "#92400E"], FERME: ["#E5E7EB", "#374151"] };
const REGION_PAR_CLE = new Map(SENEGAL_REGIONS.map((r) => [cleRegion(r.id), r.id]));
const VIDE = { imf: "", region: "", type: "", statut: "", bailleur: "" };

const selectStyle: CSSProperties = { width: "100%", height: 44, borderRadius: 12, border: "1.5px solid #ECE5D5", background: "#FFFFFF", padding: "0 36px 0 14px", font: "inherit", fontSize: 14, fontWeight: 600, color: "#0B1424", cursor: "pointer" };
const tuile: CSSProperties = { padding: "10px 12px", borderRadius: 12, background: "#FAF7F0" };
const tuileLabel: CSSProperties = { fontSize: 11, color: "#6B7280", fontWeight: 700 };
const point = (bg: string, extra: CSSProperties = {}): CSSProperties => ({ width: 10, height: 10, borderRadius: "50%", background: bg, ...extra });

export function CarteMicro() {
  const [params] = useSearchParams();
  const [f, setF] = useState({ ...VIDE, region: params.get("region") ?? "" });
  const [pt, setPt] = useState<PointMicro | null>(null);
  const [detail, setDetail] = useState<{ date_ouverture: string | null; nombre_membres: number | null } | null>(null);

  const { donnees: d } = useDonnees<{ geo: { features: FeaturePoint[] }; imfs: Page<{ id: string; nom: string; sigle: string }>; bailleurs: Page<{ id: string; nom: string; sigle: string }> }>({
    geo: `/points-service/geojson/${f.bailleur ? `?bailleur=${f.bailleur}` : ""}`,
    imfs: "/imf/?page_size=1000",
    bailleurs: "/imf/bailleurs/?page_size=1000",
  });

  const points: PointMicro[] = useMemo(
    () =>
      (d.geo?.features ?? []).map((ft) => {
        const [lon, lat] = ft.geometry.coordinates;
        const p = ft.properties;
        return { id: ft.id, ...projeter(lon, lat), type: p.type_point, statut: p.statut_point, region: p.region_nom ? REGION_PAR_CLE.get(cleRegion(p.region_nom)) ?? p.region_nom : null, imf: p.imf, p, lat, lon };
      }),
    [d.geo],
  );

  // Fiche ouverte par défaut, comme dans la maquette : la première agence de Thiès.
  useEffect(() => {
    if (points.length && pt === null && !f.region) setPt(points.find((p) => p.type === "AGENCE" && p.region === "Thiès") ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  useEffect(() => {
    setDetail(null);
    if (pt) api.get<{ date_ouverture: string | null; nombre_membres: number | null }>(`/points-service/${pt.id}/`).then(setDetail).catch(() => setDetail(null));
  }, [pt]);

  const flt = { imf: f.imf, region: f.region, type: f.type, statut: f.statut };
  const vis = points.filter((p) => (!flt.type || p.type === flt.type) && (!flt.statut || p.statut === flt.statut) && (!flt.region || p.region === flt.region) && (!flt.imf || p.imf === flt.imf));
  const cnt = (s: StatutPoint) => vis.filter((p) => p.statut === s).length;
  const set = (k: keyof typeof VIDE) => (v: string) => { setF({ ...f, [k]: v }); setPt(null); };

  const filtres: { id: string; label: string; value: string; change: (v: string) => void; options: [string, string][] }[] = [
    { id: "mi-imf", label: "Institution (IMF)", value: f.imf, change: set("imf"), options: [["", "Toutes"], ...(d.imfs?.results ?? []).map((i): [string, string] => [i.id, i.sigle || i.nom])] },
    { id: "mi-reg", label: "Région", value: f.region, change: set("region"), options: [["", "Toutes"], ...SENEGAL_REGIONS.map((r): [string, string] => [r.id, r.id]).sort((a, b) => a[1].localeCompare(b[1], "fr"))] },
    { id: "mi-type", label: "Type de point", value: f.type, change: set("type"), options: [["", "Tous"], ...TYPES] },
    { id: "mi-stat", label: "Statut", value: f.statut, change: set("statut"), options: [["", "Tous"], ...STATUTS] },
    { id: "mi-bail", label: "Bailleur (option)", value: f.bailleur, change: set("bailleur"), options: [["", "Tous"], ...(d.bailleurs?.results ?? []).map((b): [string, string] => [b.id, b.sigle || b.nom])] },
  ];
  const sb = pt ? SB[pt.statut] : SB.OUVERT;
  const typeLabel = (t: TypePoint) => TYPES.find((x) => x[0] === t)![1];
  const statutLabel = (s: StatutPoint) => STATUTS.find((x) => x[0] === s)![1];

  return (
    <AppLayout active="micro">
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 32px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18 }}>
        <header className="mi-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Pilotage · Points de service</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Carte micro</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Sièges, agences, guichets et bureaux de représentation géolocalisés.</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: "#4A5568" }}><b style={{ fontSize: 22, color: "#0B1424", letterSpacing: "-0.02em" }}>{vis.length}</b> points affichés</span>
            <button type="button" onClick={() => { setF(VIDE); setPt(null); }} style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 13, fontWeight: 700, color: "#0B1424", cursor: "pointer" }}>Réinitialiser les filtres</button>
          </div>
        </header>

        <section className="mi-in d1 mi-cadre" style={{ position: "relative", flex: "1 1 auto", minHeight: 780, borderRadius: 28, background: "#FFFFFF", border: "1px solid #ECE5D5", boxShadow: "0 30px 60px -30px rgba(11,20,36,.25)", overflow: "hidden", display: "flex", flexWrap: "wrap" }}>
          <aside style={{ flex: "1 1 260px", maxWidth: 290, minWidth: 0, padding: 20, boxSizing: "border-box", borderRight: "1px solid #F1ECE0", display: "flex", flexDirection: "column", gap: 14, background: "#FDFBF6" }} className="mi-filtres">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></svg><h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Filtres</h2></div>
            {filtres.map((fl) => (
              <div key={fl.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor={fl.id} style={{ fontSize: 12, fontWeight: 700, color: "#4A5568" }}>{fl.label}</label>
                <div style={{ position: "relative" }}>
                  <select id={fl.id} className="mi-sel" value={fl.value} onChange={(e) => fl.change(e.target.value)} style={selectStyle}>
                    {fl.options.map(([v, l]) => <option key={v || "tous"} value={v}>{l}</option>)}
                  </select>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ position: "absolute", right: 12, top: 14, pointerEvents: "none" }}><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 6, padding: 14, borderRadius: 16, background: "#0B1424", color: "#F4EFE3", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#F3D98C" }}>Répartition par statut</span>
              <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", gap: 2 }}><span style={{ flex: cnt("OUVERT"), background: "#22A05A" }} /><span style={{ flex: cnt("SUSPENDU"), background: "#E0A33A" }} /><span style={{ flex: cnt("FERME"), background: "#9AA3B2" }} /></div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 10px", fontSize: 12, color: "#C8D0DC", whiteSpace: "nowrap" }}><span>Ouverts <b style={{ color: "#FFFFFF" }}>{cnt("OUVERT")}</b></span><span>Suspendus <b style={{ color: "#FFFFFF" }}>{cnt("SUSPENDU")}</b></span><span>Fermés <b style={{ color: "#FFFFFF" }}>{cnt("FERME")}</b></span></div>
            </div>
          </aside>

          <div className="mi-zone" style={{ flex: "999 1 480px", minWidth: 0, position: "relative", overflow: "hidden" }}>
            <div className="mi-carte-pos" style={{ position: "absolute", inset: 0 }}>
              <SenegalMap theme="light" fillMode="muted" flow showPoints showLabels={false} zoomSelection molette rayon={0} agrandir=".mi-cadre" selected={f.region} points={points} pointFilter={flt} selectedPoint={pt}
                onPickPoint={(p) => setPt(p as PointMicro)} onPick={(id) => { setF({ ...f, region: id }); setPt(null); }} />
            </div>

            <div className="mi-legende" style={{ position: "absolute", left: 20, bottom: 18, display: "flex", gap: 14, flexWrap: "wrap", padding: "10px 14px", borderRadius: 14, background: "rgba(255,255,255,.92)", border: "1px solid #ECE5D5", backdropFilter: "blur(10px)", boxShadow: "0 10px 24px -12px rgba(11,20,36,.35)", fontSize: 12, fontWeight: 600, color: "#1A2333", marginRight: 76, zIndex: 3 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#C9A44C", border: "2px solid #FFFFFF", boxShadow: "0 0 0 1px #C9A44C", boxSizing: "content-box" }} />Siège social</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={point("#1F4E79")} />Agence</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={point("#2E7D6B")} />Bureau de représentation</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={point("#B5763A")} />Guichet</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={point("#FFFFFF", { border: "1.5px solid #6B7280" })} />Fermé</span>
            </div>

            {pt && (
              <article key={pt.id} className="mi-sheet" style={{ position: "absolute", top: 20, right: 20, zIndex: 5, width: 330, maxWidth: "calc(100% - 40px)", boxSizing: "border-box", borderRadius: 22, background: "#FFFFFF", border: "1px solid #ECE5D5", boxShadow: "0 30px 70px -20px rgba(11,20,36,.35)", overflow: "hidden" }}>
                <div style={{ padding: "18px 18px 16px 18px", background: "#0B1424", color: "#F4EFE3", display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
                  <button type="button" aria-label="Fermer la fiche" onClick={() => setPt(null)} style={{ position: "absolute", right: 12, top: 12, width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,.08)", color: "#F4EFE3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 11, fontWeight: 800, color: "#0B1424", background: "#F3D98C", padding: "4px 10px", borderRadius: 999 }}>{typeLabel(pt.type)}</span><span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: sb[0], color: sb[1] }}>{statutLabel(pt.statut)}</span></div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", paddingRight: 30 }}>{pt.p.nom}</div>
                  <div style={{ fontSize: 13, color: "#A9B3C4" }}>{pt.p.imf_nom}{pt.region ? ` · Région de ${pt.region}` : ""}</div>
                </div>
                <div style={{ padding: "16px 18px 18px 18px", display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    <div style={tuile}><div style={tuileLabel}>Département</div><div style={{ fontWeight: 700 }}>{pt.p.departement_nom ?? "—"}</div></div>
                    <div style={tuile}><div style={tuileLabel}>Commune</div><div style={{ fontWeight: 700 }}>{pt.p.commune_nom ?? "—"}</div></div>
                    <div style={tuile}><div style={tuileLabel}>Ouverture</div><div style={{ fontWeight: 700 }}>{detail?.date_ouverture ? new Date(detail.date_ouverture).toLocaleDateString("fr-FR") : "—"}</div></div>
                    <div style={tuile}><div style={tuileLabel}>Membres</div><div style={{ fontWeight: 700 }}>{detail?.nombre_membres != null ? detail.nombre_membres.toLocaleString("fr-FR") : "—"}</div></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#4A5568" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>{pt.p.telephone || "—"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#4A5568" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>{pt.p.email || "—"}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link to={`/consultation?imf=${pt.p.imf}`} style={{ flex: 1, height: 42, borderRadius: 12, background: "#0B1424", color: "#F3D98C", fontSize: 13, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>Ouvrir la fiche IMF</Link>
                    <a href={`https://www.openstreetmap.org/directions?to=${pt.lat}%2C${pt.lon}`} target="_blank" rel="noreferrer" style={{ height: 42, padding: "0 14px", borderRadius: 12, border: "1px solid #ECE5D5", background: "#FFFFFF", fontSize: 13, fontWeight: 700, color: "#0B1424", textDecoration: "none", display: "flex", alignItems: "center", boxSizing: "border-box" }}>Itinéraire</a>
                  </div>
                </div>
              </article>
            )}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
