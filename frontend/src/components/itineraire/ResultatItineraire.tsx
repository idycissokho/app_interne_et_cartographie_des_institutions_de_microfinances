/**
 * Résultat d'un calcul : onglets À pied / Moto / Voiture (durée, distance, le plus rapide mis en avant),
 * étapes en français, récapitulatif de la destination et lien Google Maps. Tous les états :
 * chargement, erreur du moteur (Réessayer), aucun itinéraire, mode indisponible.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

import { regionAffichee } from "../../lib/metier";
import { btnPrimaire } from "../form";
import { Squelette } from "../Squelette";
import { Badge } from "../tableau/Tableau";
import { IconeDestination } from "./RechercheDestination";
import { MODES, distance, duree, lienGoogleMaps, type Destination, type Mode, type ReponseCalcul } from "./types";

const lien: CSSProperties = { ...btnPrimaire, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", boxSizing: "border-box", width: "100%" };

export function Avis({ ton, titre, children, action }: { ton: "info" | "alerte" | "danger"; titre: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`it-avis it-avis-${ton}`} role={ton === "danger" ? "alert" : "status"}>
      <b>{titre}</b>
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}

export function ChargementItineraire() {
  return (
    <div role="status" aria-label="Calcul de l'itinéraire" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[0, 1, 2].map((i) => <Squelette key={i} largeur="100%" hauteur={64} style={{ borderRadius: 10 }} />)}
      </div>
      {[0, 1, 2, 3].map((i) => <Squelette key={i} largeur={`${90 - i * 12}%`} hauteur={16} />)}
    </div>
  );
}

/** Étapes affichées d'emblée ; les suivantes sur demande (un trajet en compte souvent 20 à 30). */
const ETAPES_VISIBLES = 4;

export function ResultatItineraire({ resultat, mode, onMode }: { resultat: ReponseCalcul; mode: Mode; onMode: (m: Mode) => void }) {
  const [toutes, setToutes] = useState(false);
  const modes = MODES.filter((m) => resultat.modes[m.cle]);
  const courant = resultat.modes[mode];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div role="tablist" aria-label="Mode de déplacement" className="it-onglets">
        {modes.map((m) => {
          const r = resultat.modes[m.cle]!;
          const ok = r.statut === "ok";
          const rapide = resultat.plus_rapide === m.cle;
          return (
            <button
              key={m.cle} type="button" role="tab" id={`it-onglet-${m.cle}`} aria-selected={m.cle === mode} aria-controls="it-detail"
              className="it-onglet" data-rapide={rapide || undefined} onClick={() => onMode(m.cle)}
            >
              <span className="it-onglet-mode">{m.libelle}</span>
              <span className={ok ? "it-onglet-duree" : "it-onglet-duree it-onglet-na"}>{ok ? duree(r.duree_min) : r.statut === "aucun_itineraire" ? "Aucun trajet" : "Indisponible"}</span>
              <span className="it-onglet-dist">{ok ? distance(r.distance_km) : " "}</span>
              {rapide && <span className="it-rapide">Le plus rapide</span>}
            </button>
          );
        })}
      </div>

      <div id="it-detail" role="tabpanel" aria-labelledby={`it-onglet-${mode}`}>
        {!courant ? null : courant.statut === "ok" ? (
          <>
          <ol className="it-etapes" aria-label="Étapes du trajet">
            {(toutes ? courant.etapes : courant.etapes.slice(0, ETAPES_VISIBLES)).map((e, i) => (
              <li key={i}>
                <span className="it-etape-num" aria-hidden="true">{i + 1}</span>
                <span className="it-etape-texte">{e.instruction}</span>
                {e.distance_km > 0 && <span className="it-etape-mesure">{distance(e.distance_km)} · {duree(e.duree_min)}</span>}
              </li>
            ))}
          </ol>
          {courant.etapes.length > ETAPES_VISIBLES && (
            <button type="button" className="it-lien" aria-expanded={toutes} onClick={() => setToutes((v) => !v)}>
              {toutes ? "Masquer le détail" : `Afficher les ${courant.etapes.length} étapes`}
            </button>
          )}
          </>
        ) : courant.statut === "aucun_itineraire" ? (
          <Avis ton="alerte" titre="Aucun itinéraire trouvé">{courant.message || "Essayez un autre mode ou déplacez le point de départ près d'une route."}</Avis>
        ) : courant.statut === "erreur" ? (
          <Avis ton="danger" titre="Ce mode n'a pas pu être calculé">{courant.message}</Avis>
        ) : (
          <Avis ton="info" titre="Mode indisponible">{courant.message || "Le fournisseur ne propose pas ce mode pour ce trajet."} Aucune estimation n'est affichée.</Avis>
        )}
      </div>
    </div>
  );
}

export function FicheDestination({ destination, mode }: { destination: Destination; mode: Mode }) {
  return (
    <section className="it-fiche" aria-label="Destination">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <IconeDestination type={destination.type} taille={20} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="it-fiche-nom">{destination.nom}</div>
          <div className="it-fiche-sous">{destination.sous_titre}</div>
        </div>
        <Badge ton="neutre" point={false}>{destination.type === "institution" ? "Institution" : "Point de service"}</Badge>
      </div>
      <dl className="it-fiche-infos">
        {destination.adresse && <><dt>Adresse</dt><dd>{destination.adresse}</dd></>}
        {destination.region && <><dt>Région</dt><dd>{regionAffichee(destination.region)}</dd></>}
        {destination.telephone && <><dt>Téléphone</dt><dd><a href={`tel:${destination.telephone.split(/[/,;]/)[0].replace(/\s/g, "")}`}>{destination.telephone}</a></dd></>}
      </dl>
      <a href={lienGoogleMaps(destination, mode)} target="_blank" rel="noopener noreferrer" style={lien}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
        Ouvrir dans Google Maps
      </a>
    </section>
  );
}
