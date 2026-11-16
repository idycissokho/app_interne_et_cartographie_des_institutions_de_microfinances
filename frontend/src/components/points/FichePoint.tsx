/**
 * Fiche d'un point de service (tiroir latéral, lecture seule) : identité, institution,
 * localisation, contact et indicateurs. « Modifier » ouvre le tiroir d'édition.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { montantCourt, nombre } from "../../lib/format";
import { SB, STATUT_POINT, TYPE_POINT, regionAffichee } from "../../lib/metier";
import { useDonnees } from "../../lib/useDonnees";
import { COULEUR_TYPE_POINT } from "../../styles/tokens";
import { dateCourte } from "../dirigeants/FicheDirigeant";
import { Drawer, Erreur, btnPrimaire, btnSecondaire } from "../form";
import { Squelette } from "../Squelette";

export interface PointDetail {
  id: string; imf: string; imf_nom: string; imf_sigle: string; nom: string; reference_externe: string;
  type_point: string; statut_point: string; statut_reglementaire: string; adresse: string; lieu_dit: string;
  region: string | null; departement: string | null; commune: string | null;
  region_nom: string | null; departement_nom: string | null; commune_nom: string | null;
  localisation: { coordinates: [number, number] } | null; telephone: string; email: string; url_fiche: string;
  date_ouverture: string | null; nombre_membres: number | null; encours: string; depots: string | null; date_modification: string;
}

const REGL: Record<string, string> = { EN_COURS: "En cours d'agrément", AGREE: "Agréé", RADIE: "Radié" };
const titreSection: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };
const grille: CSSProperties = { margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 18px" };

function Champ({ libelle, children, plein }: { libelle: string; children?: ReactNode; plein?: boolean }) {
  return (
    <div style={{ minWidth: 0, ...(plein ? { gridColumn: "span 2" } : {}) }} className={plein ? "ps-plein" : undefined}>
      <dt style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280" }}>{libelle}</dt>
      <dd style={{ margin: "4px 0 0 0", fontSize: 14, fontWeight: 600, overflowWrap: "anywhere", color: children ? "#0B1424" : "#9AA3B2" }}>{children || "Non renseigné"}</dd>
    </div>
  );
}

export function FichePoint({ id, onClose, onModifier, onVoirInstitution }: { id: string; onClose: () => void; onModifier: () => void; onVoirInstitution: (imf: string) => void }) {
  const { peutModifier } = useAuth();
  const { donnees: d } = useDonnees<{ fiche: PointDetail }>({ fiche: `/points-service/${id}/` });
  const p = d.fiche;
  const coords = p?.localisation?.coordinates;
  const c = p ? SB[p.statut_point === "SUSPENDU" ? "SUSPENDU_POINT" : p.statut_point] : undefined;
  const couleur = p ? COULEUR_TYPE_POINT[p.type_point] : "#C9A44C";

  return (
    <Drawer surTitre="Fiche point de service" titre={p?.nom ?? "Chargement…"} onClose={onClose}
      pied={<><button type="button" style={btnSecondaire} onClick={onClose}>Fermer</button>{peutModifier && p && <button type="button" className="ps-primary" style={btnPrimaire} onClick={onModifier}>✎ Modifier le point</button>}</>}>
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
        {d.fiche === null && <Erreur>Cette fiche n'a pas pu être chargée.</Erreur>}
        {d.fiche === undefined && <><Squelette largeur="100%" hauteur={110} style={{ borderRadius: 18 }} /><Squelette largeur="100%" hauteur={260} style={{ borderRadius: 18 }} /></>}
        {p && (<>
          <section style={{ padding: 16, borderRadius: 18, background: "#0B1424", color: "#F4EFE3", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,.08)" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: couleur }} />{TYPE_POINT[p.type_point] ?? p.type_point}</span>
              <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: c?.[0], color: c?.[1] }}>{STATUT_POINT[p.statut_point] ?? p.statut_point}</span>
              <span style={{ fontSize: 12, color: "#A9B3C4" }}>{REGL[p.statut_reglementaire] ?? p.statut_reglementaire}</span>
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#8E99AB" }}>Institution</span>
              <b style={{ display: "block", fontSize: 15, lineHeight: 1.4, overflowWrap: "anywhere" }}>{p.imf_nom}{p.imf_sigle ? ` (${p.imf_sigle})` : ""}</b>
            </div>
            <div style={{ display: "flex", gap: "6px 18px", flexWrap: "wrap", fontSize: 13, fontWeight: 700 }}>
              <button type="button" onClick={() => onVoirInstitution(p.imf)} style={{ border: "none", background: "transparent", padding: 0, font: "inherit", color: "#F3D98C", cursor: "pointer" }}>Tous ses points de service →</button>
              <Link to={`/dirigeants?imf=${p.imf}`} style={{ color: "#F3D98C", textDecoration: "none" }}>Ses dirigeants →</Link>
              <Link to={`/consultation?imf=${p.imf}`} style={{ color: "#F3D98C", textDecoration: "none" }}>Fiche de l'institution →</Link>
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="ps-grille3">
            {([["Membres", p.nombre_membres != null ? nombre(p.nombre_membres) : "—"], ["Encours (FCFA)", montantCourt(p.encours)], ["Dépôts (FCFA)", montantCourt(p.depots)]] as const).map(([l, v]) => (
              <div key={l} style={{ padding: "12px 14px", borderRadius: 14, background: "#FDFBF6", border: "1px solid #F1ECE0" }}><b style={{ display: "block", fontSize: 20, letterSpacing: "-0.02em" }}>{v}</b><span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>{l}</span></div>
            ))}
          </div>

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
                : <span style={{ color: "#B45309", fontWeight: 800 }}>Point non géolocalisé — absent des cartes</span>}</Champ>
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
