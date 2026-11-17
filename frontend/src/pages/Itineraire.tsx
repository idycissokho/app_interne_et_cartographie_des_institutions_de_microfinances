/**
 * Section « Itinéraire » — chemin le plus rapide entre la position de l'utilisateur et une IMF
 * ou un point de service (tous les utilisateurs connectés).
 *
 * - Bureau : panneau à gauche, carte à droite. Téléphone : carte plein écran et panneau en bas
 *   que l'on fait glisser (replié / mi-hauteur / plein).
 * - Départ : « Utiliser ma position » (GPS) ou un clic sur la carte ; repère déplaçable.
 * - Destination : recherche, clic sur une épingle (« Y aller »), ou lien direct
 *   /itineraire?type=institution|point_service&id=<uuid> (bouton des fiches).
 * - Les trois modes sont calculés en une requête (clé : origine arrondie, destination, modes).
 */
import "../components/itineraire/itineraire.css";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as EvPointeur } from "react";
import { useSearchParams } from "react-router-dom";

import { requeteApi } from "../api/cache";
import { ErreurApi, requete } from "../api/client";
import { btnPrimaire, btnSecondaire } from "../components/form";
import { CarteItineraire, type PointItineraire } from "../components/itineraire/CarteItineraire";
import { IconeDestination, RechercheDestination } from "../components/itineraire/RechercheDestination";
import { Avis, ChargementItineraire, FicheDestination, ResultatItineraire } from "../components/itineraire/ResultatItineraire";
import { MODES, arrondir, distance, duree, type Destination, type Mode, type Position, type ReponseCalcul, type TypeDestination } from "../components/itineraire/types";
import { PRECISION_FAIBLE, useGeolocalisation } from "../components/itineraire/useGeolocalisation";
import { AppLayout } from "../components/layout/AppLayout";
import { Squelette } from "../components/Squelette";
import { Badge } from "../components/tableau/Tableau";
import { TYPE_POINT } from "../lib/metier";
import { useDonnees } from "../lib/useDonnees";

interface Origine extends Position { source: "gps" | "carte"; precision?: number }
type Cran = "replie" | "moyen" | "plein";

const TOUS_LES_MODES = MODES.map((m) => m.cle);
const AUCUNE: PointItineraire[] = [];
/** Toutes les épingles (sièges d'IMF et points de service à la position fiable), filtrées par le serveur. */
export const URL_EPINGLES = "/itineraires/destinations/carte/";
const MOBILE = "(max-width: 760px)";
const hauteurCran = (cran: Cran) => (cran === "replie" ? 92 : Math.round(window.innerHeight * (cran === "plein" ? 0.88 : 0.46)));
const bouton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, flex: "1 1 auto" };
const I_CIBLE = "M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2";
const I_CARTE = "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14";
const Icone = ({ d }: { d: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/** Message lisible d'une erreur de l'API : son « detail » s'il existe (sans le code technique). */
function messageApi(e: ErreurApi) {
  const d = e.details as { detail?: unknown } | null;
  return typeof d?.detail === "string" ? d.detail : e.message.replace(/^origine : /, "");
}

function useMedia(requeteCss: string) {
  const [ok, setOk] = useState(() => matchMedia(requeteCss).matches);
  useEffect(() => {
    const m = matchMedia(requeteCss);
    const suivre = () => setOk(m.matches);
    m.addEventListener("change", suivre);
    return () => m.removeEventListener("change", suivre);
  }, [requeteCss]);
  return ok;
}

export function Itineraire() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type") as TypeDestination | null;
  const idDestination = params.get("id");
  const cible = (type === "institution" || type === "point_service") && idDestination ? { type, id: idDestination } : null;

  const geo = useGeolocalisation();
  const [origine, setOrigine] = useState<Origine | null>(null);
  const [placement, setPlacement] = useState(false);
  const [modeChoisi, setModeChoisi] = useState<Mode | null>(null);
  const [pointOuvert, setPointOuvert] = useState<PointItineraire | null>(null);
  const mobile = useMedia(MOBILE);
  const [cran, setCran] = useState<Cran>("moyen");
  const page = useRef<HTMLDivElement>(null);

  // Sur téléphone, le menu est au-dessus : la page s'ouvre directement sur la carte.
  useEffect(() => { if (matchMedia(MOBILE).matches) page.current?.scrollIntoView({ block: "start" }); }, []);

  // Lien « Itinéraire » de la carte micro (?position=1) : la position est demandée aussitôt.
  // Le navigateur pose la question la première fois ; ensuite le trajet s'affiche directement.
  const demanderPosition = params.get("position") === "1";
  const { localiser } = geo;
  useEffect(() => {
    if (demanderPosition) localiser();
  }, [demanderPosition, localiser]);

  useEffect(() => {
    if (geo.etat.statut !== "ok") return;
    setOrigine({ lat: geo.etat.lat, lon: geo.etat.lon, source: "gps", precision: geo.etat.precision });
    setPlacement(false);
  }, [geo.etat]);

  /* --- Épingles : toutes les structures dès l'ouverture, comme la carte micro --- */
  const { donnees } = useDonnees<{ epingles: { results: PointItineraire[] } }>({ epingles: URL_EPINGLES });
  const points = donnees.epingles?.results ?? AUCUNE;

  /* --- Destination relue par le serveur --- */
  const destination = useQuery({
    ...requeteApi<Destination>(cible ? `/itineraires/destinations/${cible.type}/${cible.id}/` : ""),
    enabled: cible !== null,
  });
  const dest = cible && destination.data && destination.data.id === cible.id ? destination.data : null;
  const erreurDest = destination.error instanceof ErreurApi ? destination.error : null;

  /* --- Calcul des trois modes --- */
  const depart = origine ? { lat: arrondir(origine.lat), lon: arrondir(origine.lon) } : null;
  const calcul = useQuery({
    queryKey: ["itineraire", depart?.lat, depart?.lon, cible?.type, cible?.id, TOUS_LES_MODES],
    queryFn: () =>
      requete<ReponseCalcul>("/itineraires/calculer/", {
        method: "POST", sansEffet: true,
        body: JSON.stringify({ origine: depart, destination: cible, modes: TOUS_LES_MODES }),
      }),
    enabled: depart !== null && dest !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const resultat = depart && dest && calcul.data?.destination.id === dest.id ? calcul.data : null;
  const erreurCalcul = calcul.error instanceof ErreurApi ? calcul.error : calcul.error ? new ErreurApi(0, "Le serveur ne répond pas.") : null;
  const mode: Mode = modeChoisi && resultat?.modes[modeChoisi] ? modeChoisi : resultat?.plus_rapide ?? "voiture";
  const trajet = resultat?.modes[mode]?.geometrie?.coordinates ?? null;
  const courant = resultat?.modes[mode];
  const resume = courant?.statut === "ok" ? `${MODES.find((m) => m.cle === mode)?.libelle} · ${duree(courant.duree_min)} · ${distance(courant.distance_km)}` : null;
  // Nouveau trajet : on revient sur le mode le plus rapide.
  useEffect(() => setModeChoisi(null), [depart?.lat, depart?.lon, cible?.id]);

  function choisir(d: { type: TypeDestination; id: string }) {
    setParams({ type: d.type, id: d.id });
    setPointOuvert(null);
    if (mobile && cran === "replie") setCran("moyen");
  }
  function placerDepart(p: Position) {
    setOrigine({ ...p, source: "carte" });
    setPlacement(false);
    geo.oublier();
  }

  /* --- Panneau glissant (téléphone) --- */
  const panneau = useRef<HTMLElement>(null);
  const glisse = useRef<{ y: number; h: number; bouge: boolean } | null>(null);
  const debutGlisse = (e: EvPointeur<HTMLButtonElement>) => {
    if (!mobile || !panneau.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    glisse.current = { y: e.clientY, h: panneau.current.offsetHeight, bouge: false };
    panneau.current.dataset.glisse = "true";
  };
  const pendantGlisse = (e: EvPointeur<HTMLButtonElement>) => {
    const g = glisse.current;
    if (!g || !panneau.current) return;
    if (Math.abs(e.clientY - g.y) > 4) g.bouge = true;
    panneau.current.style.height = `${Math.max(80, Math.min(window.innerHeight * 0.92, g.h - (e.clientY - g.y)))}px`;
  };
  const finGlisse = () => {
    const g = glisse.current;
    glisse.current = null;
    if (!g || !panneau.current) return;
    delete panneau.current.dataset.glisse;
    const h = panneau.current.offsetHeight;
    panneau.current.style.height = "";
    if (!g.bouge) { setCran((c) => (c === "replie" ? "moyen" : c === "moyen" ? "plein" : "replie")); return; }
    const crans: Cran[] = ["replie", "moyen", "plein"];
    setCran(crans.reduce((a, b) => (Math.abs(hauteurCran(b) - h) < Math.abs(hauteurCran(a) - h) ? b : a)));
  };
  const marges = { top: 0, right: 0, left: 0, bottom: mobile ? hauteurCran(cran) : 0 };

  /* --- Contenu du panneau --- */
  const precisionFaible = origine?.source === "gps" && (origine.precision ?? 0) > PRECISION_FAIBLE;
  const departCompact = origine !== null && !placement && geo.etat.statut !== "recherche" && geo.etat.statut !== "erreur";
  const depart_ = departCompact ? (
    <section className="it-section" aria-labelledby="it-depart-titre">
      <h2 id="it-depart-titre" className="it-titre">Départ</h2>
      <div className="it-choix it-choix-depart">
        <span className="it-icone it-icone-depart" aria-hidden="true"><Icone d={I_CIBLE} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="it-sugg-nom">{origine.source === "gps" ? "Votre position" : "Point placé sur la carte"}</div>
          <div className="it-sugg-sous">{origine.source === "gps" && origine.precision ? `Précision ± ${origine.precision} m · ` : ""}repère déplaçable sur la carte</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <button type="button" className="it-lien" onClick={geo.localiser}>Me localiser</button>
          <button type="button" className="it-lien" onClick={() => setPlacement(true)}>Sur la carte</button>
        </div>
      </div>
      {precisionFaible && (
        <Avis ton="alerte" titre={`Position approximative (± ${origine.precision} m)`}>
          Le trajet peut partir d'un point décalé. Attendez quelques secondes à l'extérieur puis touchez « Me localiser », ou déplacez le repère.
        </Avis>
      )}
    </section>
  ) : (
    <section className="it-section" aria-labelledby="it-depart-titre">
      <h2 id="it-depart-titre" className="it-titre">Départ</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={{ ...(origine ? btnSecondaire : btnPrimaire), ...bouton }} onClick={geo.localiser} disabled={geo.etat.statut === "recherche"}>
          <Icone d={I_CIBLE} />{geo.etat.statut === "recherche" ? "Localisation…" : "Utiliser ma position"}
        </button>
        <button type="button" style={{ ...btnSecondaire, ...bouton }} aria-pressed={placement} onClick={() => setPlacement((v) => !v)}>
          <Icone d={I_CARTE} />Choisir sur la carte
        </button>
      </div>
      {geo.etat.statut === "erreur" && <Avis ton="danger" titre={geo.etat.titre}>{geo.etat.message}</Avis>}
      {placement && <p className="it-aide">Touchez la carte à l'endroit du départ.</p>}
    </section>
  );

  const destination_ = (
    <section className="it-section" aria-labelledby="it-dest-titre">
      <h2 id="it-dest-titre" className="it-titre">Destination</h2>
      {cible && destination.isPending && <Squelette largeur="100%" hauteur={56} style={{ borderRadius: 10 }} />}
      {dest && (
        <div className="it-choix">
          <IconeDestination type={dest.type} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="it-sugg-nom">{dest.nom}</div>
            <div className="it-sugg-sous">{dest.sous_titre}</div>
          </div>
          <button type="button" className="it-lien" onClick={() => setParams({})}>Changer</button>
        </div>
      )}
      {cible && erreurDest && (
        <Avis ton="alerte" titre={erreurDest.statut === 422 ? "Position non valide" : erreurDest.statut === 404 ? "Destination introuvable" : "Destination non chargée"}
          action={erreurDest.statut !== 422 && erreurDest.statut !== 404 ? <button type="button" className="it-lien" onClick={() => void destination.refetch()}>Réessayer</button> : undefined}>
          {messageApi(erreurDest)}
        </Avis>
      )}
      {!dest && <RechercheDestination onChoisir={choisir} />}
      {!dest && <p className="it-aide">Ou touchez une épingle sur la carte, puis « Y aller ».</p>}
    </section>
  );

  let resultat_ = null;
  if (dest && !origine) {
    resultat_ = <Avis ton="info" titre="Indiquez votre point de départ">Utilisez votre position ou touchez la carte pour calculer le trajet.</Avis>;
  } else if (dest && calcul.isFetching && !resultat) {
    resultat_ = <ChargementItineraire />;
  } else if (dest && erreurCalcul) {
    const configuration = erreurCalcul.statut === 501;
    resultat_ = (
      <Avis ton="danger" titre={erreurCalcul.statut === 400 ? "Point de départ invalide" : configuration ? "Calcul d'itinéraire non configuré" : "Le calcul n'a pas abouti"}
        action={!configuration && erreurCalcul.statut !== 400 ? <button type="button" style={{ ...btnSecondaire, height: 40 }} onClick={() => void calcul.refetch()}>Réessayer</button> : undefined}>
        {messageApi(erreurCalcul)}
      </Avis>
    );
  } else if (resultat) {
    resultat_ = <ResultatItineraire resultat={resultat} mode={mode} onMode={setModeChoisi} />;
  }

  return (
    <AppLayout active="itineraire" minHeight={0}>
      <div ref={page} className="it-page">
        <aside ref={panneau} className="it-panneau" data-cran={cran} aria-label="Itinéraire">
          <button
            type="button" className="it-poignee" aria-label={cran === "plein" ? "Réduire le panneau" : "Agrandir le panneau"}
            onPointerDown={debutGlisse} onPointerMove={pendantGlisse} onPointerUp={finGlisse} onPointerCancel={finGlisse}
          ><span /></button>
          <header className="it-entete">
            <div className="it-surtitre">Terrain</div>
            <h1 className="it-h1">Itinéraire</h1>
            {mobile && resume && <span className="it-resume">{resume}</span>}
            {!mobile && <p className="it-aide">Le trajet le plus rapide vers une institution ou un point de service, à pied, à moto ou en voiture.</p>}
          </header>
          {depart_}
          {destination_}
          {resultat_ && <section className="it-section" aria-live="polite" aria-label="Résultat">{resultat_}</section>}
          {dest && <FicheDestination destination={dest} mode={mode} />}
        </aside>

        <div className="it-carte">
          <CarteItineraire
            points={points} origine={origine} destination={dest} trajet={trajet}
            placement={placement || !origine} marges={marges}
            onOrigine={placerDepart} onPoint={setPointOuvert}
          />
          {pointOuvert && (
            <div className="it-popup" role="dialog" aria-label={pointOuvert.nom}>
              <button type="button" className="it-popup-fermer" aria-label="Fermer" onClick={() => setPointOuvert(null)}>×</button>
              <div style={{ display: "flex", gap: 10, alignItems: "center", paddingRight: 28 }}>
                <IconeDestination type={pointOuvert.type} />
                <div style={{ minWidth: 0 }}>
                  <div className="it-sugg-nom">{pointOuvert.nom}</div>
                  <div className="it-sugg-sous">{pointOuvert.sous_titre}</div>
                </div>
              </div>
              <div><Badge ton="neutre" point={false}>{pointOuvert.type === "institution" ? "Institution (siège)" : TYPE_POINT[pointOuvert.type_point] ?? pointOuvert.type_point}</Badge></div>
              <button type="button" style={{ ...btnPrimaire, height: 44, width: "100%" }} onClick={() => choisir({ type: pointOuvert.type, id: pointOuvert.id })}>Y aller</button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
