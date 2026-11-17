/**
 * Écran 05 — Espace supervision (maquette-carto-imf/ecrans/05-espace-supervision.dc.html).
 * Alertes, zones sous-desservies et qualité des référentiels : toutes les données viennent de l'API.
 * Les blocs « Missions » et « File de validation » de la maquette n'ont pas de modèle backend :
 * ils ne sont pas affichés (aucune donnée fictive).
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import { SenegalMap } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { SENEGAL_REGIONS, cleRegion } from "../data/senegalRegions";
import { nombre } from "../lib/format";
import { statsParRegion, type AgregatZone, URL_REGIONS, URL_STATISTIQUES, type Statistiques } from "../lib/stats";
import { Squelette } from "../components/Squelette";
import { useDonnees } from "../lib/useDonnees";


const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

export function Supervision() {
  const [zone, setZone] = useState("Kédougou");

  const { donnees: d } = useDonnees<{ stats: Statistiques; zones: AgregatZone[] }>({ stats: URL_STATISTIQUES, zones: URL_REGIONS });
  const st = d.stats;
  const totalImf = st?.imf.total ?? 0;
  const incompletes = st?.imf.incompletes ?? 0;
  const avecBailleur = st?.imf.avec_bailleur ?? 0;
  const points = st?.points.total ?? 0;
  const sansGps = st?.points.sans_gps ?? 0;
  const mandats = st?.mandats.total ?? 0;
  const sansJustif = st?.mandats.sans_justificatif ?? 0;
  const stats = statsParRegion(d.zones);
  const R = SENEGAL_REGIONS.map((r) => ({ id: r.id, pts: stats[cleRegion(r.id)]?.pts ?? 0 })).sort((a, b) => a.pts - b.pts);

  const alerts = [
    { label: "Mandats expirés ou < 30 j", value: (st?.mandats.echeance_30j ?? 0), color: "#B91C1C", bg: "#FDECEC", cta: "Relancer les IMF", to: "/dirigeants?alerte=echeance", icon: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18" },
    { label: "Points sans coordonnées GPS", value: sansGps, color: "#B45309", bg: "#FEF3C7", cta: "Géolocaliser", to: "/points-service?sans_gps=true", icon: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" },
    { label: "Fiches IMF incomplètes", value: incompletes, color: "#8A6A1F", bg: "#F5F5F4", cta: "Compléter", to: "/imf", icon: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6zM14 3v6h6" },
    { label: "IMF en cours d'agrément", value: (st?.imf.en_cours ?? 0), color: "#1F4E79", bg: "#E0ECF7", cta: "Suivre les dossiers", to: "/imf?statut=EN_COURS", icon: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3z" },
  ];
  const quality = [
    { label: "Référentiel IMF", v: pct(totalImf - incompletes, totalImf), color: "#15803D", hint: "Contacts et position GPS du siège renseignés" },
    { label: "Points de service", v: pct(points - sansGps, points), color: "#C9A44C", hint: `${nombre(sansGps)} points sans coordonnées GPS` },
    { label: "Dirigeants", v: pct(mandats - sansJustif, mandats), color: "#B45309", hint: `Justificatifs manquants pour ${nombre(sansJustif)} mandats` },
    { label: "Bailleurs associés", v: pct(avecBailleur, totalImf), color: "#B91C1C", hint: "Champ optionnel peu renseigné" },
  ];

  return (
    <AppLayout active="supervision" minHeight={1300}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 48px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22 }}>
        <header className="su-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Division Supervision</span>
            <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Espace supervision</h1>
            <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Ce qui demande votre attention aujourd'hui.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" disabled title="Disponible prochainement" style={{ height: 46, padding: "0 18px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "not-allowed" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>Fiche mission PDF</button>
            <button type="button" disabled title="Disponible prochainement" style={{ height: 46, padding: "0 18px", borderRadius: 10, border: "none", background: "#C9A44C", font: "inherit", fontSize: "var(--t-md)", fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "not-allowed" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Préparer une mission</button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))", gap: 14 }}>
          {alerts.map((a) => (
            <article key={a.label} className="su-card su-in d1" style={{ background: "#FFFFFF", border: "1px solid #E7E5E4", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, position: "relative", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "#4A5568" }}>{a.label}</span><span style={{ width: 32, height: 32, borderRadius: 8, color: a.color, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={a.icon} /></svg></span></div>
              <div style={{ fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>{st ? nombre(a.value) : <Squelette largeur={64} hauteur={34} />}</div>
              <Link to={a.to} style={{ fontSize: "var(--t-sm)", fontWeight: 600, textDecoration: "none" }}>{a.cta} →</Link>
            </article>
          ))}
        </section>

        <section style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
          <article className="su-in d2" style={{ flex: "1.3 1 480px", minWidth: 0, background: "#FFFFFF", border: "1px solid #E7E5E4", borderRadius: 12, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div><h2 style={{ margin: 0, fontSize: "var(--t-lg)", fontWeight: 700 }}>Zones sous-desservies</h2><p style={{ margin: "4px 0 0 0", fontSize: "var(--t-sm)", color: "#6B7280" }}>Points de service par région : plus la région est claire, moins elle est couverte.</p></div>
              <span className="badge badge-alerte">{Math.min(5, R.length)} régions en alerte</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              <div className="su-carte" style={{ flex: "1.4 1 320px", minWidth: 0, height: 360 }}>
                <SenegalMap theme="light" fillMode="choro" indicator="pts" stats={stats} selected={zone} flow showLabels={false} onPick={setZone} />
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: "var(--t-xs)", fontWeight: 500, color: "#6B7280" }}>Les moins couvertes</span>
                {R.slice(0, 5).map((z) => {
                  const on = z.id === zone;
                  return (
                    <button key={z.id} type="button" aria-pressed={on} onClick={() => setZone(z.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", font: "inherit", color: "#0B1424", padding: "10px 12px", borderRadius: 8, cursor: "pointer", ...(on ? { background: "#FAFAF9", border: "1px solid #C9A44C" } : { background: "#FFFFFF", border: "1px solid #E7E5E4" }) }}>
                      <span style={{ flex: 1, textAlign: "left", fontWeight: 600, fontSize: "var(--t-md)" }}>{z.id}</span>
                      <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{z.pts}</span>
                      <span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>pts</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </article>

          <article className="su-in d3" style={{ flex: "1 1 360px", minWidth: 0, background: "#FFFFFF", border: "1px solid #E7E5E4", borderRadius: 12, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: "var(--t-lg)", fontWeight: 700 }}>Qualité des référentiels</h2>
            {quality.map((k) => (
              <div key={k.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-sm)", marginBottom: 6 }}><span style={{ fontWeight: 500 }}>{k.label}</span><b style={{ color: k.color }}>{k.v}%</b></div>
                <div style={{ height: 6, borderRadius: 99, background: "#F0EFED", overflow: "hidden" }}><div className="su-bar" style={{ height: "100%", borderRadius: 99, background: k.color, width: `${k.v}%` }} /></div>
                <div style={{ fontSize: "var(--t-xs)", color: "#6B7280", marginTop: 5 }}>{k.hint}</div>
              </div>
            ))}
          </article>
        </section>
      </main>
    </AppLayout>
  );
}
