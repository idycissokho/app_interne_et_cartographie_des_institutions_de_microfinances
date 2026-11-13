/**
 * Écran 03 — Carte macro (maquette-carto-imf/ecrans/03-carte-macro.dc.html).
 * Le sélecteur Régions / Départements / Communes est visuel, comme dans la maquette.
 */
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { SenegalMap, type Indicateur } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { SENEGAL_REGIONS, cleRegion } from "../data/senegalRegions";
import { telechargerCsv } from "../lib/csv";
import { nombre } from "../lib/format";
import { statsParRegion, type AgregatZone } from "../lib/stats";
import { useDonnees, type Compte } from "../lib/useDonnees";

const IND: { k: Indicateur; label: string }[] = [
  { k: "pts", label: "Points de service" }, { k: "imf", label: "IMF" }, { k: "membres", label: "Membres" }, { k: "encours", label: "Encours" },
];
const fmt = (k: Indicateur, v: number) => {
  if (k === "membres") return v >= 1000 ? Math.round(v / 1000) + " k" : String(v);
  if (k === "encours") return v.toFixed(1).replace(".", ",");
  return String(v);
};
const seg = { border: "none", font: "inherit", fontSize: 13, fontWeight: 700, padding: "9px 14px", borderRadius: 10, cursor: "pointer" } as const;
const pill = { font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 999, cursor: "pointer" } as const;
const kp = { borderRadius: 18, padding: "16px 18px" } as const;
const tuile: CSSProperties = { padding: 14, borderRadius: 16, background: "rgba(255,255,255,.06)" };

export function CarteMacro() {
  const { utilisateur, estAdmin } = useAuth();
  const [sel, setSel] = useState("Dakar");
  const [ind, setInd] = useState<Indicateur>("pts");
  const [mode, setMode] = useState<"regions" | "choro">("regions");
  const [level, setLevel] = useState("Régions");
  const { donnees: d } = useDonnees<{ zones: AgregatZone[]; imf: Compte }>({ zones: "/cartographie/zones/agregats/?type_zone=REGION", imf: "/imf/?page_size=1" });

  const stats = statsParRegion(d.zones);
  const parCle = new Map((d.zones ?? []).map((z) => [cleRegion(z.nom), z]));
  const R = SENEGAL_REGIONS.map((g) => ({ id: g.id, color: g.color, ...(stats[cleRegion(g.id)] ?? { pts: 0, imf: 0, membres: 0, encours: 0 }), bailleurs: parCle.get(cleRegion(g.id))?.principaux_bailleurs ?? [] }));
  const sum = (k: Indicateur) => R.reduce((a, r) => a + r[k], 0);
  const total = sum(ind) || 1;
  const max = Math.max(...R.map((r) => r[ind])) || 1;
  const sorted = R.slice().sort((a, b) => b[ind] - a[ind]);
  const cur = R.find((r) => r.id === sel) ?? R[0];
  const rank = sorted.indexOf(cur) + 1;
  const share = cur[ind] / total;
  const indLabel = IND.find((i) => i.k === ind)!.label;

  const kpis = [
    { label: "IMF présentes", value: nombre(d.imf?.count ?? 0), style: { ...kp, background: "#0B1424", color: "#F4EFE3" }, sub: "#F3D98C" },
    { label: "Points de service", value: nombre(sum("pts")), style: { ...kp, background: "#FFFFFF", border: "1px solid #ECE5D5" }, sub: "#8A6A1F" },
    { label: "Membres", value: (sum("membres") / 1e6).toFixed(2).replace(".", ",") + " M", style: { ...kp, background: "#FFFFFF", border: "1px solid #ECE5D5" }, sub: "#8A6A1F" },
    { label: "Encours (Mds FCFA)", value: sum("encours").toFixed(0), style: { ...kp, background: "#FFFFFF", border: "1px solid #ECE5D5" }, sub: "#8A6A1F" },
  ];

  const exporter = () =>
    telechargerCsv("carte_macro_regions.csv", [
      ["Rang", "Région", "IMF présentes", "Points de service", "Membres", "Encours (Mds FCFA)", "Principaux bailleurs"],
      ...sorted.map((r, i) => [i + 1, r.id, r.imf, r.pts, r.membres, r.encours.toFixed(2).replace(".", ","), r.bailleurs.join(" · ")]),
    ]);

  return (
    <AppLayout active="macro">
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="cm-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Pilotage · Vision territoriale</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Carte macro du secteur</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Agrégats par zone : IMF présentes, points de service, membres, encours.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div role="group" aria-label="Niveau territorial" style={{ display: "flex", padding: 5, borderRadius: 14, background: "#FFFFFF", border: "1px solid #ECE5D5" }}>
              {["Régions", "Départements", "Communes"].map((l) => (
                <button key={l} type="button" aria-pressed={l === level} onClick={() => setLevel(l)} style={{ ...seg, ...(l === level ? { background: "#0B1424", color: "#F3D98C" } : { background: "transparent", color: "#4A5568" }) }}>{l}</button>
              ))}
            </div>
            {estAdmin && <button type="button" onClick={exporter} style={{ height: 46, padding: "0 18px", borderRadius: 14, border: "none", background: "#0B1424", color: "#F3D98C", font: "inherit", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Exporter</button>}
          </div>
        </header>

        <section className="cm-in d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap: 14 }}>
          {kpis.map((k) => (
            <div key={k.label} style={k.style}>
              <div style={{ fontSize: 12, fontWeight: 700, color: k.sub }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </section>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <section className="cm-in d2" style={{ flex: "999 1 560px", minWidth: 0, position: "relative", borderRadius: 28, background: "#FFFFFF", border: "1px solid #ECE5D5", boxShadow: "0 30px 60px -30px rgba(11,20,36,.25)", padding: 20, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
              <div role="group" aria-label="Mode de coloration" style={{ display: "flex", padding: 4, borderRadius: 12, background: "#F6F1E4" }}>
                {([{ k: "regions", label: "Par région" }, { k: "choro", label: "Par indicateur" }] as const).map((m) => (
                  <button key={m.k} type="button" aria-pressed={m.k === mode} onClick={() => setMode(m.k)} style={{ ...seg, ...(m.k === mode ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 2px 8px rgba(11,20,36,.08)" } : { background: "transparent", color: "#6B7280" }) }}>{m.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {IND.map((i) => (
                  <button key={i.k} type="button" aria-pressed={i.k === ind} onClick={() => { setInd(i.k); setMode("choro"); }} style={{ ...pill, ...(i.k === ind ? { background: "#C9A44C", color: "#0B1424", border: "1px solid #C9A44C" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #ECE5D5" }) }}>{i.label}</button>
                ))}
              </div>
            </div>

            <div className="cm-carte" style={{ height: 600, position: "relative", backgroundImage: "radial-gradient(#EFE7D3 1px, transparent 1px)", backgroundSize: "18px 18px", borderRadius: 20 }}>
              <SenegalMap theme="light" fillMode={mode} indicator={ind} stats={stats} selected={sel} flow showLabels={false} onPick={setSel} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {mode === "choro" && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#4A5568" }}><b style={{ color: "#0B1424" }}>{indLabel}</b><span>faible</span><span style={{ width: 180, height: 10, borderRadius: 99, background: "linear-gradient(90deg, #F7EED3, #EBD594, #D9B65E, #C29433, #9A7124, #6E4F17, #43300D)" }} /><span>élevé</span></div>
              )}
              {mode === "regions" && <div style={{ fontSize: 12, color: "#4A5568" }}>Chaque région a sa couleur. Cliquez une région pour afficher son profil.</div>}
              <div style={{ fontSize: 11, color: "#6B7280" }}>Limites administratives : Gouvernement du Sénégal / OCHA via geoBoundaries (CC BY 3.0 IGO)</div>
            </div>
          </section>

          <aside style={{ flex: "1 1 340px", maxWidth: 400, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <article className="cm-in d2" style={{ borderRadius: 24, background: "#0B1424", color: "#F4EFE3", padding: 22, display: "flex", flexDirection: "column", gap: 16, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: "50%", background: cur.color, opacity: 0.35, filter: "blur(30px)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 14, height: 40, borderRadius: 6, background: cur.color }} />
                  <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#F3D98C" }}>Région</div><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{cur.id}</div></div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#0B1424", background: "#F3D98C", padding: "6px 10px", borderRadius: 999 }}>{rank}ᵉ / 14</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, position: "relative" }}>
                <div style={tuile}><div style={{ fontSize: 24, fontWeight: 800 }}>{cur.imf}</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>IMF présentes</div></div>
                <div style={tuile}><div style={{ fontSize: 24, fontWeight: 800 }}>{cur.pts}</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>Points de service</div></div>
                <div style={tuile}><div style={{ fontSize: 24, fontWeight: 800 }}>{fmt("membres", cur.membres)}</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>Membres</div></div>
                <div style={tuile}><div style={{ fontSize: 24, fontWeight: 800 }}>{fmt("encours", cur.encours)}</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>Encours (Mds FCFA)</div></div>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#A9B3C4", marginBottom: 6 }}><span>Part nationale · {indLabel}</span><b style={{ color: "#F3D98C" }}>{(share * 100).toFixed(1).replace(".", ",")} %</b></div>
                <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,.08)", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #C9A44C, #F3D98C)", width: `${Math.min(100, Math.max(2, Math.round(share * 100 * 2.2)))}%`, transition: "width .6s cubic-bezier(.2,.7,.2,1)" }} /></div>
              </div>
              <div style={{ fontSize: 13, color: "#A9B3C4", position: "relative" }}>Principaux bailleurs : <span style={{ color: "#F4EFE3", fontWeight: 600 }}>{cur.bailleurs.length ? cur.bailleurs.join(" · ") : "—"}</span></div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
                <Link to={`/carte/micro?region=${encodeURIComponent(cur.id)}`} style={{ flex: 1, minWidth: 140, height: 44, borderRadius: 12, background: "#C9A44C", color: "#0B1424", fontSize: 13, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Voir les points <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
                <Link to={utilisateur?.role === "CONSULTANT" ? "/consultation" : "/imf"} style={{ flex: 1, minWidth: 120, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,.18)", color: "#F4EFE3", fontSize: 13, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>Liste des IMF</Link>
              </div>
            </article>

            <article className="cm-in d3" style={{ borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 8px 10px 8px" }}><h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Classement des 14 régions</h2><span style={{ fontSize: 12, color: "#6B7280" }}>{indLabel}</span></div>
              {sorted.map((r, i) => (
                <button key={r.id} type="button" className="cm-row" onClick={() => setSel(r.id)} aria-pressed={r.id === sel} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", font: "inherit", color: "#0B1424", padding: "9px 8px", borderRadius: 12, cursor: "pointer", background: r.id === sel ? "#F3ECDC" : "transparent" }}>
                  <span style={{ width: 20, fontSize: 12, fontWeight: 800, color: "#9AA3B2" }}>{i + 1}</span>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} />
                  <span style={{ flex: 1, textAlign: "left", fontSize: 14, fontWeight: 600 }}>{r.id}</span>
                  <span style={{ width: 90, height: 6, borderRadius: 99, background: "#F1ECE0", overflow: "hidden" }}><span style={{ display: "block", height: "100%", borderRadius: 99, background: r.color, width: `${Math.round((100 * r[ind]) / max)}%`, transition: "width .6s ease" }} /></span>
                  <span style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: 800 }}>{fmt(ind, r[ind])}</span>
                </button>
              ))}
            </article>
          </aside>
        </div>
      </main>
    </AppLayout>
  );
}
