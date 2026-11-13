/**
 * Écran 02 — Tableau de bord (maquette-carto-imf/ecrans/02-tableau-de-bord.dc.html).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SenegalMap } from "../components/carto/SenegalMap";
import { AppLayout } from "../components/layout/AppLayout";
import { CODE_FONCTION, dateLongue, ilYa, isoJour, joursAvant, nombre, pourcent } from "../lib/format";
import { statsParRegion, type AgregatZone } from "../lib/stats";
import { useDonnees, type Compte } from "../lib/useDonnees";

interface MandatEcheance { id: string; fonction_mandat: string; dirigeant_nom_complet: string; imf_sigle: string; imf_nom: string; imf_region: string | null; date_fin: string }
interface EntreeAudit { id: string; action: string; role: string; date_action: string; utilisateur_email: string | null; details: { libelle?: string } }
interface Import { id: string; type_import: string; statut: string; nb_lignes_importees: number; utilisateur_email: string; date_creation: string }

const carte: CSSProperties = { background: "#FFFFFF", border: "1px solid #ECE5D5", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14 };
const icone: CSSProperties = { width: 38, height: 38, borderRadius: 12, background: "#F3ECDC", color: "#8A6A1F", display: "flex", alignItems: "center", justifyContent: "center" };
const bloc: CSSProperties = { minWidth: 0, background: "#FFFFFF", border: "1px solid #ECE5D5", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column" };
const h2: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 800 };

const svg = (enfants: ReactNode, sw = "2") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{enfants}</svg>
);

const LIBELLE_ACTION: Record<string, string> = {
  CREATION: "Création", MODIFICATION: "Modification", SUPPRESSION: "Désactivation", CONSULTATION: "Fiche dirigeant consultée",
  CONNEXION: "Connexion", DECONNEXION: "Déconnexion", CHANGEMENT_MOT_DE_PASSE: "Mot de passe modifié",
  IMPORTATION: "Import", EXPORTATION: "Export",
};
const PASTILLE_ACTION: Record<string, string> = { IMPORTATION: "#C9A44C", CONSULTATION: "#0B1424", MODIFICATION: "#15803D", CREATION: "#15803D", SUPPRESSION: "#B91C1C" };
const LIBELLE_IMPORT: Record<string, string> = { IMF: "institutions", POINTS_SERVICE: "points de service", DIRIGEANTS: "dirigeants" };

export function TableauDeBord() {
  const { utilisateur, estAdmin, peutEcrire } = useAuth();
  const naviguer = useNavigate();
  const recherche = useRef<HTMLInputElement>(null);
  const auj = new Date();
  const dans90 = new Date(Date.now() + 90 * 86400000);
  const janvier = `${auj.getFullYear()}-01-01`;

  const { donnees: d } = useDonnees<{
    agreees: Compte; agreeesAn: Compte; imfTotal: Compte; enCours: Compte; radiees: Compte;
    mutuelles: Compte; coops: Compte; sa: Compte;
    points: Compte; sansGps: Compte; dirigeants: Compte; echeances: Page<MandatEcheance>;
    regions: AgregatZone[]; communes: AgregatZone[]; audit: Page<EntreeAudit>; imports: Page<Import>;
  }>({
    agreees: "/imf/?statut_reglementaire=AGREE&page_size=1",
    agreeesAn: `/imf/?statut_reglementaire=AGREE&date_creation__gte=${janvier}&page_size=1`,
    imfTotal: "/imf/?page_size=1",
    enCours: "/imf/?statut_reglementaire=EN_COURS&page_size=1",
    radiees: "/imf/?statut_reglementaire=RADIEE&page_size=1",
    mutuelles: "/imf/?type_imf=MUTUELLE&page_size=1",
    coops: "/imf/?type_imf=COOPERATIVE&page_size=1",
    sa: "/imf/?type_imf=SA&page_size=1",
    points: "/points-service/?page_size=1",
    sansGps: "/points-service/?sans_gps=true&page_size=1",
    dirigeants: "/dirigeants/?mandats__statut_mandat=EN_FONCTION&page_size=1",
    echeances: `/dirigeants/mandats/?date_fin__gte=${isoJour(auj)}&date_fin__lte=${isoJour(dans90)}&ordering=date_fin&page_size=4`,
    regions: "/cartographie/zones/agregats/?type_zone=REGION",
    communes: "/cartographie/zones/agregats/?type_zone=COMMUNE",
    audit: estAdmin ? "/audit/?page_size=3" : null,
    imports: !estAdmin && peutEcrire ? "/importation/?page_size=3" : null,
  });

  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        recherche.current?.focus();
      }
    };
    window.addEventListener("keydown", raccourci);
    return () => window.removeEventListener("keydown", raccourci);
  }, []);

  const n = (c?: Compte | null) => c?.count ?? 0;
  const totalImf = n(d.imfTotal) || 1;
  const totalPoints = n(d.points);
  const geoloc = totalPoints ? (100 * (totalPoints - n(d.sansGps))) / totalPoints : 0;
  const communes = d.communes ?? [];
  const couvertes = communes.filter((c) => c.nb_points_service > 0).length;
  const types = [
    { label: "Mutuelles d'épargne et de crédit", v: n(d.mutuelles) },
    { label: "Coopératives", v: n(d.coops) },
    { label: "Sociétés anonymes", v: n(d.sa) },
  ];
  types.push({ label: "Autres", v: Math.max(0, n(d.imfTotal) - types.reduce((a, t) => a + t.v, 0)) });
  const statuts = [
    { label: "Agréées", v: n(d.agreees), c: "#15803D" },
    { label: "En cours d'agrément", v: n(d.enCours), c: "#D97706" },
    { label: "Retraits / radiations", v: n(d.radiees), c: "#B91C1C" },
  ];
  const echeances = d.echeances?.results ?? [];
  const urgent = echeances.some((m) => joursAvant(m.date_fin) <= 30);

  const activite = estAdmin
    ? (d.audit?.results ?? []).map((e) => ({
        id: e.id, dot: PASTILLE_ACTION[e.action] ?? "#C9A44C", titre: LIBELLE_ACTION[e.action] ?? e.action,
        detail: e.details.libelle || "", meta: `${e.utilisateur_email ?? "Système"} · ${ilYa(e.date_action)}`,
      }))
    : (d.imports?.results ?? []).map((i) => ({
        id: i.id, dot: i.statut === "ECHEC" ? "#B91C1C" : "#C9A44C", titre: "Import " + (i.type_import === "IMF" ? "IMF" : "CSV"),
        detail: `${nombre(i.nb_lignes_importees)} ${LIBELLE_IMPORT[i.type_import]} importés`, meta: `${i.utilisateur_email} · ${ilYa(i.date_creation)}`,
      }));

  return (
    <AppLayout active="dashboard" minHeight={1240}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 36px 48px 36px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <form onSubmit={(e) => { e.preventDefault(); const q = recherche.current?.value.trim(); naviguer(`/consultation${q ? `?q=${encodeURIComponent(q)}` : ""}`); }}
            style={{ flex: "1 1 320px", display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 16px", borderRadius: 14, background: "#FFFFFF", border: "1px solid #ECE5D5", color: "#6B7280", boxSizing: "border-box" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={recherche} type="search" aria-label="Recherche globale" placeholder="Rechercher une IMF, un dirigeant, une commune…" style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 14, flex: 1, minWidth: 0, color: "#0B1424" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#8A6A1F", background: "#F3ECDC", padding: "4px 8px", borderRadius: 8 }}>⌘ K</span>
          </form>
          {peutEcrire && (
            <button type="button" onClick={() => naviguer("/donnees?onglet=export")} style={{ height: 48, padding: "0 18px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 14, fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>Exporter
            </button>
          )}
          {peutEcrire && (
            <button type="button" onClick={() => naviguer("/imf/nouveau")} style={{ height: 48, padding: "0 18px", borderRadius: 14, border: "none", background: "#0B1424", font: "inherit", fontSize: 14, fontWeight: 700, color: "#F3D98C", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouvelle IMF
            </button>
          )}
          <button type="button" aria-label="Notifications" title={urgent ? "Des mandats expirent sous 30 jours" : "Aucune alerte"} onClick={() => naviguer("/dirigeants")} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer", color: "#0B1424" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" /></svg>
            {urgent && <span style={{ position: "absolute", top: 11, right: 12, width: 8, height: 8, borderRadius: "50%", background: "#C2410C" }} />}
          </button>
        </div>

        <section className="tb-up" style={{ position: "relative", overflow: "hidden", borderRadius: 24, background: "#0B1424", color: "#F4EFE3", padding: "30px 32px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
          <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.5 }}><defs><pattern id="tbDots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="1.2" fill="#C9A44C" fillOpacity=".35" /></pattern></defs><rect width="100%" height="100%" fill="url(#tbDots)" /></svg>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#F3D98C" }}>{dateLongue(auj)}</span>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em" }}>Bonjour, {utilisateur?.prenom}</h1>
            <p style={{ margin: 0, fontSize: 15, color: "#B9C2D0" }}>Voici l'état du secteur de la microfinance aujourd'hui.</p>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 16 }}>
          <article className="tb-card tb-up d1" style={carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568" }}>IMF agréées</span><span style={icone}>{svg(<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />)}</span></div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>{nombre(n(d.agreees))}</div>
            <div style={{ fontSize: 13, color: "#15803D", fontWeight: 700 }}>+{nombre(n(d.agreeesAn))} <span style={{ color: "#6B7280", fontWeight: 500 }}>depuis janvier</span></div>
          </article>
          <article className="tb-card tb-up d2" style={carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568" }}>Points de service</span><span style={icone}>{svg(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>)}</span></div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>{nombre(totalPoints)}</div>
            <div style={{ fontSize: 13, color: "#6B7280" }}>dont <b style={{ color: "#0B1424" }}>{pourcent(geoloc)}</b> géolocalisés</div>
          </article>
          <article className="tb-card tb-up d3" style={carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568" }}>Dirigeants en fonction</span><span style={icone}>{svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></>)}</span></div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>{nombre(n(d.dirigeants))}</div>
            <div style={{ fontSize: 13, color: "#B45309", fontWeight: 700 }}>{nombre(d.echeances?.count ?? 0)} mandats <span style={{ color: "#6B7280", fontWeight: 500 }}>expirent sous 90 j</span></div>
          </article>
          <article className="tb-card tb-up d4" style={carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568" }}>Communes couvertes</span><span style={icone}>{svg(<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />)}</span></div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>{nombre(couvertes)} <span style={{ fontSize: 18, color: "#6B7280", fontWeight: 600 }}>/ {nombre(communes.length)}</span></div>
            <div style={{ height: 6, borderRadius: 99, background: "#F1ECE0", overflow: "hidden" }}><div className="tb-bar" style={{ width: `${communes.length ? Math.round((100 * couvertes) / communes.length) : 0}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #C9A44C, #E9C76A)" }} /></div>
          </article>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 16 }}>
          <article className="tb-up d2 tb-presence" style={{ gridColumn: "span 2", minWidth: 0, background: "#0E1A2D", color: "#F4EFE3", borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div><h2 style={h2}>Présence territoriale</h2><p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#A9B3C4" }}>Points de service par région</p></div>
              <Link to="/carte/macro" style={{ fontSize: 13, fontWeight: 700, color: "#F3D98C", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>Ouvrir la carte macro <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
            </div>
            <div className="tb-carte" style={{ height: 400 }}>
              <SenegalMap theme="dark" fillMode="choro" indicator="pts" flow showLabels={false} stats={statsParRegion(d.regions)} onPick={() => naviguer("/carte/macro")} />
            </div>
          </article>

          <article className="tb-up d3" style={{ ...bloc, gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={h2}>Mandats à renouveler</h2><span style={{ fontSize: 12, fontWeight: 700, color: "#B45309", background: "#FEF3C7", padding: "5px 10px", borderRadius: 999 }}>90 jours</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {echeances.map((m, i) => {
                const j = joursAvant(m.date_fin);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < echeances.length - 1 ? "1px solid #F1ECE0" : undefined }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{CODE_FONCTION[m.fonction_mandat] ?? m.fonction_mandat}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{m.dirigeant_nom_complet}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{m.imf_sigle || m.imf_nom}{m.imf_region ? ` · ${m.imf_region}` : ""}</div></div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: j <= 30 ? "#B91C1C" : j <= 60 ? "#B45309" : "#4A5568" }}>{j} j</span>
                  </div>
                );
              })}
              {d.echeances && echeances.length === 0 && <div style={{ fontSize: 13, color: "#6B7280", padding: "12px 0" }}>Aucun mandat n'expire dans les 90 jours.</div>}
            </div>
            <Link to="/dirigeants" style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Voir tous les mandats →</Link>
          </article>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 16 }}>
          <article className="tb-up d2" style={{ ...bloc, gap: 16 }}>
            <h2 style={h2}>IMF par type</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {types.map((t) => (
                <div key={t.label}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{t.label}</span><b>{nombre(t.v)}</b></div><div style={{ height: 10, borderRadius: 99, background: "#F1ECE0" }}><div className="tb-bar" style={{ width: `${Math.round((100 * t.v) / totalImf)}%`, height: "100%", borderRadius: 99, background: "#0B1424" }} /></div></div>
              ))}
            </div>
          </article>

          <article className="tb-up d3" style={{ ...bloc, gap: 16 }}>
            <h2 style={h2}>Statut réglementaire</h2>
            <div style={{ display: "flex", height: 16, borderRadius: 99, overflow: "hidden", gap: 3 }}>
              {statuts.map((s) => <div key={s.label} className="tb-bar" style={{ flex: s.v, background: s.c }} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
              {statuts.map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: s.c }} /><span style={{ flex: 1 }}>{s.label}</span><b>{pourcent((100 * s.v) / totalImf)}</b></div>
              ))}
            </div>
          </article>

          <article className="tb-up d4" style={{ ...bloc, gap: 14 }}>
            <h2 style={h2}>Activité récente</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
              {activite.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 12 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: a.dot, marginTop: 5, flex: "none" }} /><div><b>{a.titre}</b>{a.detail && ` · ${a.detail}`}<div style={{ color: "#6B7280", marginTop: 2 }}>{a.meta}</div></div></div>
              ))}
              {activite.length === 0 && <div style={{ color: "#6B7280" }}>Aucune activité récente.</div>}
            </div>
            <Link to={estAdmin ? "/audit" : "/donnees"} style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>{estAdmin ? "Journal d'audit complet →" : "Historique des imports →"}</Link>
          </article>
        </section>
      </main>
    </AppLayout>
  );
}
