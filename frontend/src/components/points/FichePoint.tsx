/**
 * Fiche d'un point de service (tiroir latéral, lecture seule) : identité, institution,
 * localisation, contact et indicateurs. « Modifier » ouvre le tiroir d'édition.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { montantCourt, nombre } from "../../lib/format";
import { STATUT_IMF_LONG, STATUT_POINT, TYPE_POINT, regionAffichee } from "../../lib/metier";
import { useDonnees } from "../../lib/useDonnees";
import { COULEUR_TYPE_POINT } from "../../styles/tokens";
import { dateCourte } from "../dirigeants/FicheDirigeant";
import { Drawer, Erreur, btnPrimaire, btnSecondaire } from "../form";
import { Squelette } from "../Squelette";
import { Badge, TON_STATUT } from "../tableau/Tableau";

export interface PointDetail {
  id: string; imf: string; imf_nom: string; imf_sigle: string; nom: string; reference_externe: string;
  type_point: string; est_siege: boolean; statut_point: string; statut_reglementaire: string; adresse: string; lieu_dit: string;
  region: string | null; departement: string | null; commune: string | null;
  region_nom: string | null; departement_nom: string | null; commune_nom: string | null;
  localisation: { coordinates: [number, number] } | null; telephone: string; email: string; url_fiche: string;
  date_ouverture: string | null; nombre_membres: number | null; encours: string; depots: string | null; date_modification: string;
}

const REGL = STATUT_IMF_LONG;
const titreSection: CSSProperties = { margin: 0, fontSize: "var(--t-base)", fontWeight: 700 };
const grille: CSSProperties = { margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 18px" };

function Champ({ libelle, children, plein }: { libelle: string; children?: ReactNode; plein?: boolean }) {
  return (
    <div style={{ minWidth: 0, ...(plein ? { gridColumn: "span 2" } : {}) }} className={plein ? "ps-plein" : undefined}>
      <dt style={{ fontSize: "var(--t-sm)", fontWeight: 400, color: "#6B7280" }}>{libelle}</dt>
      <dd style={{ margin: "4px 0 0 0", fontSize: "var(--t-md)", fontWeight: 500, overflowWrap: "anywhere", color: children ? "#0B1424" : "#9AA3B2" }}>{children || "Non renseigné"}</dd>
    </div>
  );
}

export function FichePoint({ id, onClose, onModifier, onVoirInstitution }: { id: string; onClose: () => void; onModifier: () => void; onVoirInstitution: (imf: string) => void }) {
  const { peutModifier } = useAuth();
  const { donnees: d } = useDonnees<{ fiche: PointDetail }>({ fiche: `/points-service/${id}/` });
  const p = d.fiche;
  const coords = p?.localisation?.coordinates;
  const couleur = p ? COULEUR_TYPE_POINT[p.type_point] : "#C9A44C";

  return (
    <Drawer surTitre="Fiche point de service" titre={p?.nom ?? "Chargement…"} onClose={onClose}
      pied={<><button type="button" style={btnSecondaire} onClick={onClose}>Fermer</button>{/* Itinéraire : ouvert à tous les utilisateurs connectés, comme la section. */}{p && coords && <Link to={`/itineraire?type=point_service&id=${p.id}`} style={{ ...btnSecondaire, display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M18 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" /></svg>Itinéraire</Link>}{peutModifier && p && <button type="button" className="ps-primary" style={btnPrimaire} onClick={onModifier}>✎ Modifier le point</button>}</>}>
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
        {d.fiche === null && <Erreur>Cette fiche n'a pas pu être chargée.</Erreur>}
        {d.fiche === undefined && <><Squelette largeur="100%" hauteur={110} style={{ borderRadius: 12 }} /><Squelette largeur="100%" hauteur={260} style={{ borderRadius: 12 }} /></>}
        {p && (<>
          <section style={{ padding: 16, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", fontWeight: 500, color: "#4A5568" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: couleur }} />{TYPE_POINT[p.type_point] ?? p.type_point}{p.est_siege ? " · Siège social" : ""}</span>
              <Badge ton={TON_STATUT[p.statut_point]}>{STATUT_POINT[p.statut_point] ?? p.statut_point}</Badge>
              <span style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>{REGL[p.statut_reglementaire] ?? p.statut_reglementaire}</span>
            </div>
            <div>
              <span style={{ fontSize: "var(--t-xs)", fontWeight: 500, color: "#6B7280" }}>Institution</span>
              <b style={{ display: "block", fontSize: "var(--t-base)", lineHeight: 1.4, overflowWrap: "anywhere" }}>{p.imf_nom}{p.imf_sigle ? ` (${p.imf_sigle})` : ""}</b>
            </div>
            <div style={{ display: "flex", gap: "6px 18px", flexWrap: "wrap", fontSize: "var(--t-sm)", fontWeight: 500 }}>
              <button type="button" onClick={() => onVoirInstitution(p.imf)} style={{ border: "none", background: "transparent", padding: 0, font: "inherit", color: "#8A6A1F", cursor: "pointer" }}>Tous ses points de service →</button>
              <Link to={`/dirigeants?imf=${p.imf}`} style={{ color: "#8A6A1F", textDecoration: "none" }}>Ses dirigeants →</Link>
              <Link to={`/consultation?imf=${p.imf}`} style={{ color: "#8A6A1F", textDecoration: "none" }}>Fiche de l'institution →</Link>
            </div>
          </section>

          {(() => {
            // Chiffres renseignés seulement : pas de case « — ».
            const chiffres = ([["Membres", p.nombre_membres ? nombre(p.nombre_membres) : ""], ["Encours (FCFA)", Number(p.encours) ? montantCourt(p.encours) : ""], ["Dépôts (FCFA)", Number(p.depots) ? montantCourt(p.depots) : ""]] as [string, string][]).filter(([, v]) => v);
            return chiffres.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${chiffres.length}, minmax(0, 1fr))`, gap: 10 }} className="ps-grille3">
                {chiffres.map(([l, v]) => (
                  <div key={l} style={{ padding: "12px 14px", borderRadius: 10, background: "#FFFFFF", border: "1px solid #F0EFED" }}><b style={{ display: "block", fontSize: "var(--t-lg)", letterSpacing: "-0.02em" }}>{v}</b><span style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#6B7280" }}>{l}</span></div>
                ))}
              </div>
            );
          })()}

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={titreSection}>Localisation</h3>
            <dl style={grille} className="ps-grille2">
              <Champ libelle="Adresse" plein>{p.adresse}</Champ>
              <Champ libelle="Localité">{p.lieu_dit}</Champ>
              <Champ libelle="Commune">{p.commune_nom}</Champ>
              <Champ libelle="Département">{p.departement_nom}</Champ>
              <Champ libelle="Région">{regionAffichee(p.region_nom)}</Champ>
              <Champ libelle="Coordonnées GPS" plein>{coords
                ? <>{coords[1].toFixed(5)}, {coords[0].toFixed(5)} · <a href={`https://www.openstreetmap.org/?mlat=${coords[1]}&mlon=${coords[0]}#map=16/${coords[1]}/${coords[0]}`} target="_blank" rel="noreferrer">Ouvrir sur une carte</a></>
                : <span style={{ color: "#B45309", fontWeight: 700 }}>Point non géolocalisé — absent des cartes</span>}</Champ>
            </dl>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={titreSection}>Contact et suivi</h3>
            <dl style={grille} className="ps-grille2">
              <Champ libelle="Téléphone">{p.telephone && <a href={`tel:${p.telephone.replace(/\s/g, "")}`} style={{ color: "inherit" }}>{p.telephone}</a>}</Champ>
              <Champ libelle="Email">{p.email && <a href={`mailto:${p.email}`} style={{ color: "inherit" }}>{p.email}</a>}</Champ>
              <Champ libelle="Date d'ouverture">{p.date_ouverture && dateCourte(p.date_ouverture)}</Champ>
              <Champ libelle="Dernière modification">{new Date(p.date_modification).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</Champ>
              <Champ libelle="Référence source">{p.reference_externe}</Champ>
              <Champ libelle="Annuaire DRS-SFD">{p.url_fiche && <a href={p.url_fiche} target="_blank" rel="noreferrer">Voir la fiche d'origine</a>}</Champ>
            </dl>
          </section>
        </>)}
      </div>
    </Drawer>
  );
}
