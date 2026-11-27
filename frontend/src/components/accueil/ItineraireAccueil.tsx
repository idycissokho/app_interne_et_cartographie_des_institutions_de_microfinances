/**
 * Itinéraire depuis l'accueil public : trajet jusqu'au siège de l'institution affichée dans
 * l'extrait du registre, à pied, à moto et en voiture.
 *
 * Reprend les briques de la section « Itinéraire » (géolocalisation, carte, onglets des modes,
 * étapes, lien Google Maps) et la route publique POST /public/itineraire/ (sans connexion,
 * destination = siège d'une institution). La carte n'est chargée qu'à la première demande.
 * La position du visiteur reste dans le navigateur : elle n'est envoyée qu'au calcul.
 */
import "../itineraire/itineraire.css";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErreurApi, requete } from "../../api/client";
import { btnPrimaire, btnSecondaire } from "../form";
import { CarteItineraire } from "../itineraire/CarteItineraire";
import { Avis, ChargementItineraire, ResultatItineraire } from "../itineraire/ResultatItineraire";
import { MODES, arrondir, distance, duree, lienGoogleMaps, type Mode, type Position, type ReponseCalcul } from "../itineraire/types";
import { PRECISION_FAIBLE, useGeolocalisation } from "../itineraire/useGeolocalisation";

interface Props {
  institution: { id: string; nom: string };
  /** Position fiable du siège, ou null (l'itinéraire ne peut alors pas être calculé). */
  siege: Position | null;
}
interface Origine extends Position { source: "gps" | "carte"; precision?: number }

const TOUS_LES_MODES = MODES.map((m) => m.cle);
const AUCUN_POINT: never[] = [];
const MARGES = { top: 0, right: 0, bottom: 0, left: 0 };
const I_CIBLE = "M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2";
const I_CARTE = "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14";
const Icone = ({ d, taille = 18 }: { d: string; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

function messageApi(e: ErreurApi) {
  const d = e.details as { detail?: unknown } | null;
  return typeof d?.detail === "string" ? d.detail : e.message.replace(/^origine : /, "");
}

export function ItineraireAccueil({ institution, siege }: Props) {
  const geo = useGeolocalisation();
  const [origine, setOrigine] = useState<Origine | null>(null);
  const [placement, setPlacement] = useState(false);
  // La carte (et son fond) ne se charge qu'à la première demande : page légère sur téléphone.
  const [ouvert, setOuvert] = useState(false);
  const [modeChoisi, setModeChoisi] = useState<Mode | null>(null);

  useEffect(() => {
    if (geo.etat.statut !== "ok") return;
    setOrigine({ lat: geo.etat.lat, lon: geo.etat.lon, source: "gps", precision: geo.etat.precision });
    setPlacement(false);
  }, [geo.etat]);

  const depart = origine ? { lat: arrondir(origine.lat), lon: arrondir(origine.lon) } : null;
  const calcul = useQuery({
    queryKey: ["itineraire-public", depart?.lat, depart?.lon, institution.id],
    queryFn: () =>
      requete<ReponseCalcul>("/public/itineraire/", {
        method: "POST", sansEffet: true,
        body: JSON.stringify({ origine: depart, destination: { type: "institution", id: institution.id }, modes: TOUS_LES_MODES }),
      }),
    enabled: depart !== null && siege !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const resultat = depart && calcul.data?.destination.id === institution.id ? calcul.data : null;
  const erreur = calcul.error instanceof ErreurApi ? calcul.error : calcul.error ? new ErreurApi(0, "Le serveur ne répond pas.") : null;
  const mode: Mode = modeChoisi && resultat?.modes[modeChoisi] ? modeChoisi : resultat?.plus_rapide ?? "voiture";
  const courant = resultat?.modes[mode];
  const trajet = courant?.geometrie?.coordinates ?? null;
  useEffect(() => setModeChoisi(null), [depart?.lat, depart?.lon]);

  function utiliserMaPosition() { setOuvert(true); geo.localiser(); }
  function choisirSurLaCarte() { setOuvert(true); setPlacement((v) => !v); }
  function placerDepart(p: Position) { setOrigine({ ...p, source: "carte" }); setPlacement(false); geo.oublier(); }

  if (!siege) {
    return (
      <section className="rg-itineraire rg-itineraire-ferme" aria-labelledby="rg-it-titre">
        <div className="rg-itineraire-tete">
          <h3 id="rg-it-titre">Itinéraire jusqu'au siège</h3>
          <p>La position du siège n'est pas renseignée dans le registre : le trajet ne peut pas être calculé.</p>
        </div>
      </section>
    );
  }

  const precisionFaible = origine?.source === "gps" && (origine.precision ?? 0) > PRECISION_FAIBLE;
  let resultat_ = null;
  if (!origine) {
    resultat_ = ouvert && !placement && geo.etat.statut !== "recherche" && geo.etat.statut !== "erreur"
      ? <Avis ton="info" titre="Indiquez votre point de départ">Utilisez votre position ou touchez la carte.</Avis>
      : null;
  } else if (calcul.isFetching && !resultat) {
    resultat_ = <ChargementItineraire />;
  } else if (erreur) {
    const configuration = erreur.statut === 501;
    resultat_ = (
      <Avis ton="danger" titre={erreur.statut === 400 ? "Point de départ invalide" : erreur.statut === 429 ? "Trop de demandes" : configuration ? "Calcul d'itinéraire non disponible" : "Le calcul n'a pas abouti"}
        action={!configuration && erreur.statut !== 400 ? <button type="button" style={{ ...btnSecondaire, height: 40 }} onClick={() => void calcul.refetch()}>Réessayer</button> : undefined}>
        {erreur.statut === 429 ? "Patientez une minute avant de relancer le calcul." : messageApi(erreur)}
      </Avis>
    );
  } else if (resultat) {
    resultat_ = <ResultatItineraire resultat={resultat} mode={mode} onMode={setModeChoisi} />;
  }

  return (
    <section className={`rg-itineraire${ouvert ? " rg-itineraire-ouvert" : " rg-itineraire-ferme"}`} aria-labelledby="rg-it-titre">
      <div className="rg-itineraire-panneau">
        <div className="rg-itineraire-tete">
          <h3 id="rg-it-titre">Itinéraire jusqu'au siège</h3>
          <p>Le trajet le plus rapide à pied, à moto ou en voiture, depuis votre position.</p>
        </div>

        {origine && !placement && geo.etat.statut !== "recherche" ? (
          <div className="it-choix">
            <span className="it-icone it-icone-depart" aria-hidden="true"><Icone d={I_CIBLE} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="it-sugg-nom">{origine.source === "gps" ? "Votre position" : "Point placé sur la carte"}</div>
              <div className="it-sugg-sous">{origine.source === "gps" && origine.precision ? `Précision ± ${origine.precision} m · ` : ""}repère déplaçable sur la carte</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <button type="button" className="it-lien" onClick={utiliserMaPosition}>Me localiser</button>
              <button type="button" className="it-lien" onClick={choisirSurLaCarte}>Sur la carte</button>
            </div>
          </div>
        ) : (
          <div className="rg-itineraire-actions">
            <button type="button" style={btnPrimaire} onClick={utiliserMaPosition} disabled={geo.etat.statut === "recherche"}>
              <Icone d={I_CIBLE} />{geo.etat.statut === "recherche" ? "Localisation…" : "Utiliser ma position"}
            </button>
            <button type="button" style={btnSecondaire} aria-pressed={placement} onClick={choisirSurLaCarte}>
              <Icone d={I_CARTE} />Choisir le départ sur la carte
            </button>
          </div>
        )}
        {geo.etat.statut === "erreur" && <Avis ton="danger" titre={geo.etat.titre}>{geo.etat.message}</Avis>}
        {placement && <p className="it-aide">Touchez la carte à l'endroit du départ.</p>}
        {precisionFaible && (
          <Avis ton="alerte" titre={`Position approximative (± ${origine!.precision} m)`}>
            Le trajet peut partir d'un point décalé : touchez « Me localiser » à nouveau, ou déplacez le repère.
          </Avis>
        )}
        {resultat_ && <div aria-live="polite">{resultat_}</div>}
        {resultat && courant?.statut === "ok" && (
          <a className="rg-itineraire-gmaps" href={lienGoogleMaps(siege, mode)} target="_blank" rel="noopener noreferrer">
            <Icone d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" taille={16} />
            Ouvrir dans Google Maps ({MODES.find((m) => m.cle === mode)?.libelle.toLowerCase()}, {duree(courant.duree_min)} · {distance(courant.distance_km)})
          </a>
        )}
      </div>

      {ouvert && (
        <div className="rg-itineraire-carte">
          <CarteItineraire
            points={AUCUN_POINT} origine={origine} destination={siege} trajet={trajet}
            placement={placement || !origine} marges={MARGES} integree
            onOrigine={placerDepart} onPoint={() => undefined}
          />
        </div>
      )}
    </section>
  );
}
