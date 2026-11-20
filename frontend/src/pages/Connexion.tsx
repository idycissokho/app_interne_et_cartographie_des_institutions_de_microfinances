/**
 * Écran 01 — Connexion (maquette-carto-imf/ecrans/01-connexion.dc.html).
 * - Tient dans la hauteur de la fenêtre, sans défilement (à partir de 1060 × 560 px, colonnes côte à côte) :
 *   tailles et espacements en clamp(…, vh, valeur de la maquette) — identiques à 900 px de haut.
 * - Thème clair (maquette, par défaut) / sombre sur demande, choix mémorisé.
 * - Page publique : la carte est un décor de démonstration (aucune donnée réelle sans authentification).
 */
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";

import logo from "../assets/logo-drs-sfd.png";
import { useAuth } from "../auth/AuthContext";
import { session } from "../auth/session";
import { SenegalMap, type StatsRegion } from "../components/carto/SenegalMap";
import { DEMO_POINTS, DEMO_POINTS_REGION } from "../data/demoConnexion";
import { cleRegion } from "../data/senegalRegions";

type Theme = "clair" | "sombre";
const CLE_THEME = "imf.theme";

/** Couleurs du panneau de connexion selon le thème (le clair = la maquette). */
const P: Record<Theme, Record<string, string>> = {
  clair: { fond: "#FFFFFF", texte: "#0B1424", label: "#1A2333", doux: "#4A5568", pied: "#6B7280", champ: "#FFFFFF", bord: "#D6D3D1", encartFond: "#F5F5F4", encartTexte: "#5B4A1E", lien: "#8A6A1F", bouton: "#FFFFFF", boutonBord: "#E7E5E4" },
  sombre: { fond: "#0F1A2E", texte: "#F4EFE3", label: "#DCE2EC", doux: "#A9B3C4", pied: "#8E99AB", champ: "#13213A", bord: "#2A3A57", encartFond: "rgba(201,164,76,.12)", encartTexte: "#F3D98C", lien: "#F3D98C", bouton: "#13213A", boutonBord: "#2A3A57" },
};

function themeInitial(): Theme {
  try {
    const t = localStorage.getItem(CLE_THEME);
    if (t === "clair" || t === "sombre") return t;
  } catch { /* stockage indisponible */ }
  // Par défaut : blanc et or, comme la maquette (le sombre n'est appliqué que sur demande).
  return "clair";
}

const tuile: CSSProperties = { flex: "1 1 160px", padding: "clamp(10px, 1.6vh, 14px) 16px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" };

export function Connexion() {
  const { utilisateur, connecter } = useAuth();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [rester, setRester] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Déconnexion automatique précédente : expliquée une fois, au-dessus du formulaire.
  const [motif] = useState(() => session.lireMotif());
  useEffect(() => { session.oublierMotif(); }, []);
  const [theme, setTheme] = useState<Theme>(themeInitial);
  const c = P[theme];
  const stats = useMemo(() => {
    const s: Record<string, StatsRegion> = {};
    Object.entries(DEMO_POINTS_REGION).forEach(([id, pts]) => (s[cleRegion(id)] = { pts, imf: 0, membres: 0, encours: 0 }));
    return s;
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CLE_THEME, theme); } catch { /* stockage indisponible */ }
  }, [theme]);

  if (utilisateur) return <Navigate to="/tableau-de-bord" replace />;

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

  const champ: CSSProperties = { height: "clamp(42px, 5.8vh, 52px)", borderRadius: 10, border: `1.5px solid ${c.bord}`, background: c.champ, padding: "0 16px", font: "inherit", fontSize: "var(--t-base)", color: c.texte, transition: "background .3s ease, border-color .3s ease, color .3s ease" };
  const libelle: CSSProperties = { fontSize: "var(--t-sm)", fontWeight: 600, color: c.label };

  return (
    <div className="ci-page" style={{ height: "100dvh", overflow: "hidden", display: "flex", flexWrap: "wrap", background: "#0B1424", color: "#F4EFE3", colorScheme: theme === "sombre" ? "dark" : "only light" }}>
      <section className="ci-hero" style={{ flex: "1.25 1 640px", minWidth: 0, height: "100%", position: "relative", overflow: "hidden", padding: "clamp(20px, 4.4vh, 40px) 56px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "clamp(12px, 3.1vh, 28px)", background: "radial-gradient(900px 600px at 70% 60%, #15253F 0%, #0B1424 70%)" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", flex: "none" }}>
          {/* En-tête officiel : drapeau, République et devise (le ministère figure sur le logo du panneau de connexion). */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <svg width="42" height="28" viewBox="0 0 30 20" role="img" aria-label="Drapeau du Sénégal" style={{ flex: "none", display: "block", borderRadius: 3, boxShadow: "0 0 0 1px rgba(255,255,255,.14)" }}>
              <rect width="10" height="20" fill="#00853F" /><rect x="10" width="10" height="20" fill="#FDEF42" /><rect x="20" width="10" height="20" fill="#E31B23" />
              <path d="M15 6.2l1.06 3.27h3.44l-2.78 2.02 1.06 3.27L15 12.74l-2.78 2.02 1.06-3.27-2.78-2.02h3.44z" fill="#00853F" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.3 }}>
              <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#F4EFE3" }}>République du Sénégal</span>
              <span style={{ fontSize: "var(--t-xs)", fontStyle: "italic", color: "#A9B3C4" }}>Un Peuple – Un But – Une Foi</span>
            </div>
          </div>
          <span style={{ fontSize: "var(--t-xs)", fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: "#E9D49A", border: "1px solid rgba(201,164,76,.35)", borderRadius: 999, padding: "7px 14px" }}>Intranet · Accès restreint</span>
        </header>

        <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: "clamp(8px, 1.8vh, 16px)", position: "relative", zIndex: 2, flex: "none" }}>
          <h1 className="ci-up ci-titre" style={{ margin: 0, fontSize: "clamp(2rem, 5.6vh, 3.25rem)", lineHeight: 1.08, fontWeight: 700, letterSpacing: "-0.022em" }}>La microfinance du Sénégal, <span style={{ color: "#D9B65E" }}>sur une seule carte.</span></h1>
          <p className="ci-up d1" style={{ margin: 0, fontSize: "clamp(1rem, 1.9vh, 1.0625rem)", lineHeight: 1.6, color: "#B9C2D0", maxWidth: 520 }}>Sièges, agences, caisses et guichets. Dirigeants et mandats. Indicateurs par région, département et commune. Un référentiel unique pour la supervision.</p>
        </div>

        {/* Carte + bloc KPI côte à côte : rien ne se superpose ; la carte se réduit pour tenir dans l'espace restant. */}
        <div className="ci-carte" style={{ position: "relative", flex: "1 1 0", minHeight: 0, display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div className="ci-carte-fond" style={{ position: "relative", flex: "1 1 0", minWidth: 0, height: "100%" }}>
            <SenegalMap theme="dark" fillMode="muted" flow showPoints showLabels={false} stats={stats} points={DEMO_POINTS} infos={["pts"]} />
          </div>
          <div className="ci-float ci-kpi" style={{ flex: "none", width: 250, boxSizing: "border-box", padding: "16px 18px", borderRadius: 12, background: "rgba(19,33,58,.62)", border: "1px solid rgba(233,212,154,.22)", backdropFilter: "blur(14px)", boxShadow: "0 20px 50px rgba(0,0,0,.35)", position: "relative", zIndex: 2 }}>
            <div style={{ fontSize: "var(--t-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#A9B3C4" }}>Points de service géolocalisés</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}><span style={{ fontSize: "var(--t-3xl)", fontWeight: 700, color: "#F3D98C", letterSpacing: "-0.02em" }}>[N]</span><span style={{ fontSize: "var(--t-sm)", color: "#B9C2D0" }}>sur 14 régions</span></div>
            <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,.08)", marginTop: 12, overflow: "hidden" }}><div style={{ width: "78%", height: "100%", background: "#C9A44C", borderRadius: 99 }} /></div>
            <div style={{ fontSize: "var(--t-xs)", color: "#A9B3C4", marginTop: 8 }}>Couverture GPS du référentiel</div>
          </div>
        </div>

        <footer style={{ display: "flex", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 2, flex: "none" }}>
          <div style={tuile}><div style={{ fontSize: "clamp(1.125rem, 2.4vh, 1.375rem)", fontWeight: 700, color: "#F4EFE3" }}>IMF</div><div style={{ fontSize: "var(--t-xs)", color: "#A9B3C4" }}>Référentiel réglementaire</div></div>
          <div style={tuile}><div style={{ fontSize: "clamp(1.125rem, 2.4vh, 1.375rem)", fontWeight: 700, color: "#F4EFE3" }}>Dirigeants</div><div style={{ fontSize: "var(--t-xs)", color: "#A9B3C4" }}>PCA, DG, Gérants, comités</div></div>
          <div style={tuile}><div style={{ fontSize: "clamp(1.125rem, 2.4vh, 1.375rem)", fontWeight: 700, color: "#F4EFE3" }}>Territoires</div><div style={{ fontSize: "var(--t-xs)", color: "#A9B3C4" }}>Régions · Départements · Communes</div></div>
        </footer>
      </section>

      <section className="ci-panneau" style={{ flex: "1 1 420px", minWidth: 0, height: "100%", position: "relative", background: c.fond, color: c.texte, display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(20px, 5.3vh, 48px) 32px", boxSizing: "border-box", overflow: "hidden", transition: "background .3s ease, color .3s ease" }}>
        <button type="button" onClick={() => setTheme(theme === "clair" ? "sombre" : "clair")}
          aria-label={theme === "clair" ? "Passer en thème sombre" : "Passer en thème clair"} aria-pressed={theme === "sombre"} title={theme === "clair" ? "Thème sombre" : "Thème clair"}
          style={{ position: "absolute", top: 20, right: 20, width: 42, height: 42, borderRadius: 10, border: `1px solid ${c.boutonBord}`, background: c.bouton, color: theme === "clair" ? "#8A6A1F" : "#F3D98C", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .3s ease, border-color .3s ease" }}>
          {theme === "clair"
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
        </button>

        <div className="ci-up d2" style={{ width: "100%", maxWidth: 420, maxHeight: "100%", display: "flex", flexDirection: "column", gap: "clamp(12px, 3.1vh, 28px)" }}>
          <Link to="/" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", fontWeight: 500, color: c.lien, textDecoration: "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
            Retour à l'accueil
          </Link>
          <img src={logo} alt="Direction de la Réglementation et de la Supervision des SFD"
            style={{ width: "clamp(170px, 25.5vh, 230px)", height: "auto", display: "block", ...(theme === "sombre" ? { background: "#FFFFFF", padding: "8px 10px", borderRadius: 10, boxSizing: "content-box" } : {}) }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(4px, 0.9vh, 8px)" }}>
            <h2 style={{ margin: 0, fontSize: "clamp(1.625rem, 3.6vh, 2rem)", fontWeight: 700, letterSpacing: "-0.022em" }}>Connexion</h2>
            <p style={{ margin: 0, fontSize: "clamp(0.9375rem, 1.7vh, 1rem)", color: c.doux, lineHeight: 1.55 }}>Accédez à l'espace de cartographie et de gouvernance des institutions de microfinance.</p>
          </div>
          {motif && !erreur && (
            <div role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.bord}`, fontSize: "var(--t-sm)", lineHeight: 1.5, color: c.doux }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              <span>{motif === "inactivite" ? "Vous avez été déconnecté après une période d'inactivité, pour protéger les données." : motif === "duree" ? "Votre session a atteint sa durée maximale. Merci de vous reconnecter." : "Votre session a expiré. Merci de vous reconnecter."}</span>
            </div>
          )}
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "clamp(10px, 2vh, 18px)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "clamp(5px, 0.9vh, 8px)" }}>
              <label htmlFor="ci-email" style={libelle}>Email professionnel</label>
              <input id="ci-email" className="ci-input" type="email" required autoComplete="username" placeholder="prenom.nom@finances.gouv.sn" value={email} disabled={envoi} onChange={(e) => setEmail(e.target.value)} style={champ} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "clamp(5px, 0.9vh, 8px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><label htmlFor="ci-pass" style={libelle}>Mot de passe</label><a href="#" style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: c.lien }}>Mot de passe oublié ?</a></div>
              <input id="ci-pass" className="ci-input" type="password" required autoComplete="current-password" placeholder="••••••••••" value={motDePasse} disabled={envoi} onChange={(e) => setMotDePasse(e.target.value)} style={champ} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--t-md)", color: c.doux }}><input type="checkbox" checked={rester} onChange={(e) => setRester(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#C9A44C" }} /> Rester connecté sur ce poste</label>
            {erreur && <div role="alert" style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: theme === "clair" ? "#B91C1C" : "#FCA5A5" }}>{erreur}</div>}
            <button className="ci-btn" type="submit" disabled={envoi} aria-busy={envoi} style={{ height: "clamp(44px, 6vh, 54px)", border: "none", borderRadius: 10, background: "#C9A44C", color: "#0B1424", font: "inherit", fontSize: "var(--t-base)", fontWeight: 700, cursor: envoi ? "progress" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {envoi
                ? <><svg className="sys-roue" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Connexion en cours…</>
                : <>Se connecter <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>}
            </button>
          </form>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "clamp(10px, 1.6vh, 14px) 16px", borderRadius: 10, background: c.encartFond, color: c.encartTexte, fontSize: "var(--t-sm)", lineHeight: 1.5, transition: "background .3s ease, color .3s ease" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>Accès réservé aux agents de la DRS-SFD. Les consultations des fiches dirigeants sont journalisées.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
