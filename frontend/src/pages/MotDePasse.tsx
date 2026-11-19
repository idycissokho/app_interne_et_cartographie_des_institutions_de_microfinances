/**
 * Changement du mot de passe.
 * - Obligatoire à la première connexion (compte créé par un administrateur, mot de passe
 *   provisoire) : l'API refuse tout le reste tant que ce n'est pas fait, et l'interface y ramène.
 * - Accessible ensuite à tout moment depuis le menu (icône clé, à côté de la déconnexion).
 */
import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import logo from "../assets/logo-drs-sfd.png";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EcranSquelette } from "../components/Squelette";

const champ: CSSProperties = { height: 48, borderRadius: 10, border: "1.5px solid #D6D3D1", background: "#FFFFFF", padding: "0 16px", font: "inherit", fontSize: "var(--t-base)", color: "#0B1424" };
const libelle: CSSProperties = { fontSize: "var(--t-sm)", fontWeight: 600, color: "#1A2333" };

export function MotDePasse() {
  const { utilisateur, chargement, deconnecter, motDePasseChange } = useAuth();
  const navigate = useNavigate();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (chargement) return <EcranSquelette />;
  if (!utilisateur) return <Navigate to="/connexion" replace />;
  const obligatoire = !!utilisateur.doit_changer_mot_de_passe;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (nouveau !== confirmation) {
      setErreur("Les deux saisies du nouveau mot de passe ne correspondent pas.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post("/auth/change-password/", { ancien_mot_de_passe: ancien, nouveau_mot_de_passe: nouveau, confirmation });
      motDePasseChange();
      navigate("/", { replace: true });
    } catch (err) {
      setErreur((err as Error).message.replace(/^(ancien_mot_de_passe|nouveau_mot_de_passe|confirmation) : /, ""));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", boxSizing: "border-box", background: "radial-gradient(900px 600px at 70% 60%, #15253F 0%, #0B1424 70%)", colorScheme: "only light" }}>
      <main style={{ width: "100%", maxWidth: 440, background: "#FFFFFF", color: "#0B1424", borderRadius: 16, padding: "32px 28px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22, boxShadow: "0 24px 60px rgba(0,0,0,.35)" }}>
        <img src={logo} alt="Direction de la Réglementation et de la Supervision des SFD" style={{ width: 190, height: "auto", display: "block" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: "var(--t-2xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {obligatoire ? "Choisissez votre mot de passe" : "Changer mon mot de passe"}
          </h1>
          <p style={{ margin: 0, fontSize: "var(--t-md)", color: "#4A5568", lineHeight: 1.55 }}>
            {obligatoire
              ? <>Bienvenue {utilisateur.prenom}. Le mot de passe qui vous a été remis est provisoire : remplacez-le par un mot de passe personnel pour accéder à l'application.</>
              : <>Saisissez votre mot de passe actuel, puis le nouveau.</>}
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="mdp-ancien" style={libelle}>{obligatoire ? "Mot de passe provisoire" : "Mot de passe actuel"}</label>
            <input id="mdp-ancien" className="ci-input" type="password" required autoComplete="current-password" value={ancien} disabled={envoi} onChange={(e) => setAncien(e.target.value)} style={champ} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="mdp-nouveau" style={libelle}>Nouveau mot de passe</label>
            <input id="mdp-nouveau" className="ci-input" type="password" required autoComplete="new-password" value={nouveau} disabled={envoi} onChange={(e) => setNouveau(e.target.value)} style={champ} aria-describedby="mdp-regles" />
            <span id="mdp-regles" style={{ fontSize: "var(--t-xs)", color: "#6B7280", lineHeight: 1.5 }}>8 caractères au moins, pas uniquement des chiffres, différent de l'actuel ; évitez votre nom et les mots trop courants.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="mdp-confirmation" style={libelle}>Confirmer le nouveau mot de passe</label>
            <input id="mdp-confirmation" className="ci-input" type="password" required autoComplete="new-password" value={confirmation} disabled={envoi} onChange={(e) => setConfirmation(e.target.value)} style={champ} />
          </div>
          {erreur && <div role="alert" style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#B91C1C", lineHeight: 1.5 }}>{erreur}</div>}
          <button className="ci-btn" type="submit" disabled={envoi} aria-busy={envoi} style={{ height: 50, border: "none", borderRadius: 10, background: "#C9A44C", color: "#0B1424", font: "inherit", fontSize: "var(--t-base)", fontWeight: 700, cursor: envoi ? "progress" : "pointer" }}>
            {envoi ? "Enregistrement…" : "Enregistrer le mot de passe"}
          </button>
        </form>

        <div style={{ fontSize: "var(--t-sm)", textAlign: "center" }}>
          {obligatoire
            ? <button type="button" onClick={() => void deconnecter()} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "#8A6A1F", fontWeight: 500, cursor: "pointer" }}>Se déconnecter</button>
            : <Link to="/" style={{ color: "#8A6A1F", fontWeight: 500 }}>Retour à l'application</Link>}
        </div>
      </main>
    </div>
  );
}
