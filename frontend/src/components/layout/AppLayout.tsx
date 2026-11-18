/**
 * Gabarit commun des écrans 02 à 11 : colonne Sidebar (flex: 1 1 248px; max-width 272px)
 * + contenu, exactement comme dans la maquette.
 *
 * Téléphone (≤ 760 px) : barre du haut avec un bouton « Menu » ; la Sidebar devient un tiroir
 * qui s'ouvre par-dessus la page et se ferme au choix d'une rubrique, au toucher du fond ou par Échap.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import type { Role } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Sidebar, type CleMenu, type RoleMaquette } from "./Sidebar";

export const ROLE_MAQUETTE: Record<Role, RoleMaquette> = { ADMIN: "admin", SUPERVISEUR: "superviseur", CONSULTANT: "consultant" };

export function AppLayout({ active, minHeight = 1000, children, style }: { active: CleMenu; minHeight?: number; children: ReactNode; style?: CSSProperties }) {
  const { utilisateur, deconnecter } = useAuth();
  const role = ROLE_MAQUETTE[utilisateur?.role ?? "CONSULTANT"];
  const [menuOuvert, setMenuOuvert] = useState(false);
  const { pathname, search } = useLocation();

  // Une rubrique choisie ferme le tiroir.
  useEffect(() => setMenuOuvert(false), [pathname, search]);
  // Tiroir ouvert : Échap le ferme et la page dessous ne défile plus.
  useEffect(() => {
    if (!menuOuvert) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOuvert(false); };
    document.addEventListener("keydown", surTouche);
    document.documentElement.classList.add("app-menu-fige");
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.documentElement.classList.remove("app-menu-fige");
    };
  }, [menuOuvert]);

  return (
    <div style={{ minHeight, display: "flex", flexWrap: "wrap", background: "#FFFFFF", color: "#0B1424", ...style }}>
      <header className="app-barre-mobile">
        <button type="button" className="app-bouton-menu" aria-label="Ouvrir le menu" aria-expanded={menuOuvert} aria-controls="app-menu" onClick={() => setMenuOuvert(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span className="app-barre-titre">Carto IMF <span>DRS-SFD</span></span>
      </header>
      {menuOuvert && <div className="app-voile-menu" aria-hidden="true" onClick={() => setMenuOuvert(false)} />}
      <div id="app-menu" className="app-sidebar" data-ouvert={menuOuvert || undefined} style={{ flex: "1 1 248px", maxWidth: 272, background: "#0B1424", display: "flex" }}>
        <button type="button" className="app-fermer-menu" aria-label="Fermer le menu" onClick={() => setMenuOuvert(false)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <Sidebar active={active} role={role} nomComplet={utilisateur?.nom_complet ?? ""} onDeconnexion={() => void deconnecter()} />
      </div>
      {children}
    </div>
  );
}
