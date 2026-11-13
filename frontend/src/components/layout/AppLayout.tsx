/**
 * Gabarit commun des écrans 02 à 11 : colonne Sidebar (flex: 1 1 248px; max-width 272px)
 * + contenu, exactement comme dans la maquette.
 */
import type { CSSProperties, ReactNode } from "react";

import type { Role } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Sidebar, type CleMenu, type RoleMaquette } from "./Sidebar";

export const ROLE_MAQUETTE: Record<Role, RoleMaquette> = { ADMIN: "admin", SUPERVISEUR: "superviseur", CONSULTANT: "consultant" };

export function AppLayout({ active, minHeight = 1000, children, style }: { active: CleMenu; minHeight?: number; children: ReactNode; style?: CSSProperties }) {
  const { utilisateur, deconnecter } = useAuth();
  const role = ROLE_MAQUETTE[utilisateur?.role ?? "CONSULTANT"];
  return (
    <div style={{ minHeight, display: "flex", flexWrap: "wrap", background: "#FAF7F0", color: "#0B1424", ...style }}>
      <div style={{ flex: "1 1 248px", maxWidth: 272, background: "#0B1424", display: "flex" }}>
        <Sidebar active={active} role={role} nomComplet={utilisateur?.nom_complet ?? ""} onDeconnexion={deconnecter} />
      </div>
      {children}
    </div>
  );
}
