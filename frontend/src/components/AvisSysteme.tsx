/**
 * Avis affichés par-dessus toutes les pages, sans modifier leur mise en page :
 *  - <AvisReveil> : « Démarrage du serveur, merci de patienter… » pendant que le serveur
 *    redémarre (hébergement gratuit mis en veille, redémarrage de l'intranet) ;
 *  - <BandeauDemo> : « Version de démonstration », seulement si VITE_DEMO=true au moment
 *    de la construction (rien sur l'intranet).
 */
import { useEffect, useState } from "react";

import { etatReveil, evenementReveil } from "../api/client";

export const MODE_DEMO = import.meta.env.VITE_DEMO === "true";

export function AvisReveil() {
  const [attente, setAttente] = useState(etatReveil.enCours);
  useEffect(() => {
    setAttente(etatReveil.enCours);
    const debut = () => setAttente(true);
    const fin = () => setAttente(false);
    evenementReveil.addEventListener("debut", debut);
    evenementReveil.addEventListener("fin", fin);
    return () => {
      evenementReveil.removeEventListener("debut", debut);
      evenementReveil.removeEventListener("fin", fin);
    };
  }, []);
  if (!attente) return null;
  return (
    <div role="status" aria-live="polite" className="sys-avis" style={{ position: "fixed", left: "50%", bottom: 28, zIndex: 90, transform: "translateX(-50%)", width: "max-content", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderRadius: 16, background: "#0B1424", color: "#F4EFE3", boxShadow: "0 20px 50px rgba(11,20,36,.35)", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <span className="sys-roue" aria-hidden="true" style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", border: "3px solid rgba(243,217,140,.25)", borderTopColor: "#C9A44C", boxSizing: "border-box" }} />
      <div style={{ fontSize: 13, lineHeight: 1.45 }}>
        <b style={{ display: "block", fontSize: 14 }}>Démarrage du serveur, merci de patienter…</b>
        <span style={{ color: "#A9B3C4" }}>Cela peut prendre jusqu'à une minute. La page se mettra à jour d'elle-même.</span>
      </div>
    </div>
  );
}

export function BandeauDemo() {
  if (!MODE_DEMO) return null;
  return (
    <div aria-label="Version de démonstration" style={{ position: "fixed", top: 6, left: "50%", zIndex: 80, transform: "translateX(-50%)", pointerEvents: "none", padding: "3px 12px", borderRadius: 999, background: "rgba(11,20,36,.86)", color: "#F3D98C", border: "1px solid rgba(201,164,76,.45)", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      Version de démonstration
    </div>
  );
}
