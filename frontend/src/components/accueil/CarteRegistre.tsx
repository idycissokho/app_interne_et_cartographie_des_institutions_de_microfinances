/**
 * Carte du registre (accueil public) : les 14 régions et le siège de chaque institution.
 * SVG local (tracés de data/senegalRegions.ts) : aucune tuile Internet, rendu net à toute taille.
 * Dakar concentre la majorité des sièges : un médaillon l'agrandit.
 */
import { useState, type MouseEvent } from "react";

import { cleRegion, SENEGAL_REGIONS } from "../../data/senegalRegions";

export interface PointRegistre { id: string; x: number; y: number; nom: string; agrement: string; statut: string; region: string }

interface Props {
  points: PointRegistre[];
  comptes: Record<string, number>; // clé de région → nombre d'institutions
  region: string; // clé de région active ("" = toutes)
  onRegion: (cle: string) => void;
  selection: string | null;
  onSelection: (id: string) => void;
  correspondances: Set<string> | null; // ids qui répondent à la recherche (null = pas de recherche)
}

const DAKAR = SENEGAL_REGIONS.find((r) => r.id === "Dakar")!;
const VUE_DAKAR = { x: 10, y: 193.5, l: 46, h: 37.5 };

type Info = { x: number; y: number; titre: string; detail: string } | null;

function Points({ points, selection, correspondances, rayon, onSelection, survoler }: {
  points: PointRegistre[]; selection: string | null; correspondances: Set<string> | null; rayon: number;
  onSelection: (id: string) => void; survoler: (p: PointRegistre | null, e?: MouseEvent) => void;
}) {
  // Point choisi dessiné en dernier (au-dessus des autres).
  const ordonnes = selection ? [...points.filter((p) => p.id !== selection), ...points.filter((p) => p.id === selection)] : points;
  return (
    <g>
      {ordonnes.map((p) => {
        const choisi = p.id === selection;
        const eteint = correspondances !== null && !correspondances.has(p.id);
        return (
          <g key={p.id} className={`rg-point s-${p.statut}${choisi ? " choisi" : ""}${eteint ? " eteint" : ""}`}
            onClick={() => onSelection(p.id)} onMouseEnter={(e) => survoler(p, e)} onMouseMove={(e) => survoler(p, e)} onMouseLeave={() => survoler(null)}>
            {choisi && <circle cx={p.x} cy={p.y} r={rayon * 3.4} className="rg-halo" />}
            <circle cx={p.x} cy={p.y} r={choisi ? rayon * 1.7 : rayon} />
            <circle cx={p.x} cy={p.y} r={rayon * 3} fill="transparent" />
          </g>
        );
      })}
    </g>
  );
}

export function CarteRegistre({ points, comptes, region, onRegion, selection, onSelection, correspondances }: Props) {
  const [info, setInfo] = useState<Info>(null);
  const [survolRegion, setSurvolRegion] = useState("");

  const position = (e: MouseEvent) => {
    const cadre = (e.currentTarget as Element).closest(".rg-carte")!.getBoundingClientRect();
    // Bulle maintenue dans le cadre de la carte (elle ne déborde ni à gauche ni à droite).
    const marge = Math.min(150, cadre.width / 2);
    return { x: Math.min(Math.max(e.clientX - cadre.left, marge), cadre.width - marge), y: e.clientY - cadre.top };
  };
  const survolerPoint = (p: PointRegistre | null, e?: MouseEvent) => {
    if (!p || !e) { setInfo(null); return; }
    setInfo({ ...position(e), titre: p.nom, detail: p.agrement || "Agrément non renseigné" });
  };
  const survolerRegion = (id: string, e: MouseEvent) => {
    setSurvolRegion(id);
    const n = comptes[cleRegion(id)] ?? 0;
    setInfo({ ...position(e), titre: id, detail: n ? `${n} institution${n > 1 ? "s" : ""} · cliquer pour filtrer` : "Aucune institution" });
  };
  const dakar = points.filter((p) => cleRegion(p.region) === "dakar");
  const nbDakar = comptes.dakar ?? 0;

  return (
    <div className="rg-carte" onMouseLeave={() => { setInfo(null); setSurvolRegion(""); }}>
      <svg viewBox="-4 4 634 466" role="img" aria-label="Carte du Sénégal : sièges des institutions de microfinance par région">
        <g className="rg-regions">
          {SENEGAL_REGIONS.map((r) => {
            const cle = cleRegion(r.id);
            const etat = region === cle ? " active" : region ? " estompee" : "";
            return (
              <path key={r.id} d={r.d} className={`rg-region${etat}${survolRegion === r.id ? " survol" : ""}`}
                onClick={() => onRegion(region === cle ? "" : cle)}
                onMouseMove={(e) => { if (!(e.target as Element).closest(".rg-point")) survolerRegion(r.id, e); }}
                onMouseLeave={() => setSurvolRegion("")} />
            );
          })}
        </g>
        {/* Emplacement du médaillon de Dakar */}
        <rect x={VUE_DAKAR.x} y={VUE_DAKAR.y} width={VUE_DAKAR.l} height={VUE_DAKAR.h} className="rg-cadre-dakar" />
        {/* Noms des régions sous les points : un siège n'est jamais masqué par un libellé. */}
        {SENEGAL_REGIONS.map((r) => r.id !== "Dakar" && (
          <text key={r.id} x={r.lx} y={r.ly} className={`rg-etiquette${region === cleRegion(r.id) ? " active" : ""}`}>{r.id}</text>
        ))}
        <Points points={points.filter((p) => cleRegion(p.region) !== "dakar")} selection={selection} correspondances={correspondances} rayon={3.2} onSelection={onSelection} survoler={survolerPoint} />
      </svg>

      <figure className="rg-medaillon">
        <svg viewBox={`${VUE_DAKAR.x} ${VUE_DAKAR.y} ${VUE_DAKAR.l} ${VUE_DAKAR.h}`} aria-hidden="true">
          <path d={DAKAR.d} className={`rg-region${region === "dakar" ? " active" : region ? " estompee" : ""}`} onClick={() => onRegion(region === "dakar" ? "" : "dakar")} />
          <Points points={dakar} selection={selection} correspondances={correspondances} rayon={0.42} onSelection={onSelection} survoler={survolerPoint} />
        </svg>
        <figcaption>Dakar <span>{nbDakar}</span></figcaption>
      </figure>

      {info && (
        <div className="rg-info" style={{ left: info.x, top: info.y }} role="status">
          <strong>{info.titre}</strong>
          <span>{info.detail}</span>
        </div>
      )}
    </div>
  );
}
