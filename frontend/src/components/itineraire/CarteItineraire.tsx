/**
 * Carte de la section « Itinéraire ».
 *
 * Même rendu que la carte micro (<SenegalMap>) : fond de carte (fondCarte.ts), pays voisins voilés,
 * contour du Sénégal, une épingle par structure — sièges des IMF compris — dès l'ouverture. En plus :
 *  - un clic sur une épingle ouvre sa fiche (« Y aller ») ;
 *  - point de départ déplaçable, posé d'un clic sur la carte quand `placement` est actif ;
 *  - trajet tracé en or sur contour nuit, et recadrage sur l'ensemble du trajet.
 */
import "maplibre-gl/dist/maplibre-gl.css";

import {
  AttributionControl, Map as Carte, Marker, NavigationControl,
  type ExpressionSpecification, type GeoJSONSource, type LngLatBoundsLike, type MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import masqueUrl from "../../data/senegal-masque.geojson?url";
import { COULEUR_TYPE_POINT } from "../../styles/tokens";
import { styleCarte } from "../carto/fondCarte";
import { FR, dessinerEpingle, mouvementReduit, type TypePoint } from "../carto/SenegalMap";
import type { Position, TypeDestination } from "./types";

/** Épingle de la carte (GET /itineraires/destinations/carte/) : siège d'IMF (type_point « IMF ») ou point de service. */
export interface PointItineraire {
  type: TypeDestination; id: string; nom: string; sous_titre: string;
  type_point: TypePoint | "IMF"; statut: string; lat: number; lon: number;
}
/** Couleur de l'épingle d'un siège d'institution : nuit cerclée d'or (les points gardent celles de la carte micro). */
export const COULEUR_IMF = "#0B1424";
export interface Marges { top: number; right: number; bottom: number; left: number }

interface Props {
  points: PointItineraire[];
  origine: Position | null;
  destination: Position | null;
  trajet: [number, number][] | null;
  /** Un clic sur la carte (hors épingle) place le point de départ. */
  placement: boolean;
  /** Espace occupé par le panneau au-dessus de la carte (mobile), pour les recadrages. */
  marges: Marges;
  onOrigine: (p: Position) => void;
  onPoint: (p: PointItineraire) => void;
}

const SENEGAL: LngLatBoundsLike = [[-17.56, 12.28], [-11.34, 16.71]];
const LIMITES: LngLatBoundsLike = [[-27, 6], [-2, 23]];
const VIDE = { type: "FeatureCollection" as const, features: [] };

type Collection = Parameters<GeoJSONSource["setData"]>[0];
const ligne = (coords: [number, number][] | null): Collection =>
  coords ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } : VIDE;
const point = (p: Position | null): Collection =>
  p ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } } : VIDE;

export function CarteItineraire({ points, origine, destination, trajet, placement, marges, onOrigine, onPoint }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carteRef = useRef<Carte | null>(null);
  const repere = useRef<Marker | null>(null);
  const [pret, setPret] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  // Valeurs lues par les gestionnaires d'événements de la carte, créés une seule fois.
  const etat = useRef({ placement, points, onOrigine, onPoint, marges });
  etat.current = { placement, points, onOrigine, onPoint, marges };

  /* --- Création de la carte --- */
  useEffect(() => {
    let annule = false;
    let carte: Carte | null = null;
    const masque = fetch(masqueUrl).then((r) => r.json()).catch(() => null);
    Promise.all([styleCarte("light"), masque]).then(([fond, contours]) => {
      if (annule || !conteneur.current) return;
      setHorsLigne(fond.horsLigne);
      carte = new Carte({
        container: conteneur.current, style: fond.style, bounds: SENEGAL, maxBounds: LIMITES, maxZoom: 18,
        // Sur téléphone, le pays est cadré dans la partie visible, au-dessus du panneau.
        fitBoundsOptions: { padding: { top: 16, right: 16, left: 16, bottom: etat.current.marges.bottom + 16 } },
        attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        renderWorldCopies: false, fadeDuration: 150, locale: FR,
      });
      const c = carte;
      c.touchZoomRotate.disableRotation();
      c.keyboard.disableRotation();
      c.addControl(new NavigationControl({ showCompass: false }), "top-right");
      if (!fond.horsLigne) c.addControl(new AttributionControl({ compact: true }), "bottom-right");

      c.on("load", () => {
        if (annule) return;
        (Object.keys(COULEUR_TYPE_POINT) as TypePoint[]).forEach((t) =>
          c.addImage(`epingle-${t}`, dessinerEpingle(COULEUR_TYPE_POINT[t], "#FFFFFF", "#FFFFFF"), { pixelRatio: 2 }));
        c.addImage("epingle-FERME", dessinerEpingle("#FFFFFF", "#6B7280", "#9AA3B2"), { pixelRatio: 2 });
        c.addImage("epingle-IMF", dessinerEpingle(COULEUR_IMF, "#C9A44C", "#C9A44C"), { pixelRatio: 2 });
        c.addImage("epingle-arrivee", dessinerEpingle("#C9A44C", "#0B1424", "#0B1424"), { pixelRatio: 2 });

        // Comme la carte micro : pays voisins voilés et contour du Sénégal, sous les noms de lieux.
        if (contours) {
          const avant = fond.style.layers.find((l) => l.type === "symbol" && l.layout && "text-field" in l.layout)?.id;
          c.addSource("masque", { type: "geojson", data: contours });
          c.addLayer({ id: "voile", type: "fill", source: "masque", filter: ["==", ["get", "role"], "voile"],
            paint: { "fill-color": "#FAF7F0", "fill-opacity": 0.84, "fill-antialias": false } }, avant);
          c.addLayer({ id: "contour", type: "line", source: "masque", filter: ["==", ["get", "role"], "contour"], layout: { "line-join": "round" },
            paint: { "line-color": "#0B1424", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 9, 2.2], "line-opacity": 0.7 } }, avant);
        }

        c.addSource("trajet", { type: "geojson", data: VIDE });
        c.addSource("arrivee", { type: "geojson", data: VIDE });
        c.addSource("points", { type: "geojson", data: VIDE });

        c.addLayer({ id: "trajet-contour", type: "line", source: "trajet", layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#0B1424", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 14, 11] } });
        c.addLayer({ id: "trajet", type: "line", source: "trajet", layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#C9A44C", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 6] } });
        // Une épingle par structure, tailles de la carte micro ; sièges des institutions au-dessus.
        const siege: ExpressionSpecification = ["==", ["get", "type"], "IMF"];
        c.addLayer({ id: "points", type: "symbol", source: "points",
          layout: {
            "icon-image": ["case", ["==", ["get", "statut"], "FERME"], "epingle-FERME", ["concat", "epingle-", ["get", "type"]]],
            "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 5, ["case", siege, 0.6, 0.44], 9, ["case", siege, 0.95, 0.78], 13, ["case", siege, 1.2, 1]],
            "symbol-sort-key": ["case", siege, 2, 1],
          },
          paint: { "icon-opacity": 1 } });
        c.addLayer({ id: "arrivee", type: "symbol", source: "arrivee",
          layout: { "icon-image": "epingle-arrivee", "icon-anchor": "bottom", "icon-size": 1.35, "icon-allow-overlap": true, "icon-ignore-placement": true } });

        const sources = c.getContainer().querySelector(".maplibregl-ctrl-attrib");
        sources?.classList.remove("maplibregl-compact-show");
        sources?.removeAttribute("open");

        c.on("click", (e: MapMouseEvent) => {
          // Un siège d'IMF et son agence « siège » partagent souvent la même position :
          // on retient l'épingle dessinée au-dessus (l'institution).
          const rang = (t: unknown) => (t === "IMF" ? 0 : 1);
          const [f] = c.queryRenderedFeatures(e.point, { layers: ["points"] })
            .sort((a, b) => rang(a.properties?.type) - rang(b.properties?.type));
          if (f) {
            const p = etat.current.points.find((x) => `${x.type}:${x.id}` === f.properties?.cle);
            if (p) etat.current.onPoint(p);
          } else if (etat.current.placement) {
            etat.current.onOrigine({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          }
        });
        c.on("mousemove", (e) => {
          const survol = c.queryRenderedFeatures(e.point, { layers: ["points"] }).length > 0;
          c.getCanvas().style.cursor = survol ? "pointer" : etat.current.placement ? "crosshair" : "";
        });
        carteRef.current = c;
        setPret(true);
      });
    });
    // Le panneau mobile change la taille du cadre sans redimensionner la fenêtre.
    const observateur = new ResizeObserver(() => carteRef.current?.resize());
    if (conteneur.current) observateur.observe(conteneur.current);
    return () => {
      annule = true;
      observateur.disconnect();
      repere.current?.remove();
      repere.current = null;
      carteRef.current = null;
      setPret(false);
      carte?.remove();
    };
  }, []);

  /* --- Points de service --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    (c.getSource("points") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature", properties: { cle: `${p.type}:${p.id}`, type: p.type_point, statut: p.statut },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      })),
    });
  }, [pret, points]);

  /* --- Point de départ (déplaçable) --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    if (!origine) {
      repere.current?.remove();
      repere.current = null;
      return;
    }
    if (!repere.current) {
      const el = document.createElement("div");
      el.className = "it-depart";
      el.setAttribute("aria-label", "Point de départ (déplaçable)");
      el.title = "Point de départ : faites-le glisser pour l'ajuster";
      repere.current = new Marker({ element: el, draggable: true, anchor: "center" }).setLngLat([origine.lon, origine.lat]).addTo(c);
      repere.current.on("dragend", () => {
        const p = repere.current?.getLngLat();
        if (p) etat.current.onOrigine({ lat: p.lat, lon: p.lng });
      });
    } else {
      repere.current.setLngLat([origine.lon, origine.lat]);
    }
  }, [pret, origine]);

  /* --- Destination et trajet, puis recadrage --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    (c.getSource("arrivee") as GeoJSONSource).setData(point(destination));
    (c.getSource("trajet") as GeoJSONSource).setData(ligne(trajet));
    // Trajet affiché : les autres points s'estompent pour laisser le tracé lisible.
    const estompe = trajet ? 0.35 : 1;
    c.setPaintProperty("points", "icon-opacity", estompe);
    const coords: [number, number][] = [...(trajet ?? [])];
    if (destination) coords.push([destination.lon, destination.lat]);
    if (origine) coords.push([origine.lon, origine.lat]);
    if (!coords.length) return;
    const m = etat.current.marges;
    const padding = { top: m.top + 50, right: m.right + 50, bottom: m.bottom + 50, left: m.left + 50 };
    const duration = mouvementReduit() ? 0 : 700;
    if (coords.length === 1) {
      c.easeTo({ center: coords[0], zoom: Math.max(c.getZoom(), 12), padding, duration });
      return;
    }
    const lons = coords.map((x) => x[0]), lats = coords.map((x) => x[1]);
    c.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, maxZoom: 15, duration });
    // Les marges ne sont lues qu'au recadrage : ouvrir ou fermer le panneau ne recadre pas.
  }, [pret, destination, trajet, origine]);

  return (
    <div className="cs-carte it-carte-cadre">
      <div ref={conteneur} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Carte de l'itinéraire" />
      {horsLigne && <div className="cs-hors-ligne">Fond de carte indisponible (hors ligne)</div>}
      <ul className="it-legende" aria-label="Légende">
        <li><span style={{ background: COULEUR_IMF, boxShadow: "0 0 0 2px #C9A44C" }} />Institution (siège)</li>
        <li><span style={{ background: COULEUR_TYPE_POINT.AGENCE }} />Agence</li>
        <li><span style={{ background: COULEUR_TYPE_POINT.GUICHET }} />Guichet</li>
      </ul>
    </div>
  );
}
