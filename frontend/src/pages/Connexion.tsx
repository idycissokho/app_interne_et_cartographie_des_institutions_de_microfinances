/**
 * Écran 01 — Connexion (maquette-carto-imf/ecrans/01-connexion.dc.html).
 * Page publique : la carte affiche un décor de démonstration (aucune donnée réelle sans authentification).
 */
import { useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import logo from "../assets/logo-drs-sfd.png";
import { useAuth } from "../auth/AuthContext";
import { SenegalMap, type StatsRegion } from "../components/carto/SenegalMap";
import { DEMO_POINTS, DEMO_POINTS_REGION } from "../data/demoConnexion";
import { cleRegion } from "../data/senegalRegions";

const champ = { height: 52, borderRadius: 14, border: "1.5px solid #E2DCCD", background: "#FFFFFF", padding: "0 16px", font: "inherit", fontSize: 15, color: "#0B1424" } as const;
const tuile = { flex: "1 1 160px", padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" } as const;

export function Connexion() {
  const { utilisateur, connecter } = useAuth();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [rester, setRester] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const stats = useMemo(() => {
    const s: Record<string, StatsRegion> = {};
    Object.entries(DEMO_POINTS_REGION).forEach(([id, pts]) => (s[cleRegion(id)] = { pts, imf: 0, membres: 0, encours: 0 }));
    return s;
  }, []);

  if (utilisateur) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await connecter(email, motDePasse, rester);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={{ minHeight: 900, display: "flex", flexWrap: "wrap", background: "#0B1424", color: "#F4EFE3" }}>
      <section className="ci-hero" style={{ flex: "1.25 1 640px", minWidth: 0, position: "relative", overflow: "hidden", padding: "40px 56px 40px 56px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 28, background: "radial-gradient(900px 600px at 70% 60%, #15253F 0%, #0B1424 70%)" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #E9D49A, #C9A44C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1424" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>Carto IMF</span>
              <span style={{ fontSize: 12, color: "#A9B3C4" }}>DRS-SFD · Ministère des Finances et du Budget</span>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#E9D49A", border: "1px solid rgba(201,164,76,.35)", borderRadius: 999, padding: "7px 14px" }}>Intranet · Accès restreint</span>
        </header>

        <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 2 }}>
          <h1 className="ci-up ci-titre" style={{ margin: 0, fontSize: 54, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-0.03em" }}>La microfinance du Sénégal, <span style={{ color: "#D9B65E" }}>sur une seule carte.</span></h1>
          <p className="ci-up d1" style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "#B9C2D0", maxWidth: 520 }}>Sièges, agences, caisses et guichets. Dirigeants et mandats. Indicateurs par région, département et commune. Un référentiel unique pour la supervision.</p>
        </div>

        <div className="ci-carte" style={{ position: "relative", flex: "1 1 auto", minHeight: 380 }}>
          <div className="ci-carte-fond" style={{ position: "absolute", inset: 0 }}>
            <SenegalMap ajustement="largeur" theme="dark" fillMode="muted" flow showPoints showLabels={false} stats={stats} points={DEMO_POINTS} />
          </div>
          <div className="ci-float ci-kpi" style={{ position: "absolute", right: "2%", top: "4%", width: 250, boxSizing: "border-box", padding: "16px 18px", borderRadius: 18, background: "rgba(19,33,58,.62)", border: "1px solid rgba(233,212,154,.22)", backdropFilter: "blur(14px)", boxShadow: "0 20px 50px rgba(0,0,0,.35)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#A9B3C4" }}>Points de service géolocalisés</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}><span style={{ fontSize: 34, fontWeight: 800, color: "#F3D98C", letterSpacing: "-0.02em" }}>[N]</span><span style={{ fontSize: 13, color: "#B9C2D0" }}>sur 14 régions</span></div>
            <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,.08)", marginTop: 12, overflow: "hidden" }}><div style={{ width: "78%", height: "100%", background: "linear-gradient(90deg, #C9A44C, #F3D98C)", borderRadius: 99 }} /></div>
            <div style={{ fontSize: 12, color: "#A9B3C4", marginTop: 8 }}>Couverture GPS du référentiel</div>
          </div>
        </div>

        <footer style={{ display: "flex", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
          <div style={tuile}><div style={{ fontSize: 22, fontWeight: 800, color: "#F4EFE3" }}>IMF</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>Référentiel réglementaire</div></div>
          <div style={tuile}><div style={{ fontSize: 22, fontWeight: 800, color: "#F4EFE3" }}>Dirigeants</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>PCA, DG, Gérants, comités</div></div>
          <div style={tuile}><div style={{ fontSize: 22, fontWeight: 800, color: "#F4EFE3" }}>Territoires</div><div style={{ fontSize: 12, color: "#A9B3C4" }}>Régions · Départements · Communes</div></div>
        </footer>
      </section>

      <section style={{ flex: "1 1 420px", minWidth: 0, background: "#FAF7F0", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 32px", boxSizing: "border-box" }}>
        <div className="ci-up d2" style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 28 }}>
          <img src={logo} alt="Direction de la Réglementation et de la Supervision des SFD" style={{ width: 230, height: "auto", display: "block" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>Connexion</h2>
            <p style={{ margin: 0, fontSize: 15, color: "#4A5568", lineHeight: 1.55 }}>Accédez à l'espace de cartographie et de gouvernance des institutions de microfinance.</p>
          </div>
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="ci-email" style={{ fontSize: 13, fontWeight: 700, color: "#1A2333" }}>Email professionnel</label>
              <input id="ci-email" className="ci-input" type="email" required autoComplete="username" placeholder="prenom.nom@finances.gouv.sn" value={email} onChange={(e) => setEmail(e.target.value)} style={champ} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><label htmlFor="ci-pass" style={{ fontSize: 13, fontWeight: 700, color: "#1A2333" }}>Mot de passe</label><a href="#" style={{ fontSize: 13, fontWeight: 600 }}>Mot de passe oublié ?</a></div>
              <input id="ci-pass" className="ci-input" type="password" required autoComplete="current-password" placeholder="••••••••••" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} style={champ} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#4A5568" }}><input type="checkbox" checked={rester} onChange={(e) => setRester(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#C9A44C" }} /> Rester connecté sur ce poste</label>
            {erreur && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C" }}>{erreur}</div>}
            <button className="ci-btn" type="submit" disabled={envoi} style={{ height: 54, border: "none", borderRadius: 14, background: "#C9A44C", color: "#0B1424", font: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 10px 24px rgba(201,164,76,.35)" }}>Se connecter <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
          </form>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 14, background: "#F3ECDC", color: "#5B4A1E", fontSize: 13, lineHeight: 1.5 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>Accès réservé aux agents de la DRS-SFD. Les consultations des fiches dirigeants sont journalisées.</span>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>République du Sénégal · Un Peuple – Un But – Une Foi</div>
        </div>
      </section>
    </div>
  );
}
