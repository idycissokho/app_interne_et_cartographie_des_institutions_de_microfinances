/**
 * Champ de mot de passe avec un bouton « œil » pour afficher ou masquer la saisie.
 * Mêmes propriétés qu'un <input> (sauf `type`) ; `couleur` : teinte de l'icône (thème clair ou sombre).
 */
import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { couleur?: string };

export function ChampMotDePasse({ couleur = "#6B7280", style, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <input {...props} type={visible ? "text" : "password"} style={{ ...style, flex: 1, minWidth: 0, width: "100%", boxSizing: "border-box", paddingRight: 52 }} />
      <button type="button" onClick={() => setVisible((v) => !v)} disabled={props.disabled}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={visible} aria-controls={props.id}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="champ-mdp-oeil" style={{ color: couleur }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visible
            ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></>
            : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
        </svg>
      </button>
    </div>
  );
}
