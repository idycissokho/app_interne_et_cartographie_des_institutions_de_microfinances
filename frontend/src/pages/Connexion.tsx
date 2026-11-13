import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function Connexion() {
  const { utilisateur, connecter } = useAuth();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (utilisateur) return <Navigate to="/carte" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await connecter(email, motDePasse);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="page-connexion">
      <form className="carte-connexion" onSubmit={onSubmit}>
        <p className="surtitre">République du Sénégal · Ministère des Finances et du Budget</p>
        <h1>Cartographie des IMF</h1>
        <p className="muet">Application interne DRS-SFD</p>
        <label>
          <span>Adresse email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span>Mot de passe</span>
          <input type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        </label>
        {erreur && <div className="alerte alerte-erreur">{erreur}</div>}
        <button className="btn btn-primaire" disabled={envoi}>{envoi ? "Connexion…" : "Se connecter"}</button>
      </form>
    </div>
  );
}
