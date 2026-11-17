/**
 * <Sidebar> — transcription de maquette-carto-imf/composants/Sidebar.dc.html.
 * Les menus dépendent du rôle exactement comme dans renderVals().
 */
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import { prechargerPage } from "../../lib/pages";

export type CleMenu =
  | "dashboard" | "micro" | "macro" | "imf" | "points" | "dirigeants"
  | "supervision" | "consultation" | "import" | "audit";
export type RoleMaquette = "superviseur" | "consultant" | "admin";

const I: Record<CleMenu, string> = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  micro: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
  macro: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  imf: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6",
  points: "M6 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M18 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M9 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M8 7.5h8M7 8.5l1.5 7M16.5 10l-6 6.5",
  dirigeants: "M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.6 5.2",
  supervision: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3zM9 12l2 2 4-4",
  consultation: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
  import: "M12 3v12M7 10l5 5 5-5M4 21h16",
  audit: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
};

const RL: Record<RoleMaquette, string> = { superviseur: "Superviseur", consultant: "Consultation", admin: "Administrateur" };

interface Props {
  active: CleMenu;
  role: RoleMaquette;
  nomComplet: string;
  onDeconnexion: () => void;
}

export function Sidebar({ active, role, nomComplet, onDeconnexion }: Props) {
  const mk = (k: CleMenu, label: string, href: string, badge?: string) => {
    const on = k === active;
    const style: CSSProperties = {
      display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 8, fontSize: "var(--t-md)", textDecoration: "none",
      // Élément actif : texte en gras, icône dorée et barre fine à gauche, sans bloc coloré.
      ...(on
        ? { color: "#FFFFFF", fontWeight: 600, boxShadow: "inset 2px 0 0 #C9A44C" }
        : { color: "#B4BDCB", fontWeight: 400 }),
    };
    return { k, label, href, icon: I[k], badge, style, on };
  };
  const groups = [
    {
      title: "Pilotage",
      items: [
        mk("dashboard", "Tableau de bord", "/"),
        ...(role === "consultant"
          ? [mk("consultation", "Espace consultation", "/consultation")]
          : [mk("supervision", "Espace supervision", "/supervision")]),
        // L'administrateur peut tout ce que peuvent les autres rôles, consultation comprise.
        ...(role === "admin" ? [mk("consultation", "Espace consultation", "/consultation")] : []),
        mk("micro", "Carte micro", "/carte/micro"),
        mk("macro", "Carte macro", "/carte/macro"),
      ],
    },
    {
      title: "Référentiels",
      items: [
        mk("imf", "Institutions (IMF)", role === "consultant" ? "/consultation" : "/imf"),
        mk("points", "Points de service", "/points-service"),
        mk("dirigeants", "Dirigeants & mandats", "/dirigeants"),
      ],
    },
  ];
  // Import / Export Excel et journal d'audit : ADMIN uniquement (diagramme de cas d'utilisation).
  if (role === "admin") {
    groups.push({ title: "Données", items: [mk("import", "Import / Export", "/donnees"), mk("audit", "Journal d'audit", "/audit")] });
  }
  const initials = role === "consultant" ? "CO" : role === "admin" ? "AD" : "SU";

  return (
    <nav className="app-nav" aria-label="Navigation principale" style={{ width: "100%", height: "100%", minHeight: 900, boxSizing: "border-box", background: "#0B1424", color: "#DCE2EC", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--police)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 10px 22px 10px" }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: "#C9A44C", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1424" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        </div>
        <div><div style={{ fontWeight: 700, fontSize: "var(--t-lg)", color: "#F4EFE3" }}>Carto IMF</div><div style={{ fontSize: "var(--t-2xs)", color: "#8E99AB" }}>DRS-SFD</div></div>
      </div>
      {groups.map((g) => (
        <div key={g.title} style={{ display: "contents" }}>
          <div style={{ fontSize: "var(--t-xs)", fontWeight: 500, color: "#7C889B", padding: "18px 12px 6px 12px" }}>{g.title}</div>
          {g.items.map((it) => (
            <Link key={it.k} to={it.href} className="nav-lien" style={it.style} aria-current={it.on ? "page" : undefined} onMouseEnter={() => prechargerPage(it.href)} onFocus={() => prechargerPage(it.href)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={it.on ? "#C9A44C" : "currentColor"} strokeWidth={it.on ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={it.icon} /></svg>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge && <span style={{ fontSize: "var(--t-2xs)", fontWeight: 700, color: "#0B1424", background: "#F3D98C", borderRadius: 999, padding: "2px 8px" }}>{it.badge}</span>}
            </Link>
          ))}
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "16px 12px 4px 12px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", background: "rgba(255,255,255,.08)", color: "#F4EFE3", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "var(--t-xs)" }}>{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600, fontSize: "var(--t-md)", color: "#F4EFE3" }}>{nomComplet}</div><div style={{ fontSize: "var(--t-xs)", color: "#7C889B" }}>{RL[role]}</div></div>
        <button type="button" onClick={onDeconnexion} aria-label="Se déconnecter" title="Se déconnecter" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8E99AB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>
    </nav>
  );
}
