/**
 * <SenegalMap> — transcription de maquette-carto-imf/composants/CarteSenegal.dc.html.
 * Même viewBox, mêmes filtres, même ordre des calques :
 * régions → sélection → lignes animées → points → impulsions → point sélectionné → étiquettes.
 */
import { useMemo, useState } from "react";

import { SENEGAL_REGIONS, cleRegion } from "../../data/senegalRegions";
import { COULEUR_TYPE_POINT } from "../../styles/tokens";

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
  x: number;
  y: number;
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
  selectedPoint?: { x: number; y: number } | null;
  onPick?: (regionId: string) => void;
  onPickPoint?: (p: PointCarte) => void;
  /**
   * "cadre" (défaut) : la carte tient dans son conteneur.
   * "largeur" : dimensionnée d'après la largeur, comme sur la capture de l'écran de connexion
   * (la carte peut alors passer sous les éléments voisins de son conteneur).
   */
  ajustement?: "cadre" | "largeur";
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
  return (
    "#" +
    pa
      .map((v, i) => {
        const x = Math.round(v + (pb[i] - v) * t);
        return (x < 16 ? "0" : "") + x.toString(16);
      })
      .join("")
  );
}

const S = ["#F7EED3", "#EBD594", "#D9B65E", "#C29433", "#9A7124", "#6E4F17", "#43300D"];
function scale(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (S.length - 1);
  const i = Math.floor(x);
  return i >= S.length - 1 ? S[S.length - 1] : mix(S[i], S[i + 1], x - i);
}

const VIDE: StatsRegion = { pts: 0, imf: 0, membres: 0, encours: 0 };

export function SenegalMap({
  theme = "light", fillMode = "regions", indicator = "pts", stats = {}, selected = "",
  flow = true, showPoints = false, showLabels = true, points = [], pointFilter = {},
  selectedPoint = null, onPick, onPickPoint, ajustement = "cadre",
}: Props) {
  const [hover, setHover] = useState("");
  const dark = theme === "dark";
  const mode = fillMode;
  const valeur = (id: string) => (stats[cleRegion(id)] ?? VIDE)[indicator] ?? 0;
  const max = Math.max(...SENEGAL_REGIONS.map((r) => valeur(r.id))) || 1;

  const regions = SENEGAL_REGIONS.map((r, i) => {
    const t = Math.sqrt(valeur(r.id) / max);
    let fill: string;
    let op = 1;
    if (mode === "choro") fill = scale(t);
    else if (mode === "muted") {
      fill = dark ? "#C9A44C" : "#E9DFC6";
      op = dark ? 0.05 + 0.13 * t : 1;
    } else fill = r.color;
    const isSel = r.id === selected;
    const isHov = r.id === hover;
    if (!isSel && selected && mode !== "muted") op = 0.55;
    if (isHov && !isSel) op = mode === "muted" ? op + 0.12 : 0.9;
    const darkFill = mode === "regions" || (mode === "choro" && t > 0.55) || dark;
    return {
      ...r, fill, op,
      fs: r.id === "Dakar" ? 10 : 12,
      fw: isSel ? 800 : 700,
      lc: darkFill ? "#FFFFFF" : "#0B1424",
      halo: darkFill ? "rgba(11,20,36,.45)" : "rgba(255,255,255,.8)",
      delay: (0.08 * i).toFixed(2) + "s",
      dur: (5 + (i % 5) * 0.9).toFixed(1) + "s",
    };
  });
  const sel = SENEGAL_REGIONS.find((r) => r.id === selected);

  const visibles = useMemo(
    () =>
      points.filter(
        (p) =>
          (!pointFilter.type || p.type === pointFilter.type) &&
          (!pointFilter.statut || p.statut === pointFilter.statut) &&
          (!pointFilter.region || p.region === pointFilter.region) &&
          (!pointFilter.imf || p.imf === pointFilter.imf),
      ),
    [points, pointFilter],
  );
  const pulses = visibles.filter((p) => p.type === "SIEGE").slice(0, 10);

  const edge = dark ? "rgba(201,164,76,.55)" : "#FFFFFF";
  const flowColor = dark ? "#F3D98C" : mode === "choro" ? "#0B1424" : "#FFF4D2";
  const shadowOp = dark ? 0.0 : 0.16;
  const hatch = dark ? "rgba(243,217,140,.35)" : "rgba(11,20,36,.18)";
  const selStroke = dark ? "#F3D98C" : "#0B1424";

  return (
    <div style={{ width: "100%", height: ajustement === "largeur" ? "auto" : "100%", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="-6 -6 652 488" role="img" aria-label="Carte des 14 régions du Sénégal" style={{ width: "100%", height: ajustement === "largeur" ? "auto" : "100%", overflow: "visible" }}>
        <defs>
          <filter id="csShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#0B1424" floodOpacity={shadowOp} />
          </filter>
          <filter id="csGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="csHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={hatch} strokeWidth="1" />
          </pattern>
        </defs>

        <g filter="url(#csShadow)">
          {regions.map((r) => (
            <path key={r.id} className="cs-region" d={r.d} fill={r.fill} fillOpacity={r.op} stroke={edge} strokeWidth="1.3" strokeLinejoin="round"
              onClick={() => onPick?.(r.id)} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover("")}
              style={{ cursor: "pointer", transition: "fill .45s ease, fill-opacity .25s ease" }}>
              <animate attributeName="opacity" from="0" to="1" dur="0.9s" begin={r.delay} fill="freeze" />
            </path>
          ))}
        </g>

        {sel && (
          <path d={sel.d} fill="url(#csHatch)" stroke={selStroke} strokeWidth="2.6" strokeLinejoin="round" filter="url(#csGlow)" style={{ pointerEvents: "none" }} />
        )}

        {flow && (
          <g className="cs-flow" style={{ pointerEvents: "none" }}>
            {regions.map((r) => (
              <path key={r.id} d={r.d} pathLength={1000} fill="none" stroke={flowColor} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="46 954" filter="url(#csGlow)">
                <animate attributeName="stroke-dashoffset" from="1000" to="0" dur={r.dur} begin={r.delay} repeatCount="indefinite" />
              </path>
            ))}
          </g>
        )}

        {showPoints && (
          <g>
            {visibles.map((p) => {
              const closed = p.statut === "FERME";
              return (
                <circle key={p.id} cx={p.x} cy={p.y} r={p.type === "SIEGE" ? 5 : 3.4}
                  fill={dark ? "#FFF4D2" : closed ? "#FFFFFF" : COULEUR_TYPE_POINT[p.type]}
                  fillOpacity={p.statut === "SUSPENDU" ? 0.5 : 1}
                  stroke={dark ? "rgba(243,217,140,.5)" : closed ? "#6B7280" : "#FFFFFF"} strokeWidth="1.2"
                  onClick={() => onPickPoint?.(p)} style={{ cursor: "pointer" }} />
              );
            })}
            {pulses.map((q, i) => (
              <circle key={q.id} className="cs-pulse" cx={q.x} cy={q.y} r="3" fill="none" stroke={dark ? "#F3D98C" : "#C9A44C"} strokeWidth="1.4" style={{ pointerEvents: "none" }}>
                <animate attributeName="r" values="3;14" dur="2.6s" begin={(i * 0.35).toFixed(2) + "s"} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0" dur="2.6s" begin={(i * 0.35).toFixed(2) + "s"} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        )}

        {selectedPoint && (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="9" fill="none" stroke="#0B1424" strokeWidth="2" />
            <circle className="cs-pulse" cx={selectedPoint.x} cy={selectedPoint.y} r="13" fill="none" stroke="#C9A44C" strokeWidth="2">
              <animate attributeName="r" values="9;18;9" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {showLabels && (
          <g style={{ pointerEvents: "none", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
            {regions.map((r) => (
              <text key={r.id} x={r.lx} y={r.ly} textAnchor="middle" fontSize={r.fs} fontWeight={r.fw} fill={r.lc} stroke={r.halo} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                {r.id}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
