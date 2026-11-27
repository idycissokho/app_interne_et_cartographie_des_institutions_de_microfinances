/**
 * Tableaux de l'application : un seul jeu de briques pour tous les écrans
 * (Institutions, Points de service, Dirigeants, Journal d'audit, rapports d'import).
 *
 * - en-têtes discrets, lignes aérées, survol léger (classes .tbl de global.css) ;
 * - chiffres alignés à droite (classe « num » sur <td>/<th>) ;
 * - actions de ligne visibles au survol, au clavier, et toujours sur écran tactile ;
 * - sous 640 px, chaque ligne devient une carte : chaque <td> porte data-label.
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { Squelette } from "../Squelette";

/** Cadre blanc du tableau, avec sa barre d'outils (recherche, filtres) et son pied (pagination). */
export function CadreTableau({ barre, pied, children, className = "", style }: { barre?: ReactNode; pied?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`tbl-cadre ${className}`} style={style}>
      {barre && <div className="tbl-barre">{barre}</div>}
      {children}
      {pied && <div className="tbl-pied">{pied}</div>}
    </section>
  );
}

/**
 * Le tableau lui-même. `largeurMin` : en dessous, défilement horizontal ; sous 640 px, cartes.
 * `vue` : identifiant de la vue affichée (regroupement, filtres…) ; à chaque changement, le
 * défilement horizontal revient au début. Quand le tableau déborde, l'attribut data-deborde
 * active les repères visuels (ombres des bords, colonne d'actions fixée à droite, barre visible).
 */
export function Tableau({ largeurMin = 760, legende, vue, children }: { largeurMin?: number; legende?: string; vue?: string; children: ReactNode }) {
  const defile = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (defile.current) defile.current.scrollLeft = 0;
  }, [vue]);
  useEffect(() => {
    const el = defile.current;
    if (!el) return;
    const mesurer = () => {
      el.toggleAttribute("data-deborde", el.scrollWidth > el.clientWidth + 1);
      el.style.setProperty("--tbl-visible", `${el.clientWidth}px`);
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    if (el.firstElementChild) observateur.observe(el.firstElementChild);
    return () => observateur.disconnect();
  }, []);
  return (
    <div ref={defile} className="tbl-defile">
      <table className="tbl cartes" style={{ minWidth: largeurMin }}>
        {legende && <caption className="tbl-legende">{legende}</caption>}
        {children}
      </table>
    </div>
  );
}

export interface Tri { actif: boolean; desc: boolean; onClick: () => void }

/** En-tête de colonne, triable ou non. */
export function EnTete({ children, num, tri, style }: { children?: ReactNode; num?: boolean; tri?: Tri; style?: CSSProperties }) {
  return (
    <th className={num ? "num" : undefined} style={style} aria-sort={tri?.actif ? (tri.desc ? "descending" : "ascending") : undefined}>
      {tri
        ? (
          <button type="button" className="tbl-tri" data-actif={tri.actif} title="Trier" onClick={tri.onClick}>
            {children}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: tri.actif && tri.desc ? "rotate(180deg)" : undefined }}>
              <path d="M5 2 8.5 7h-7z" fill="currentColor" />
            </svg>
          </button>
        )
        : children}
    </th>
  );
}

/** Ligne d'intertitre d'un regroupement (par institution, par région…). */
export function LigneGroupe({ colonnes, children }: { colonnes: number; children: ReactNode }) {
  return <tr className="tbl-groupe"><td colSpan={colonnes}>{children}</td></tr>;
}

/** Lignes d'attente pendant le chargement. */
export function LignesChargement({ colonnes, lignes = 6 }: { colonnes: number; lignes?: number }) {
  return (
    <>
      {Array.from({ length: lignes }, (_, i) => (
        <tr key={i} aria-hidden="true" className="tbl-attente">
          <td colSpan={colonnes}><Squelette largeur={`${88 - (i % 3) * 16}%`} hauteur={14} /></td>
        </tr>
      ))}
    </>
  );
}

/** Cellule des actions de ligne (boutons BoutonIcone). */
export function CelluleActions({ children }: { children: ReactNode }) {
  return <td className="tbl-actions" data-label=""><div>{children}</div></td>;
}

/** Bouton-icône d'action de ligne. */
export function BoutonIcone({ libelle, onClick, children }: { libelle: string; onClick: (e: MouseEvent) => void; children: ReactNode }) {
  return <button type="button" className="tbl-icone" aria-label={libelle} title={libelle} onClick={onClick}>{children}</button>;
}

export type Ton = "succes" | "alerte" | "danger" | "neutre" | "info";

/** Ton des statuts métier (IMF, points, mandats). */
export const TON_STATUT: Record<string, Ton> = {
  EN_ACTIVITE: "succes", OUVERT: "succes", EN_FONCTION: "succes",
  OPR: "alerte", INTERIM: "alerte",
  RETRAIT_AGREMENT: "danger", SUSPENDU: "danger",
  FERME: "neutre",
};

/** Badge sobre : fond gris clair, petit point de couleur, texte lisible. */
export function Badge({ ton = "neutre", children, point = true }: { ton?: Ton; children: ReactNode; point?: boolean }) {
  return <span className={`badge badge-${ton}${point ? "" : " sans-point"}`}>{children}</span>;
}

/** Message affiché quand aucune ligne ne correspond. */
export function EtatVide({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="tbl-vide" role="status">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <b>{titre}</b>
      {children && <span>{children}</span>}
    </div>
  );
}

/** Pagination : résumé à gauche, pages à droite. `onPage` reçoit la page demandée. */
export function Pagination({ page, pages, onPage, resume }: { page: number; pages: number; onPage: (n: number) => void; resume: ReactNode }) {
  const numeros = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2 || n === 1 || n === pages);
  return (
    <>
      <span>{resume}</span>
      {pages > 1 && (
        <nav className="tbl-pages" aria-label="Pagination">
          <button type="button" aria-label="Page précédente" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
          {numeros.map((n, i) => (
            <span key={n} style={{ display: "contents" }}>
              {i > 0 && n - numeros[i - 1] > 1 && <span className="tbl-ellipse" aria-hidden="true">…</span>}
              <button type="button" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
            </span>
          ))}
          <button type="button" aria-label="Page suivante" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
        </nav>
      )}
    </>
  );
}

/** Champ de recherche de la barre d'outils d'un tableau. */
export function ChampRecherche({ valeur, onChange, libelle, placeholder }: { valeur: string; onChange: (v: string) => void; libelle: string; placeholder: string }) {
  return (
    <label className="tbl-recherche">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" aria-label={libelle} placeholder={placeholder} value={valeur} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Filtre en pastille de la barre d'outils (actif / inactif). */
export function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="tbl-pastille" aria-pressed={actif} onClick={onClick}>{children}</button>;
}

/** Nombre d'éléments par page dans toutes les listes et tous les tableaux de l'application. */
export const PAR_PAGE = 6;
