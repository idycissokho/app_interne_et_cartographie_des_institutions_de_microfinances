/**
 * <SenegalMap> — carte géographique du Sénégal « façon Google Maps ».
 *
 * Fond de carte réel (routes, villes, cours d'eau : voir fondCarte.ts), limité au Sénégal par un
 * voile sur les pays voisins, sur lequel sont posés, dans l'ordre :
 * régions colorées → sélection → liseré animé → noms du fond de carte → impulsions → épingles.
 * Au survol d'une région, une fiche affiche ses indicateurs.
 *
 * Les propriétés sont celles de l'ancienne carte SVG : les écrans n'ont pas changé d'API.
 */
import "maplibre-gl/dist/maplibre-gl.css";

import {
  AttributionControl, Map as Carte, Marker, NavigationControl, setWorkerUrl,
  type ExpressionSpecification, type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { deprojeter } from "../../data/projection";
import masqueUrl from "../../data/senegal-masque.geojson?url";
import regionsUrl from "../../data/senegal-regions.geojson?url";
import { SENEGAL_REGIONS, cleRegion } from "../../data/senegalRegions";
import { nombre } from "../../lib/format";
import { COULEUR_TYPE_POINT } from "../../styles/tokens";
import { styleCarte } from "./fondCarte";

setWorkerUrl(workerUrl);

export type TypePoint = "SIEGE" | "AGENCE" | "GUICHET" | "BUREAU";
export type StatutPoint = "OUVERT" | "SUSPENDU" | "FERME";
export type Indicateur = "pts" | "imf" | "membres" | "encours";

export interface StatsRegion {
  pts: number;
  imf: number;
  membres: number;
  encours: number;
}

export interface PointCarte {
  id: string;
  /** Position dans le repère de la maquette (voir data/projection.ts)… */
  x: number;
  y: number;
  /** …ou, de préférence, coordonnées GPS exactes. */
  lon?: number;
  lat?: number;
  type: TypePoint;
  statut: StatutPoint;
  region?: string | null;
  imf?: string;
}

export interface FiltrePoints {
  type?: string;
  statut?: string;
  region?: string;
  imf?: string;
}

interface Props {
  theme?: "light" | "dark";
  fillMode?: "regions" | "choro" | "muted";
  indicator?: Indicateur;
  /** Indicateurs par région, indexés par cleRegion(nom). */
  stats?: Record<string, StatsRegion>;
  selected?: string;
  flow?: boolean;
  showPoints?: boolean;
  showLabels?: boolean;
  points?: PointCarte[];
  pointFilter?: FiltrePoints;
  selectedPoint?: { x: number; y: number; lon?: number; lat?: number } | null;
  onPick?: (regionId: string) => void;
  onPickPoint?: (p: PointCarte) => void;
  /** Indicateurs de la fiche de survol (défaut : les quatre si `stats` est fourni). */
  infos?: Indicateur[];
  /** Cadre la carte sur la région sélectionnée (sinon : le pays entier). */
  zoomSelection?: boolean;
  /** Zoom à la molette sans Ctrl : à réserver aux cartes plein cadre (sinon la page ne défile plus). */
  molette?: boolean;
  /** Rayon des coins du cadre, en px. */
  rayon?: number;
}

/* ---------- Géométrie (chargée une fois pour toutes les cartes) ---------- */

interface Entite { type: "Feature"; properties: Record<string, unknown>; geometry: unknown }
interface Collection { type: "FeatureCollection"; features: Entite[] }
type Emprise = [number, number, number, number];
type DonneesGeo = Parameters<GeoJSONSource["setData"]>[0];

const SENEGAL: Emprise = [-17.56, 12.28, -11.34, 16.71];
/** Vue de départ, plus large : la carte « atterrit » ensuite sur le Sénégal. */
const DEPART: Emprise = [-21.2, 9.6, -7.7, 19.4];
const LIMITES: LngLatBoundsLike = [[-27, 6], [-2, 23]];
const REGION_PAR_CLE = new Map(SENEGAL_REGIONS.map((r) => [cleRegion(r.id), r]));
const EMPRISES = new Map<string, Emprise>();

let geometrie: Promise<{ regions: Collection; masque: Collection }> | null = null;
function chargerGeometrie() {
  geometrie ??= Promise.all([fetch(regionsUrl).then((r) => r.json()), fetch(masqueUrl).then((r) => r.json())]).then(
    ([regions, masque]: [Collection, Collection]) => {
      regions.features.forEach((f) => {
        const cle = cleRegion(String(f.properties.nom));
        EMPRISES.set(cle, f.properties.bbox as Emprise);
        f.properties = { cle, nom: REGION_PAR_CLE.get(cle)?.id ?? f.properties.nom };
      });
      return { regions, masque };
    },
  );
  geometrie.catch(() => (geometrie = null));
  return geometrie;
}

const collection = (features: Entite[]): Collection => ({ type: "FeatureCollection", features });
const VIDE_GEO = collection([]);
const lonLat = (p: { x: number; y: number; lon?: number; lat?: number }): [number, number] => {
  if (p.lon !== undefined && p.lat !== undefined) return [p.lon, p.lat];
  const g = deprojeter(p.x, p.y);
  return [g.lon, g.lat];
};

/* ---------- Couleurs ---------- */

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const S = ["#F7EED3", "#EBD594", "#D9B65E", "#C29433", "#9A7124", "#6E4F17", "#43300D"];
function scale(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (S.length - 1);
  const i = Math.floor(x);
  return i >= S.length - 1 ? S[S.length - 1] : mix(S[i], S[i + 1], x - i);
}

const VIDE: StatsRegion = { pts: 0, imf: 0, membres: 0, encours: 0 };
const LIBELLE: Record<Indicateur, string> = { imf: "IMF présentes", pts: "Points de service", membres: "Membres", encours: "Encours (Mds FCFA)" };
const formater = (k: Indicateur, v: number) => (k === "encours" ? v.toFixed(1).replace(".", ",") : nombre(v));

/** Expression MapLibre « valeur par région ». */
const parRegion = <T extends string | number>(valeurs: Map<string, T>, defaut: T) =>
  ["match", ["get", "cle"], ...[...valeurs].flat(), defaut] as unknown as ExpressionSpecification;

/* ---------- Épingles ---------- */

function dessinerEpingle(couleur: string, bord: string, coeur: string) {
  const r = 2;
  const c = document.createElement("canvas");
  c.width = 30 * r;
  c.height = 38 * r;
  const g = c.getContext("2d")!;
  g.scale(r, r);
  g.shadowColor = "rgba(11,20,36,.35)";
  g.shadowBlur = 3;
  g.shadowOffsetY = 1.5;
  g.beginPath();
  g.moveTo(15, 35);
  g.bezierCurveTo(13, 30, 4, 23, 4, 14);
  g.arc(15, 14, 11, Math.PI, 0);
  g.bezierCurveTo(26, 23, 17, 30, 15, 35);
  g.closePath();
  g.fillStyle = couleur;
  g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = 1.8;
  g.strokeStyle = bord;
  g.stroke();
  g.beginPath();
  g.arc(15, 14, 4.2, 0, Math.PI * 2);
  g.fillStyle = coeur;
  g.fill();
  return g.getImageData(0, 0, c.width, c.height);
}

/** Motifs du liseré animé : un tiret qui avance le long des limites (unité : épaisseur du trait). */
const TIRET = 7, VIDE_TIRET = 41, PERIODE = TIRET + VIDE_TIRET;
const LISERE: number[][] = Array.from({ length: PERIODE }, (_, o) =>
  o <= VIDE_TIRET ? [0, o, TIRET, VIDE_TIRET - o] : [o - VIDE_TIRET, VIDE_TIRET, PERIODE - o, 0],
);

const FR = {
  "Map.Title": "Carte du Sénégal",
  "NavigationControl.ZoomIn": "Zoom avant",
  "NavigationControl.ZoomOut": "Zoom arrière",
  "AttributionControl.ToggleAttribution": "Afficher les sources de la carte",
  "CooperativeGesturesHandler.WindowsHelpText": "Maintenez Ctrl et faites défiler pour zoomer",
  "CooperativeGesturesHandler.MacHelpText": "Maintenez ⌘ et faites défiler pour zoomer",
  "CooperativeGesturesHandler.MobileHelpText": "Utilisez deux doigts pour déplacer la carte",
};

const mouvementReduit = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Calques posés sur le fond de carte ---------- */

function installer(carte: Carte, style: StyleSpecification, geo: { regions: Collection; masque: Collection }, dark: boolean) {
  // Les noms de lieux du fond de carte restent lisibles au-dessus des régions colorées.
  const avant = style.layers.find((l) => l.type === "symbol" && l.layout && "text-field" in l.layout)?.id;
  const fondu = { duration: 450 };
  const data = (c: Collection) => c as unknown as DonneesGeo;

  carte.addSource("masque", { type: "geojson", data: data(geo.masque) });
  carte.addSource("regions", { type: "geojson", data: data(geo.regions), promoteId: "cle" });
  carte.addSource("points", { type: "geojson", data: data(VIDE_GEO) });
  carte.addSource("centres", {
    type: "geojson",
    data: data(collection(SENEGAL_REGIONS.map((r) => {
      const g = deprojeter(r.lx, r.ly);
      return { type: "Feature", properties: { nom: r.id }, geometry: { type: "Point", coordinates: [g.lon, g.lat] } };
    }))),
  });

  carte.addLayer({ id: "voile", type: "fill", source: "masque", filter: ["==", ["get", "role"], "voile"],
    paint: { "fill-color": dark ? "#0B1424" : "#FAF7F0", "fill-opacity": dark ? 0.8 : 0.84, "fill-antialias": false } }, avant);
  carte.addLayer({ id: "regions-fill", type: "fill", source: "regions",
    paint: { "fill-color": "#C9A44C", "fill-opacity": 0, "fill-color-transition": fondu, "fill-opacity-transition": fondu } }, avant);
  carte.addLayer({ id: "regions-line", type: "line", source: "regions", layout: { "line-join": "round" },
    paint: { "line-color": "#C9A44C", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.9, 9, 1.8], "line-opacity": 0.9 } }, avant);
  carte.addLayer({ id: "sel-fill", type: "fill", source: "regions", filter: ["==", ["get", "nom"], ""],
    paint: { "fill-color": dark ? "#F3D98C" : "#C9A44C", "fill-opacity": 0.3 } }, avant);
  carte.addLayer({ id: "sel-halo", type: "line", source: "regions", filter: ["==", ["get", "nom"], ""], layout: { "line-join": "round" },
    paint: { "line-color": "#C9A44C", "line-width": 9, "line-blur": 7, "line-opacity": dark ? 0.75 : 0.6 } }, avant);
  carte.addLayer({ id: "sel-line", type: "line", source: "regions", filter: ["==", ["get", "nom"], ""], layout: { "line-join": "round" },
    paint: { "line-color": dark ? "#F3D98C" : "#0B1424", "line-width": 2.6 } }, avant);
  carte.addLayer({ id: "contour-halo", type: "line", source: "masque", filter: ["==", ["get", "role"], "contour"], layout: { "line-join": "round" },
    paint: { "line-color": "#C9A44C", "line-width": 7, "line-blur": 6, "line-opacity": dark ? 0.5 : 0.35 } }, avant);
  carte.addLayer({ id: "contour", type: "line", source: "masque", filter: ["==", ["get", "role"], "contour"], layout: { "line-join": "round" },
    paint: { "line-color": dark ? "#F3D98C" : "#0B1424", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 9, 2.2], "line-opacity": dark ? 0.85 : 0.7 } }, avant);
  // Extrémités droites (« butt ») obligatoires : avec des bouts ronds, chaque motif de tiret occupe 15 lignes
  // de l'atlas de MapLibre (256 lignes) et l'animation le sature en une quinzaine de pas.
  carte.addLayer({ id: "regions-flow", type: "line", source: "regions", layout: { "line-cap": "butt", "line-join": "round", visibility: "none" },
    paint: { "line-color": "#C9A44C", "line-width": 2.2, "line-dasharray": LISERE[0] } }, avant);

  // Épingles : au-dessus de tout, noms de lieux compris.
  (Object.keys(COULEUR_TYPE_POINT) as TypePoint[]).forEach((t) =>
    carte.addImage(`epingle-${t}`, dessinerEpingle(COULEUR_TYPE_POINT[t], "#FFFFFF", "#FFFFFF"), { pixelRatio: 2 }));
  carte.addImage("epingle-FERME", dessinerEpingle("#FFFFFF", "#6B7280", "#9AA3B2"), { pixelRatio: 2 });
  const siege: ExpressionSpecification = ["==", ["get", "type"], "SIEGE"];
  carte.addLayer({ id: "points-pouls", type: "circle", source: "points", filter: siege,
    paint: { "circle-color": "rgba(201,164,76,0)", "circle-radius": 3, "circle-stroke-color": dark ? "#F3D98C" : "#C9A44C", "circle-stroke-width": 1.6, "circle-stroke-opacity": 0,
      "circle-radius-transition": { duration: 0 }, "circle-stroke-opacity-transition": { duration: 0 } } });
  carte.addLayer({ id: "points", type: "symbol", source: "points",
    layout: {
      "icon-image": ["case", ["==", ["get", "statut"], "FERME"], "epingle-FERME", ["concat", "epingle-", ["get", "type"]]],
      "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 5, ["case", siege, 0.6, 0.44], 9, ["case", siege, 0.95, 0.78], 13, ["case", siege, 1.2, 1]],
      "symbol-sort-key": ["case", siege, 2, 1],
    },
    paint: { "icon-opacity": ["case", ["==", ["get", "statut"], "SUSPENDU"], 0.55, 1] } });

  if (style.glyphs) {
    carte.addLayer({ id: "etiquettes", type: "symbol", source: "centres",
      layout: { "text-field": ["get", "nom"], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 13], "text-transform": "uppercase", "text-letter-spacing": 0.06, "text-padding": 1, visibility: "none" },
      paint: { "text-color": dark ? "#F4EFE3" : "#0B1424", "text-halo-color": dark ? "rgba(11,20,36,.85)" : "rgba(255,255,255,.9)", "text-halo-width": 1.6 } });
  }
}

/* ---------- Composant ---------- */

export function SenegalMap({
  theme = "light", fillMode = "regions", indicator = "pts", stats = {}, selected = "",
  flow = true, showPoints = false, showLabels = true, points = [], pointFilter = {},
  selectedPoint = null, onPick, onPickPoint, infos, zoomSelection = false, molette = false, rayon = 18,
}: Props) {
  const dark = theme === "dark";
  const cadre = useRef<HTMLDivElement>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const fiche = useRef<HTMLDivElement>(null);
  const carteRef = useRef<Carte | null>(null);
  const curseur = useRef<{ x: number; y: number } | null>(null);
  const survolCle = useRef<string | null>(null);
  const [pret, setPret] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [survol, setSurvol] = useState("");

  // Dernières valeurs des rappels et des points, lues par les écouteurs de la carte.
  const rappels = useRef({ onPick, onPickPoint });
  rappels.current = { onPick, onPickPoint };
  const parId = useRef(new Map<string, PointCarte>());

  const sigStats = JSON.stringify(stats);
  const sigFiltre = JSON.stringify(pointFilter);
  const visibles = useMemo(
    () =>
      points.filter(
        (p) =>
          (!pointFilter.type || p.type === pointFilter.type) &&
          (!pointFilter.statut || p.statut === pointFilter.statut) &&
          (!pointFilter.region || p.region === pointFilter.region) &&
          (!pointFilter.imf || p.imf === pointFilter.imf),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, sigFiltre],
  );

  /** Remplissage de chaque région selon le mode (couleur, opacité au repos et au survol). */
  const teintes = useMemo(() => {
    const valeur = (id: string) => (stats[cleRegion(id)] ?? VIDE)[indicator] ?? 0;
    const max = Math.max(...SENEGAL_REGIONS.map((r) => valeur(r.id))) || 1;
    return SENEGAL_REGIONS.map((r) => {
      const t = Math.sqrt(valeur(r.id) / max);
      const estSel = r.id === selected;
      let fill = r.color;
      let op = 0.62;
      if (fillMode === "choro") { fill = scale(t); op = 0.78; }
      else if (fillMode === "muted") { fill = "#C9A44C"; op = dark ? 0.07 + 0.2 * t : 0.1; }
      if (selected && !estSel && fillMode !== "muted") op *= dark ? 0.85 : 0.62;
      if (estSel && fillMode !== "muted") op = Math.min(0.9, op + 0.14);
      return { id: r.id, cle: cleRegion(r.id), fill, op, opSurvol: Math.min(0.92, op + (fillMode === "muted" ? 0.2 : 0.18)) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigStats, indicator, fillMode, selected, dark]);

  /* --- Création de la carte --- */
  useEffect(() => {
    let annule = false;
    let carte: Carte | null = null;
    Promise.all([styleCarte(theme), chargerGeometrie()]).then(([fond, geo]) => {
      if (annule || !conteneur.current) return;
      setHorsLigne(fond.horsLigne);
      carte = new Carte({
        container: conteneur.current, style: fond.style, bounds: DEPART, maxBounds: LIMITES, maxZoom: 17,
        attributionControl: false, cooperativeGestures: !molette, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        renderWorldCopies: false, fadeDuration: 150, locale: FR,
      });
      const c = carte;
      c.touchZoomRotate.disableRotation();
      c.keyboard.disableRotation();
      c.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
      if (!fond.horsLigne) {
        c.addControl(new AttributionControl({ compact: true }), "bottom-right");
      }

      const survoler = (cle: string | null, pt?: { x: number; y: number }) => {
        if (pt) curseur.current = pt;
        if (cle !== survolCle.current) {
          if (survolCle.current) c.setFeatureState({ source: "regions", id: survolCle.current }, { survol: false });
          if (cle) c.setFeatureState({ source: "regions", id: cle }, { survol: true });
          survolCle.current = cle;
          setSurvol(cle ? REGION_PAR_CLE.get(cle)?.id ?? "" : "");
        }
        placerFiche();
      };

      c.on("load", () => {
        if (annule) return;
        installer(c, fond.style, geo, theme === "dark");
        // Mention des sources repliée au départ (un clic sur « i » l'affiche).
        const sources = c.getContainer().querySelector(".maplibregl-ctrl-attrib");
        sources?.classList.remove("maplibregl-compact-show");
        sources?.removeAttribute("open");
        c.on("mousemove", "regions-fill", (e) => {
          const cle = e.features?.[0]?.properties?.cle as string | undefined;
          if (cle) survoler(cle, e.point);
          c.getCanvas().style.cursor = rappels.current.onPick ? "pointer" : "";
        });
        c.on("mouseleave", "regions-fill", () => { survoler(null); c.getCanvas().style.cursor = ""; });
        c.on("click", "regions-fill", (e) => {
          if (c.queryRenderedFeatures(e.point, { layers: ["points"] }).length) return;
          const nom = e.features?.[0]?.properties?.nom as string | undefined;
          if (nom) rappels.current.onPick?.(nom);
        });
        c.on("click", "points", (e) => {
          const p = parId.current.get(String(e.features?.[0]?.properties?.id));
          if (p) rappels.current.onPickPoint?.(p);
        });
        c.on("mouseenter", "points", () => { if (rappels.current.onPickPoint) c.getCanvas().style.cursor = "pointer"; });
        carteRef.current = c;
        setPret(true);
      });
    });
    return () => {
      annule = true;
      carteRef.current = null;
      survolCle.current = null;
      setPret(false);
      setSurvol("");
      carte?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, molette]);

  /* --- Fiche de survol : suit le curseur sans sortir du cadre --- */
  function placerFiche() {
    const el = fiche.current, c = cadre.current, p = curseur.current;
    if (!el || !c || !p) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = p.x + 18;
    if (x + w > c.clientWidth - 8) x = p.x - 18 - w;
    let y = p.y - h - 14;
    if (y < 8) y = p.y + 20;
    el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, Math.min(y, c.clientHeight - h - 8))}px)`;
  }
  useLayoutEffect(placerFiche, [survol]);

  /* --- Couleurs des régions --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    const couleurs = new Map(teintes.map((t) => [t.cle, t.fill]));
    const repos = new Map(teintes.map((t) => [t.cle, t.op]));
    const actif = new Map(teintes.map((t) => [t.cle, t.opSurvol]));
    c.setPaintProperty("regions-fill", "fill-color", parRegion(couleurs, "#C9A44C"));
    c.setPaintProperty("regions-fill", "fill-opacity", ["case", ["boolean", ["feature-state", "survol"], false], parRegion(actif, 0.3), parRegion(repos, 0.1)]);
    const plein = fillMode !== "muted";
    c.setPaintProperty("regions-line", "line-color", plein ? (dark ? "#0B1424" : "#FFFFFF") : dark ? "#C9A44C" : "#B08A35");
    c.setPaintProperty("regions-line", "line-opacity", plein ? 0.95 : dark ? 0.6 : 0.75);
    c.setPaintProperty("sel-fill", "fill-opacity", plein ? 0 : dark ? 0.26 : 0.3);
    c.setPaintProperty("regions-flow", "line-color", dark ? "#F3D98C" : fillMode === "choro" ? "#0B1424" : "#8A6A1F");
  }, [pret, teintes, fillMode, dark]);

  /* --- Région sélectionnée --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    const filtre: ExpressionSpecification = ["==", ["get", "nom"], selected];
    ["sel-fill", "sel-halo", "sel-line"].forEach((id) => c.setFilter(id, filtre));
  }, [pret, selected]);

  /* --- Cadrage : le pays, ou la région sélectionnée (arrivée animée) --- */
  const cible = zoomSelection ? selected : "";
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    const [o, s, e, n] = (cible && EMPRISES.get(cleRegion(cible))) || SENEGAL;
    const el = c.getContainer();
    const marge = Math.round(Math.max(14, Math.min(48, Math.min(el.clientWidth, el.clientHeight) * 0.07)));
    c.fitBounds([[o, s], [e, n]], { padding: marge, duration: mouvementReduit() ? 0 : 1500, essential: true });
  }, [pret, cible]);

  /* --- Épingles --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    const liste = showPoints ? visibles : [];
    parId.current = new Map(liste.map((p) => [p.id, p]));
    (c.getSource("points") as GeoJSONSource).setData(
      collection(liste.map((p) => ({ type: "Feature", properties: { id: p.id, type: p.type, statut: p.statut }, geometry: { type: "Point", coordinates: lonLat(p) } }))) as unknown as DonneesGeo,
    );
  }, [pret, visibles, showPoints]);

  /* --- Noms des régions --- */
  useEffect(() => {
    const c = carteRef.current;
    if (pret && c?.getLayer("etiquettes")) c.setLayoutProperty("etiquettes", "visibility", showLabels ? "visible" : "none");
  }, [pret, showLabels]);

  /* --- Point sélectionné : repère animé --- */
  const selLon = selectedPoint ? lonLat(selectedPoint)[0] : null;
  const selLat = selectedPoint ? lonLat(selectedPoint)[1] : null;
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c || selLon === null || selLat === null) return;
    const el = document.createElement("div");
    el.className = `cs-repere${showPoints ? "" : " cs-repere-seul"}`;
    el.innerHTML = '<span class="cs-onde"></span><span class="cs-onde d2"></span><span class="cs-noyau"></span>';
    const repere = new Marker({ element: el, anchor: "center" }).setLngLat([selLon, selLat]).addTo(c);
    return () => { repere.remove(); };
  }, [pret, selLon, selLat, showPoints]);

  /* --- Animations continues : liseré des régions et impulsions des sièges --- */
  useEffect(() => {
    const c = carteRef.current;
    if (!pret || !c) return;
    const anime = flow && !mouvementReduit();
    c.setLayoutProperty("regions-flow", "visibility", anime ? "visible" : "none");
    if (mouvementReduit() || (!flow && !showPoints)) return;
    let raf = 0, pas = -1, dernier = 0;
    const t0 = performance.now();
    const boucle = (t: number) => {
      raf = requestAnimationFrame(boucle);
      if (document.hidden || carteRef.current !== c) return;
      if (flow) {
        const p = Math.floor((t - t0) / 75) % LISERE.length;
        if (p !== pas) { pas = p; c.setPaintProperty("regions-flow", "line-dasharray", LISERE[p]); }
      }
      if (showPoints && t - dernier > 45) {
        dernier = t;
        const k = ((t - t0) % 2600) / 2600;
        c.setPaintProperty("points-pouls", "circle-radius", 3 + 15 * k);
        c.setPaintProperty("points-pouls", "circle-stroke-opacity", 0.9 * (1 - k));
      }
    };
    raf = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(raf);
  }, [pret, flow, showPoints]);

  /* --- Contenu de la fiche de survol --- */
  const aDesStats = Object.keys(stats).length > 0;
  const lignes: { label: string; valeur: string }[] = [];
  if (survol) {
    const s = stats[cleRegion(survol)] ?? VIDE;
    (infos ?? (aDesStats ? (["imf", "pts", "membres", "encours"] as Indicateur[]) : [])).forEach((k) => lignes.push({ label: LIBELLE[k], valeur: formater(k, s[k]) }));
    if (!lignes.length && showPoints) lignes.push({ label: "Points affichés", valeur: nombre(visibles.filter((p) => p.region === survol).length) });
  }
  const teinte = teintes.find((t) => t.id === survol);

  return (
    <div ref={cadre} className={`cs-carte ${dark ? "cs-nuit" : "cs-jour"}${pret ? " cs-prete" : ""}`} style={{ borderRadius: rayon }}>
      <div ref={conteneur} className="cs-fond" />
      {horsLigne && pret && <span className="cs-hors-ligne">Fond de carte indisponible (hors connexion)</span>}
      <div ref={fiche} className={`cs-fiche${survol ? " on" : ""}`} role="status" aria-live="polite">
        {survol && (
          <div key={survol} className="cs-fiche-corps">
            <div className="cs-fiche-tete">
              <span className="cs-fiche-pastille" style={{ background: fillMode === "muted" ? "#C9A44C" : teinte?.fill }} />
              <div><div className="cs-fiche-sur">Région</div><div className="cs-fiche-nom">{survol}</div></div>
            </div>
            {lignes.length > 0 && (
              <div className={`cs-fiche-grille${lignes.length === 1 ? " une" : ""}`}>
                {lignes.map((l) => (
                  <div key={l.label} className="cs-fiche-case"><div className="cs-fiche-val">{l.valeur}</div><div className="cs-fiche-lib">{l.label}</div></div>
                ))}
              </div>
            )}
            {onPick && <div className="cs-fiche-pied">Cliquez pour sélectionner la région</div>}
          </div>
        )}
      </div>
    </div>
  );
}
