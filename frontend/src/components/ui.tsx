import type { ReactNode } from "react";

import type { Page } from "../api/types";

export function Etat({ chargement, erreur }: { chargement?: boolean; erreur?: string | null }) {
  if (erreur) return <div className="alerte alerte-erreur">{erreur}</div>;
  if (chargement) return <div className="muet">Chargement…</div>;
  return null;
}

const COULEURS: Record<string, string> = {
  AGREE: "vert", OUVERT: "vert", EN_FONCTION: "vert", TERMINE: "vert",
  EN_COURS: "orange", INTERIM: "orange", SUSPENDU: "orange", EN_ATTENTE: "orange",
  RADIEE: "rouge", RADIE: "rouge", FERME: "rouge", ECHEC: "rouge",
};

export function Badge({ valeur, children }: { valeur: string; children: ReactNode }) {
  return <span className={`badge badge-${COULEURS[valeur] ?? "gris"}`}>{children}</span>;
}

export function EnTete({ titre, sousTitre, actions }: { titre: string; sousTitre?: string; actions?: ReactNode }) {
  return (
    <div className="entete">
      <div>
        <h1>{titre}</h1>
        {sousTitre && <p className="muet">{sousTitre}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Pagination<T>({ page, numero, onChange }: { page: Page<T> | null; numero: number; onChange: (n: number) => void }) {
  if (!page || page.count <= page.results.length) return page ? <p className="muet">{page.count} résultat(s)</p> : null;
  return (
    <div className="pagination">
      <span className="muet">{page.count} résultat(s)</span>
      <button className="btn" disabled={!page.previous} onClick={() => onChange(numero - 1)}>← Précédent</button>
      <span>Page {numero}</span>
      <button className="btn" disabled={!page.next} onClick={() => onChange(numero + 1)}>Suivant →</button>
    </div>
  );
}

export function Onglets({ onglets, actif, onChange }: { onglets: { id: string; label: string }[]; actif: string; onChange: (id: string) => void }) {
  return (
    <div className="onglets" role="tablist">
      {onglets.map((o) => (
        <button key={o.id} role="tab" aria-selected={actif === o.id} className={actif === o.id ? "actif" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Champ({ label, valeur }: { label: string; valeur: ReactNode }) {
  return (
    <div className="champ-lecture">
      <dt>{label}</dt>
      <dd>{valeur || "—"}</dd>
    </div>
  );
}
