/**
 * Journal d'audit (ADMIN). Pas d'écran dédié dans la maquette (lien « # ») :
 * mise en page reprise de l'écran 07 (en-tête, chips, tableau, pagination).
 */
import { useState, type CSSProperties } from "react";

import { qs } from "../api/client";
import type { Page } from "../api/types";
import { AppLayout } from "../components/layout/AppLayout";
import { nombre } from "../lib/format";
import { useDonnees } from "../lib/useDonnees";

interface Entree { id: string; utilisateur_email: string | null; action: string; objet_concerne: string; role: string; date_action: string; details: Record<string, unknown> }

const ACTIONS: [string, string, string][] = [
  ["", "Toutes", "#0B1424"], ["CONSULTATION", "Consultations", "#0B1424"], ["CREATION", "Créations", "#15803D"], ["MODIFICATION", "Modifications", "#C9A44C"],
  ["SUPPRESSION", "Désactivations", "#B91C1C"], ["IMPORTATION", "Imports", "#1F4E79"], ["EXPORTATION", "Exports", "#2E7D6B"], ["CONNEXION", "Connexions", "#6B7280"],
];
const LIB: Record<string, string> = Object.fromEntries(ACTIONS.slice(1).map(([k, l]) => [k, l.replace(/s$/, "")]));
const TAILLE = 25;
const chip = (on: boolean): CSSProperties => ({ height: 40, font: "inherit", fontSize: 13, fontWeight: 700, padding: "0 14px", borderRadius: 12, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#F3D98C", border: "1px solid #0B1424" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #ECE5D5" }) });
const pageBtn = (on = false): CSSProperties => ({ width: 36, height: 36, borderRadius: 10, font: "inherit", cursor: "pointer", ...(on ? { border: "none", background: "#0B1424", color: "#F3D98C", fontWeight: 800 } : { border: "1px solid #ECE5D5", background: "#FFFFFF", color: "#0B1424", fontWeight: 700 }) });

export function Audit() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { donnees: d } = useDonnees<{ rows: Page<Entree> }>({ rows: `/audit/${qs({ action, search: q, page, page_size: TAILLE, ordering: "-date_action" })}` });
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const numeros = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2 || n === 1 || n === pages);
  const couleur = (a: string) => ACTIONS.find((x) => x[0] === a)?.[2] ?? "#6B7280";

  return (
    <AppLayout active="audit" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="in-up" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Données · Traçabilité</span>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Journal d'audit</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Toutes les actions des utilisateurs, dont les consultations des fiches dirigeants. Lecture seule.</p>
        </header>
        <section className="in-up d1" style={{ borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", boxShadow: "0 24px 50px -30px rgba(11,20,36,.22)", overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "16px 18px", borderBottom: "1px solid #F1ECE0" }}>
            <label className="in-search" style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 14px", borderRadius: 12, border: "1.5px solid #ECE5D5", background: "#FFFFFF", color: "#6B7280", boxSizing: "border-box" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" aria-label="Rechercher dans le journal" placeholder="Utilisateur, objet…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 14, flex: 1, minWidth: 0, color: "#0B1424" }} />
            </label>
            {ACTIONS.map(([k, l]) => <button key={l} type="button" aria-pressed={k === action} onClick={() => { setAction(k); setPage(1); }} style={chip(k === action)}>{l}</button>)}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280", background: "#FDFBF6" }}><th style={{ padding: "12px 18px" }}>Date</th><th style={{ padding: "12px 8px" }}>Action</th><th style={{ padding: "12px 8px" }}>Objet</th><th style={{ padding: "12px 8px" }}>Utilisateur</th><th style={{ padding: "12px 18px" }}>Rôle</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="in-row" style={{ borderTop: "1px solid #F6F1E4" }}>
                    <td style={{ padding: "13px 18px", whiteSpace: "nowrap", color: "#4A5568" }}>{new Date(e.date_action).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td style={{ padding: "13px 8px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: couleur(e.action) }} />{LIB[e.action] ?? e.action}</span></td>
                    <td style={{ padding: "13px 8px" }}><div style={{ fontWeight: 600 }}>{String(e.details.libelle ?? "") || "—"}</div><code style={{ fontSize: 11, color: "#6E5416" }}>{e.objet_concerne}</code></td>
                    <td style={{ padding: "13px 8px", color: "#1A2333" }}>{e.utilisateur_email ?? "—"}</td>
                    <td style={{ padding: "13px 18px" }}><span style={{ fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 999, background: "#F3ECDC", color: "#6E5416" }}>{e.role || "—"}</span></td>
                  </tr>
                ))}
                {d.rows && rows.length === 0 && <tr><td colSpan={5} style={{ padding: "40px 18px", textAlign: "center", color: "#6B7280" }}>Aucune entrée.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 18px", borderTop: "1px solid #F1ECE0", fontSize: 13, color: "#4A5568" }}>
            <span>{nombre(total)} entrée{total > 1 ? "s" : ""}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" aria-label="Page précédente" disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ ...pageBtn(), fontWeight: 400, color: "#4A5568" }}>‹</button>
              {numeros.map((n) => <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} style={pageBtn(n === page)}>{n}</button>)}
              <button type="button" aria-label="Page suivante" disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ ...pageBtn(), fontWeight: 400, color: "#4A5568" }}>›</button>
            </div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
