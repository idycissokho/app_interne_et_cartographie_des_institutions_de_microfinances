/**
 * Garde de session (monté une fois dans App) : déconnecte automatiquement après une période
 * d'inactivité ou au-delà de la durée maximale de session, avec un avertissement une minute
 * avant. Pendant l'activité, il renouvelle les jetons pour que le serveur garde la session ouverte.
 */
import { useEffect, useRef, useState } from "react";

import { etatJetons, renouveler } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { session } from "../auth/session";

const AVERTISSEMENT_MS = 60_000;
const RENOUVELLEMENT_MS = 10 * 60_000; // jeton de rafraîchissement : 30 min d'inactivité côté serveur
const EVENEMENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"] as const;

export function GardeSession() {
  const { utilisateur, deconnecter } = useAuth();
  const [restant, setRestant] = useState<number | null>(null); // secondes avant déconnexion, si avertissement
  const avertir = useRef(false);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!utilisateur) { setRestant(null); avertir.current = false; return; }

    const activite = () => { if (!avertir.current) session.noterActivite(); };
    EVENEMENTS.forEach((ev) => window.addEventListener(ev, activite, { passive: true }));

    const verifier = () => {
      const motif = session.motifExpiration();
      if (motif) { void deconnecter(motif); return; }
      const maintenant = Date.now();
      const avantInactivite = session.inactiviteMs() - (maintenant - session.derniereActivite());
      const avantDuree = session.dureeMaxMs() - (maintenant - session.debut());
      const reste = Math.min(avantInactivite, avantDuree);
      if (reste <= AVERTISSEMENT_MS) {
        avertir.current = true;
        setRestant(Math.max(0, Math.ceil(reste / 1000)));
      } else {
        avertir.current = false;
        setRestant(null);
        // Utilisateur actif : on garde la session ouverte côté serveur.
        if (maintenant - session.derniereActivite() < 60_000 && maintenant - etatJetons.renouveleA > RENOUVELLEMENT_MS) void renouveler();
      }
    };
    const minuterie = window.setInterval(verifier, 1000);
    // Retour sur un onglet resté en arrière-plan (minuteries ralenties par le navigateur).
    const surVisibilite = () => { if (document.visibilityState === "visible") verifier(); };
    document.addEventListener("visibilitychange", surVisibilite);
    verifier();
    return () => {
      EVENEMENTS.forEach((ev) => window.removeEventListener(ev, activite));
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [utilisateur, deconnecter]);

  useEffect(() => { if (restant !== null) bouton.current?.focus(); }, [restant !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (restant === null || !utilisateur) return null;
  const parDuree = Date.now() - session.debut() > session.dureeMaxMs() - AVERTISSEMENT_MS;
  const rester = () => { session.noterActivite(true); avertir.current = false; setRestant(null); void renouveler(); };

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="gs-titre" aria-describedby="gs-texte" className="ps-fade"
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(11,20,36,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", background: "#FFFFFF", borderRadius: 12, border: "1px solid #E7E5E4", padding: 24, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 24px 50px rgba(11,20,36,.18)" }}>
        <h2 id="gs-titre" style={{ margin: 0, fontSize: "var(--t-lg)", fontWeight: 700 }}>{parDuree ? "Votre session arrive à son terme" : "Êtes-vous toujours là ?"}</h2>
        <p id="gs-texte" style={{ margin: 0, fontSize: "var(--t-md)", color: "#4A5568", lineHeight: 1.55 }}>
          {parDuree
            ? <>Par sécurité, une session dure au plus {session.regles().duree_max_heures} heures. Vous serez déconnecté dans <b style={{ color: "#0B1424", fontVariantNumeric: "tabular-nums" }}>{restant} s</b> ; reconnectez-vous pour continuer.</>
            : <>Sans activité, vous serez déconnecté dans <b style={{ color: "#0B1424", fontVariantNumeric: "tabular-nums" }}>{restant} s</b> pour protéger les données.</>}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 4 }}>
          <button type="button" onClick={() => void deconnecter()} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", cursor: "pointer" }}>Se déconnecter</button>
          {!parDuree && <button ref={bouton} type="button" onClick={rester} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "#C9A44C", font: "inherit", fontSize: "var(--t-md)", fontWeight: 600, color: "#0B1424", cursor: "pointer" }}>Rester connecté</button>}
        </div>
      </div>
    </div>
  );
}
