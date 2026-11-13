/**
 * Écran 05 — Espace supervision (maquette-carto-imf/ecrans/05-espace-supervision.dc.html).
 * Alertes, zones sous-desservies et qualité : API. Missions et file de validation : données fictives
 * (aucun modèle backend), signalées comme telles.
 */
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import type { Page } from "../api/types";
import { SenegalMap } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { FILE_VALIDATION, MISSIONS } from "../data/mocks";
import { SENEGAL_REGIONS, cleRegion } from "../data/senegalRegions";
import { isoJour, nombre } from "../lib/format";
import { statsParRegion, type AgregatZone } from "../lib/stats";
import { useDonnees, type Compte } from "../lib/useDonnees";

interface ImfLigne { telephone: string; email: string; a_gps: boolean; bailleurs_noms: string[] }

const seg = { border: "none", font: "inherit", fontSize: 12, fontWeight: 700, padding: "8px 12px", borderRadius: 10, cursor: "pointer" } as const;
const KB: Record<string, [string, string]> = { "Sur place": ["#E0ECF7", "#1F4E79"], Gouvernance: ["#F3ECDC", "#6E5416"], Documentaire: ["#E7F3EE", "#1F5E4F"], Terrain: ["#F6E9DD", "#7A4E2D"] };
const grille: CSSProperties = { display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.8fr 1.2fr", gap: 12 };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

export function Supervision() {
  const [zone, setZone] = useState("Kédougou");
  const [tab, setTab] = useState<keyof typeof MISSIONS>("À venir");
  const [decisions, setDecisions] = useState<Record<number, "ok" | "ko">>({});
  const dans30 = isoJour(new Date(Date.now() + 30 * 86400000));

  const { donnees: d } = useDonnees<{
    mandats30: Compte; sansGps: Compte; points: Compte; enCours: Compte; imfs: Page<ImfLigne>;
    mandats: Compte; sansJustif: Compte; zones: AgregatZone[];
  }>({
    mandats30: `/dirigeants/mandats/?date_fin__lte=${dans30}&page_size=1`,
    sansGps: "/points-service/?sans_gps=true&page_size=1",
    points: "/points-service/?page_size=1",
    enCours: "/imf/?statut_reglementaire=EN_COURS&page_size=1",
    imfs: "/imf/?page_size=1000",
    mandats: "/dirigeants/mandats/?page_size=1",
    sansJustif: "/dirigeants/mandats/?sans_justificatif=true&page_size=1",
    zones: "/cartographie/zones/agregats/?type_zone=REGION",
  });

  const n = (c?: Compte | null) => c?.count ?? 0;
  const imfs = d.imfs?.results ?? [];
  const incompletes = imfs.filter((i) => !i.telephone || !i.email || !i.a_gps).length;
  const avecBailleur = imfs.filter((i) => i.bailleurs_noms.length > 0).length;
  const stats = statsParRegion(d.zones);
  const R = SENEGAL_REGIONS.map((r) => ({ id: r.id, pts: stats[cleRegion(r.id)]?.pts ?? 0 })).sort((a, b) => a.pts - b.pts);

  const alerts = [
    { label: "Mandats expirés ou < 30 j", value: n(d.mandats30), color: "#B91C1C", bg: "#FDECEC", cta: "Relancer les IMF", to: "/dirigeants", icon: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18" },
    { label: "Points sans coordonnées GPS", value: n(d.sansGps), color: "#B45309", bg: "#FEF3C7", cta: "Géolocaliser", to: "/points-service?sans_gps=true", icon: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" },
    { label: "Fiches IMF incomplètes", value: incompletes, color: "#8A6A1F", bg: "#F3ECDC", cta: "Compléter", to: "/imf", icon: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6zM14 3v6h6" },
    { label: "IMF en cours d'agrément", value: n(d.enCours), color: "#1F4E79", bg: "#E0ECF7", cta: "Suivre les dossiers", to: "/imf?statut=EN_COURS", icon: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3z" },
  ];
  const quality = [
    { label: "Référentiel IMF", v: pct(imfs.length - incompletes, imfs.length), color: "#15803D", hint: "Contacts et position GPS du siège renseignés" },
    { label: "Points de service", v: pct(n(d.points) - n(d.sansGps), n(d.points)), color: "#C9A44C", hint: `${nombre(n(d.sansGps))} points sans coordonnées GPS` },
    { label: "Dirigeants", v: pct(n(d.mandats) - n(d.sansJustif), n(d.mandats)), color: "#B45309", hint: `Justificatifs manquants pour ${nombre(n(d.sansJustif))} mandats` },
    { label: "Bailleurs associés", v: pct(avecBailleur, imfs.length), color: "#B91C1C", hint: "Champ optionnel peu renseigné" },
  ];
  const pending = FILE_VALIDATION.filter((q) => !decisions[q.id]).length;
  const decide = (id: number, v: "ok" | "ko") => () => setDecisions({ ...decisions, [id]: v });

  return (
    <AppLayout active="supervision" minHeight={1300}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 48px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22 }}>
        <header className="su-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Division Supervision · ROLE_SUPERVISOR</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Espace supervision</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Ce qui demande votre attention aujourd'hui. <span style={{ fontWeight: 700, color: "#8A6A1F" }}>Données fictives : missions et validations.</span></p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" disabled title="Disponible prochainement" style={{ height: 46, padding: "0 18px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 14, fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "not-allowed" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>Fiche mission PDF</button>
            <button type="button" disabled title="Disponible prochainement" style={{ height: 46, padding: "0 18px", borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "not-allowed", boxShadow: "0 10px 24px rgba(201,164,76,.35)" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Préparer une mission</button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))", gap: 14 }}>
          {alerts.map((a) => (
            <article key={a.label} className="su-card su-in d1" style={{ background: "#FFFFFF", border: "1px solid #ECE5D5", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 12, position: "relative", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: a.color }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568" }}>{a.label}</span><span style={{ width: 36, height: 36, borderRadius: 11, background: a.bg, color: a.color, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={a.icon} /></svg></span></div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>{nombre(a.value)}</div>
              <Link to={a.to} style={{ fontSize: 13, fontWeight: 700, textDecoration: "none" }}>{a.cta} →</Link>
            </article>
          ))}
        </section>

        <section style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
          <article className="su-in d2" style={{ flex: "1.3 1 480px", minWidth: 0, background: "#0B1424", color: "#F4EFE3", borderRadius: 26, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Zones sous-desservies</h2><p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#A9B3C4" }}>Points de service par région : plus la région est claire, moins elle est couverte.</p></div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0B1424", background: "#F3D98C", padding: "6px 12px", borderRadius: 999 }}>{Math.min(5, R.length)} régions en alerte</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              <div className="su-carte" style={{ flex: "1.4 1 320px", minWidth: 0, height: 360 }}>
                <SenegalMap theme="dark" fillMode="choro" indicator="pts" stats={stats} selected={zone} flow showLabels={false} onPick={setZone} />
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#A9B3C4" }}>Les moins couvertes</span>
                {R.slice(0, 5).map((z) => {
                  const on = z.id === zone;
                  return (
                    <button key={z.id} type="button" aria-pressed={on} onClick={() => setZone(z.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", font: "inherit", color: "#F4EFE3", padding: "11px 12px", borderRadius: 12, cursor: "pointer", ...(on ? { background: "rgba(201,164,76,.18)", border: "1px solid rgba(201,164,76,.55)" } : { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }) }}>
                      <span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14 }}>{z.id}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#F3D98C" }}>{z.pts}</span>
                      <span style={{ fontSize: 11, color: "#A9B3C4" }}>pts</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </article>

          <article className="su-in d3" style={{ flex: "1 1 360px", minWidth: 0, background: "#FFFFFF", border: "1px solid #ECE5D5", borderRadius: 26, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Missions de supervision</h2>
              <div role="tablist" aria-label="Statut des missions" style={{ display: "flex", padding: 4, borderRadius: 12, background: "#F6F1E4" }}>
                {(Object.keys(MISSIONS) as (keyof typeof MISSIONS)[]).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => setTab(t)} style={{ ...seg, ...(t === tab ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 2px 8px rgba(11,20,36,.08)" } : { background: "transparent", color: "#6B7280" }) }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {MISSIONS[tab].map((m) => (
                <div key={m.title} style={{ display: "flex", gap: 14, padding: 14, borderRadius: 18, background: "#FAF7F0", border: "1px solid #F1ECE0" }}>
                  <div style={{ width: 52, flex: "none", borderRadius: 14, background: "#0B1424", color: "#F3D98C", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 0" }}><span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{m.day}</span><span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{m.month}</span></div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 14 }}>{m.title}</b><span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", background: KB[m.kind][0], color: KB[m.kind][1], alignSelf: "flex-start" }}>{m.kind}</span></div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{m.where} · Équipe : {m.team}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ flex: 1, height: 6, borderRadius: 99, background: "#ECE5D5", overflow: "hidden" }}><div className="su-bar" style={{ height: "100%", borderRadius: 99, background: "#C9A44C", width: m.prog }} /></div><span style={{ fontSize: 12, fontWeight: 700, color: "#4A5568" }}>{m.prog}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
          <article className="su-in d3" style={{ flex: "2 1 520px", minWidth: 0, background: "#FFFFFF", border: "1px solid #ECE5D5", borderRadius: 26, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>File de validation</h2><span style={{ fontSize: 12, fontWeight: 800, color: "#0B1424", background: "#F3D98C", padding: "5px 10px", borderRadius: 999 }}>{pending} en attente</span></div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 560, display: "flex", flexDirection: "column" }}>
                <div style={{ ...grille, padding: "0 10px 10px 10px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280", borderBottom: "1px solid #F1ECE0" }}><span>Modification</span><span>IMF</span><span>Soumis par</span><span>Date</span><span style={{ textAlign: "right" }}>Décision</span></div>
                {FILE_VALIDATION.map((q) => {
                  const dd = decisions[q.id];
                  return (
                    <div key={q.id} style={{ ...grille, alignItems: "center", padding: "12px 10px", borderBottom: "1px solid #F6F1E4", fontSize: 13 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: q.dot, flex: "none" }} />{q.what}</span>
                      <span>{q.imf}</span><span style={{ color: "#4A5568" }}>{q.who}</span><span style={{ color: "#6B7280" }}>{q.when}</span>
                      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {!dd && (<>
                          <button type="button" onClick={decide(q.id, "ko")} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 12, fontWeight: 700, color: "#B91C1C", cursor: "pointer" }}>Rejeter</button>
                          <button type="button" onClick={decide(q.id, "ok")} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "none", background: "#0B1424", font: "inherit", fontSize: 12, fontWeight: 700, color: "#F3D98C", cursor: "pointer" }}>Valider</button>
                        </>)}
                        {dd && <span style={{ fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 999, ...(dd === "ok" ? { background: "#DCFCE7", color: "#166534" } : { background: "#FDECEC", color: "#991B1B" }) }}>{dd === "ok" ? "Validé" : "Rejeté"}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>

          <article className="su-in d4" style={{ flex: "1 1 300px", minWidth: 0, background: "#FFFFFF", border: "1px solid #ECE5D5", borderRadius: 26, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Qualité des référentiels</h2>
            {quality.map((k) => (
              <div key={k.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{k.label}</span><b style={{ color: k.color }}>{k.v}%</b></div>
                <div style={{ height: 10, borderRadius: 99, background: "#F1ECE0", overflow: "hidden" }}><div className="su-bar" style={{ height: "100%", borderRadius: 99, background: k.color, width: `${k.v}%` }} /></div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 5 }}>{k.hint}</div>
              </div>
            ))}
          </article>
        </section>
      </main>
    </AppLayout>
  );
}
