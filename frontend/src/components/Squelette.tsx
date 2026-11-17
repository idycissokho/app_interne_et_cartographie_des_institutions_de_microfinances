/**
 * Squelettes de chargement aux couleurs de la maquette (ivoire et or pâle, classe .sq de global.css).
 * Ils occupent la place du contenu en attendant la première réponse de l'API.
 */
import type { CSSProperties } from "react";

/** Bloc animé de la taille du contenu attendu. */
export function Squelette({ largeur = 80, hauteur = 18, style }: { largeur?: number | string; hauteur?: number; style?: CSSProperties }) {
  return <span className="sq" aria-hidden="true" style={{ width: largeur, height: hauteur, ...style }} />;
}

/** Lignes de tableau en attente (à placer dans un <tbody>). */
export function LignesSquelette({ colonnes, lignes = 8 }: { colonnes: number; lignes?: number }) {
  return (
    <>
      {Array.from({ length: lignes }, (_, i) => (
        <tr key={i} aria-hidden="true">
          <td colSpan={colonnes} style={{ padding: "13px 18px", borderBottom: "1px solid #F5F5F4" }}>
            <Squelette largeur={`${92 - (i % 3) * 14}%`} hauteur={18} />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Écran d'attente pendant le téléchargement du code d'une page (chargement à la demande). */
export function EcranSquelette() {
  return (
    <div role="status" aria-label="Chargement" style={{ minHeight: "100vh", background: "#FFFFFF", padding: "28px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22 }}>
      <Squelette largeur={320} hauteur={40} />
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {[0, 1, 2, 3].map((i) => <Squelette key={i} largeur="22%" hauteur={110} style={{ flex: "1 1 200px", borderRadius: 12 }} />)}
      </div>
      <Squelette largeur="100%" hauteur={360} style={{ borderRadius: 12 }} />
    </div>
  );
}
