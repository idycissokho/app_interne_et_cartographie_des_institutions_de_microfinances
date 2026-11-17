/**
 * Journal d'audit (ADMIN). Pas d'écran dédié dans la maquette (lien « # ») :
 * mise en page reprise de l'écran 07 (en-tête, chips, tableau, pagination).
 */
import { useState } from "react";

import { qs } from "../api/client";
import type { Page } from "../api/types";
import { AppLayout } from "../components/layout/AppLayout";
import { nombre } from "../lib/format";
import { Badge, CadreTableau, ChampRecherche, EnTete, EtatVide, LignesChargement, Pagination, Pastille, Tableau } from "../components/tableau/Tableau";
import { useDonnees } from "../lib/useDonnees";

interface Entree { id: string; utilisateur_email: string | null; action: string; objet_concerne: string; role: string; date_action: string; details: Record<string, unknown> }

const ACTIONS: [string, string, string][] = [
  ["", "Toutes", "#0B1424"], ["CONSULTATION", "Consultations", "#0B1424"], ["CREATION", "Créations", "#15803D"], ["MODIFICATION", "Modifications", "#C9A44C"],
  ["SUPPRESSION", "Désactivations", "#B91C1C"], ["IMPORTATION", "Imports", "#1F4E79"], ["EXPORTATION", "Exports", "#2E7D6B"], ["CONNEXION", "Connexions", "#6B7280"],
];
const LIB: Record<string, string> = Object.fromEntries(ACTIONS.slice(1).map(([k, l]) => [k, l.replace(/s$/, "")]));
const TAILLE = 25;

export function Audit() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { donnees: d } = useDonnees<{ rows: Page<Entree> }>({ rows: `/audit/${qs({ action, search: q, page, page_size: TAILLE, ordering: "-date_action" })}` });
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const couleur = (a: string) => ACTIONS.find((x) => x[0] === a)?.[2] ?? "#6B7280";

  return (
    <AppLayout active="audit" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="in-up" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: "var(--t-sm)", fontWeight: 500, color: "#6B7280" }}>Données / Traçabilité</span>
          <h1 style={{ margin: 0, fontSize: "var(--t-3xl)", fontWeight: 700, letterSpacing: "-0.022em" }}>Journal d'audit</h1>
          <p style={{ margin: 0, fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.55 }}>Toutes les actions des utilisateurs, dont les consultations des fiches dirigeants. Lecture seule.</p>
        </header>
        <CadreTableau className="in-up d1"
          barre={<>
            <ChampRecherche libelle="Rechercher dans le journal" placeholder="Utilisateur, objet…" valeur={q} onChange={(v) => { setQ(v); setPage(1); }} />
            {ACTIONS.map(([k, l]) => <Pastille key={l} actif={k === action} onClick={() => { setAction(k); setPage(1); }}>{l}</Pastille>)}
          </>}
          pied={<Pagination page={page} pages={pages} onPage={setPage} resume={`${nombre(total)} entrée${total > 1 ? "s" : ""}`} />}>
          <Tableau largeurMin={860}>
            <thead><tr><EnTete>Date</EnTete><EnTete>Action</EnTete><EnTete>Objet</EnTete><EnTete>Utilisateur</EnTete><EnTete>Rôle</EnTete></tr></thead>
            <tbody>
              {!d.rows && <LignesChargement colonnes={5} />}
              {rows.map((e) => (
                <tr key={e.id}>
                  <td data-label="Date" style={{ whiteSpace: "nowrap", color: "#4A5568" }}>{new Date(e.date_action).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td data-label="Action"><span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: couleur(e.action) }} />{LIB[e.action] ?? e.action}</span></td>
                  <td data-label="Objet" className="principal"><div style={{ fontWeight: 500 }}>{String(e.details.libelle ?? "") || "—"}</div><code className="muet" style={{ fontSize: "var(--t-xs)" }}>{e.objet_concerne}</code></td>
                  <td data-label="Utilisateur" style={{ color: "#4A5568" }}>{e.utilisateur_email ?? "—"}</td>
                  <td data-label="Rôle"><Badge point={false}>{e.role || "—"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Tableau>
          {d.rows && rows.length === 0 && <EtatVide titre="Aucune entrée">Aucune action ne correspond à ces critères.</EtatVide>}
        </CadreTableau>
      </main>
    </AppLayout>
  );
}
