/**
 * Fiche d'un dirigeant (tiroir latéral) : coordonnées, modification des coordonnées
 * (SUPERVISEUR / ADMIN) et historique de ses mandats. L'ouverture de la fiche est
 * journalisée par l'API (GET /dirigeants/<id>/).
 */
import { useState, type CSSProperties } from "react";

import { api } from "../../api/client";
import type { Dirigeant, Mandat } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { CODE_FONCTION, joursAvant } from "../../lib/format";
import { LIBELLE_FONCTION, STATUT_MANDAT, initiales } from "../../lib/metier";
import { useDonnees } from "../../lib/useDonnees";
import { Squelette } from "../Squelette";
import { Badge, TON_STATUT } from "../tableau/Tableau";
import { Drawer, EMAIL_OK, Erreur, Label, btnPrimaire, btnSecondaire, erreursChamps } from "../form";

const champ: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const lienBouton: CSSProperties = { border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, color: "#8A6A1F", cursor: "pointer", textAlign: "left" };

export const dateCourte = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Échéance d'un mandat : texte et couleur, ou null s'il n'y a rien à signaler. */
export function echeance(fin: string | null): { texte: string; couleur: string } | null {
  if (!fin) return null;
  const j = joursAvant(fin);
  if (j < 0) return { texte: "Échéance dépassée", couleur: "#B91C1C" };
  if (j <= 30) return { texte: j === 0 ? "Expire aujourd'hui" : `Expire dans ${j} j`, couleur: "#B45309" };
  return null;
}

interface Props {
  id: string;
  onClose: () => void;
  onModifierMandat: (m: Mandat) => void;
  onAjouterMandat: (d: Dirigeant) => void;
  onVoirInstitution: (imf: string) => void;
  onEnregistre: (texte: string) => void;
}

export function FicheDirigeant({ id, onClose, onModifierMandat, onAjouterMandat, onVoirInstitution, onEnregistre }: Props) {
  const { estAdmin, peutModifier } = useAuth();
  const { donnees: d } = useDonnees<{ fiche: Dirigeant }>({ fiche: `/dirigeants/${id}/` });
  const f = d.fiche;
  const [edition, setEdition] = useState<null | { prenom: string; nom: string; telephone: string; email_professionnel: string; email_secondaire: string; adresse: string }>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);

  const invalide = !!edition && (!edition.prenom.trim() || !edition.nom.trim() || !EMAIL_OK(edition.email_professionnel.trim()) || !EMAIL_OK(edition.email_secondaire.trim()));

  async function enregistrer() {
    if (!edition || invalide) return;
    setEnvoi(true);
    try {
      const corps = Object.fromEntries(Object.entries(edition).map(([k, v]) => [k, v.trim()]));
      await api.patch(`/dirigeants/${id}/`, corps);
      setEdition(null); setErreurs({});
      onEnregistre(`${corps.prenom} ${corps.nom}`);
    } catch (e) {
      setErreurs(erreursChamps(e));
    } finally {
      setEnvoi(false);
    }
  }

  const saisie = (cle: keyof NonNullable<typeof edition>, libelle: string, options: { requis?: boolean; type?: string; plein?: boolean; erreur?: string } = {}) => {
    const erreur = options.erreur || erreurs[cle];
    return (
      <div style={{ ...champ, ...(options.plein ? { gridColumn: "span 2" } : {}) }} className={options.plein ? "ps-plein" : undefined}>
        <Label htmlFor={`fd-${cle}`} requis={options.requis}>{libelle}</Label>
        <input id={`fd-${cle}`} type={options.type ?? "text"} className={"fi-input ps-input" + (erreur ? " bad" : "")} value={edition![cle]} onChange={(e) => setEdition({ ...edition!, [cle]: e.target.value })} />
        <Erreur>{erreur}</Erreur>
      </div>
    );
  };

  const coordonnees: [string, string | undefined, string?][] = f ? [
    ["Téléphone", f.telephone, f.telephone ? `tel:${f.telephone.replace(/\s/g, "")}` : undefined],
    ["Email professionnel", f.email_professionnel, f.email_professionnel ? `mailto:${f.email_professionnel}` : undefined],
    ["Email secondaire", f.email_secondaire, f.email_secondaire ? `mailto:${f.email_secondaire}` : undefined],
    ["Adresse", f.adresse],
  ] : [];

  return (
    <Drawer surTitre="Fiche dirigeant" titre={f?.nom_complet ?? "Chargement…"} onClose={onClose}
      pied={edition
        ? <><button type="button" style={btnSecondaire} onClick={() => { setEdition(null); setErreurs({}); }}>Annuler</button><button type="button" className="di-primary" style={btnPrimaire} disabled={envoi || invalide} onClick={enregistrer}>Enregistrer les coordonnées</button></>
        : <><button type="button" style={btnSecondaire} onClick={onClose}>Fermer</button>{estAdmin && f && <button type="button" className="di-primary" style={btnPrimaire} onClick={() => onAjouterMandat(f)}>+ Ajouter un mandat</button>}</>}>
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
        {d.fiche === null && <Erreur>Cette fiche n'a pas pu être chargée.</Erreur>}
        {d.fiche === undefined && <><Squelette largeur="100%" hauteur={92} style={{ borderRadius: 12 }} /><Squelette largeur="100%" hauteur={220} style={{ borderRadius: 12 }} /></>}
        {f && (<>
          <section style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4" }}>
            <span style={{ width: 54, height: 54, flex: "none", borderRadius: "50%", background: "#F5F5F4", color: "#44403C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-base)", fontWeight: 600 }}>{initiales(f.nom_complet)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", fontSize: "var(--t-lg)", overflowWrap: "anywhere" }}>{f.nom_complet}</b>
              <span style={{ fontSize: "var(--t-sm)", color: "#6B7280" }}>{f.mandats.length} mandat{f.mandats.length > 1 ? "s" : ""} · {new Set(f.mandats.map((m) => m.imf)).size} institution{new Set(f.mandats.map((m) => m.imf)).size > 1 ? "s" : ""}</span>
            </div>
            {peutModifier && !edition && <button type="button" onClick={() => setEdition({ prenom: f.prenom, nom: f.nom, telephone: f.telephone, email_professionnel: f.email_professionnel, email_secondaire: f.email_secondaire, adresse: f.adresse })} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #E7E5E4", background: "#FFFFFF", color: "#0B1424", font: "inherit", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", flex: "none" }}>Modifier</button>}
          </section>

          {edition ? (
            <form onSubmit={(e) => { e.preventDefault(); void enregistrer(); }} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="ps-grille2">
              {saisie("prenom", "Prénom", { requis: true, erreur: edition.prenom.trim() ? undefined : "Le prénom est obligatoire." })}
              {saisie("nom", "Nom", { requis: true, erreur: edition.nom.trim() ? undefined : "Le nom est obligatoire." })}
              {saisie("telephone", "Téléphone", { type: "tel" })}
              {saisie("email_professionnel", "Email professionnel", { type: "email", erreur: EMAIL_OK(edition.email_professionnel.trim()) ? undefined : "Adresse email invalide." })}
              {saisie("email_secondaire", "Email secondaire", { type: "email", plein: true, erreur: EMAIL_OK(edition.email_secondaire.trim()) ? undefined : "Adresse email invalide." })}
              {saisie("adresse", "Adresse", { plein: true })}
              <div style={{ gridColumn: "span 2" }} className="ps-plein"><Erreur>{erreurs.__global}</Erreur></div>
              <button type="submit" hidden />
            </form>
          ) : (
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 18px" }} className="ps-grille2">
              {coordonnees.map(([libelle, valeur, href]) => (
                <div key={libelle} style={{ minWidth: 0 }}>
                  <dt style={{ fontSize: "var(--t-sm)", fontWeight: 400, color: "#6B7280" }}>{libelle}</dt>
                  <dd style={{ margin: "4px 0 0 0", fontSize: "var(--t-md)", fontWeight: 500, overflowWrap: "anywhere", color: valeur ? "#0B1424" : "#9AA3B2" }}>{valeur ? (href ? <a href={href} style={{ color: "inherit" }}>{valeur}</a> : valeur) : "Non renseigné"}</dd>
                </div>
              ))}
            </dl>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: "var(--t-base)", fontWeight: 700 }}>Mandats <span style={{ color: "#6B7280", fontWeight: 500 }}>· {f.mandats.length}</span></h3>
            {f.mandats.length === 0 && <span className="fi-help">Aucun mandat enregistré pour ce dirigeant.</span>}
            {f.mandats.map((m) => {
              const ech = echeance(m.date_fin);
              const lien = m.fichier_justificatif || m.documents_justificatifs;
              return (
                <article key={m.id} style={{ padding: 14, borderRadius: 12, border: "1px solid #E7E5E4", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {CODE_FONCTION[m.fonction_mandat] && <span style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "#44403C", background: "#F5F5F4", padding: "3px 7px", borderRadius: 6, flex: "none" }}>{CODE_FONCTION[m.fonction_mandat]}</span>}
                    <b style={{ flex: 1, fontSize: "var(--t-md)", lineHeight: 1.4 }}>{LIBELLE_FONCTION[m.fonction_mandat] ?? m.fonction_mandat}</b>
                    <Badge ton={TON_STATUT[m.statut_mandat]}>{STATUT_MANDAT[m.statut_mandat]}</Badge>
                  </div>
                  <button type="button" style={lienBouton} title="Voir tous les dirigeants de cette institution" onClick={() => onVoirInstitution(m.imf)}>{m.imf_nom} →</button>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center", fontSize: "var(--t-sm)", color: "#4A5568" }}>
                    <span>{dateCourte(m.date_debut)} → {m.date_fin ? dateCourte(m.date_fin) : "sans échéance"}</span>
                    {ech && <span style={{ fontWeight: 700, color: ech.couleur }}>{ech.texte}</span>}
                    {lien ? <a href={lien} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Justificatif</a> : <span style={{ fontWeight: 600, color: "#B45309" }}>Justificatif manquant</span>}
                    {peutModifier && <button type="button" style={{ ...lienBouton, marginLeft: "auto", color: "#0B1424" }} onClick={() => onModifierMandat(m)}>✎ Modifier le mandat</button>}
                  </div>
                </article>
              );
            })}
          </section>
        </>)}
      </div>
    </Drawer>
  );
}
