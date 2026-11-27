/**
 * Carte du registre (accueil public) : les 14 régions et le siège de chaque institution.
 * SVG local (tracés de data/senegalRegions.ts) : aucune tuile Internet, rendu net à toute taille.
 * Dakar concentre le tiers des sièges sur une presqu'île minuscule : ses sièges ne sont pas posés
 * sur la grande carte mais dans le médaillon, qui agrandit Dakar (en haut à droite, zone vide de la
 * carte). Chaque siège y est un point cliquable ; un clic sur la région filtre Dakar.
 */
import { useMemo, useState, type MouseEvent } from "react";

import { cleRegion, SENEGAL_REGIONS } from "../../data/senegalRegions";
import { pluriel } from "../../lib/format";

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

type Info = { x: number; y: number; titre: string; detail: string } | null;

/** Emprise de chaque région dans le repère SVG (calculée une fois à partir des tracés). */
const EMPRISES: Record<string, { x: number; y: number; l: number; h: number }> = Object.fromEntries(
  SENEGAL_REGIONS.map((r) => {
    const n = (r.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return [cleRegion(r.id), { x: x0, y: y0, l: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }];
  }),
);
const RATIO_MEDAILLON = 1.15; // largeur / hauteur du cadre

/** Cadre { x, y, l, h } agrandi d'une marge et mis au format du médaillon, centré. */
function auFormat(e: { x: number; y: number; l: number; h: number }, marge: number) {
  let l = e.l * marge, h = e.h * marge;
  if (l / h > RATIO_MEDAILLON) h = l / RATIO_MEDAILLON; else l = h * RATIO_MEDAILLON;
  return { x: e.x + e.l / 2 - l / 2, y: e.y + e.h / 2 - h / 2, l, h };
}

/** Le siège est-il situé dans l'emprise de la région de Dakar ? */
const DANS_DAKAR = (p: PointRegistre) => {
  const e = EMPRISES.dakar!;
  return p.x >= e.x - 1 && p.x <= e.x + e.l + 1 && p.y >= e.y - 1 && p.y <= e.y + e.h + 1;
};

/**
 * Sièges rattachés à Dakar et situés dans Dakar : dans le médaillon. Les autres (coordonnées hors
 * de la région dans la liste officielle) restent sur la grande carte, à leur position réelle.
 */
const estDansMedaillon = (p: PointRegistre) => cleRegion(p.region) === "dakar" && DANS_DAKAR(p);

/** Vue du médaillon : l'ensemble des sièges de Dakar, au format du cadre. */
function vueDakar(points: PointRegistre[]) {
  if (points.length < 2) return auFormat(EMPRISES.dakar!, 1.12);
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return auFormat({ x: x0, y: y0, l: Math.max(Math.max(...xs) - x0, 8), h: Math.max(Math.max(...ys) - y0, 8) }, 1.3);
}

/**
 * Médaillon seulement : décale de quelques pixels les sièges confondus (même coordonnée dans la
 * liste officielle) ou trop proches, pour que chacun soit visible et cliquable.
 */
function ecarter(points: PointRegistre[], ecart: number): PointRegistre[] {
  const pos = points.map((p) => ({ ...p }));
  for (let tour = 0; tour < 120; tour++) {
    let bouge = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i]!, b = pos[j]!;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= ecart) continue;
        if (d < 1e-6) { dx = Math.cos(i * 2.399 + j); dy = Math.sin(i * 2.399 + j); d = 1; } // confondus : direction stable
        const pousse = (ecart - d) / 2 + ecart * 0.01;
        a.x -= (dx / d) * pousse; a.y -= (dy / d) * pousse;
        b.x += (dx / d) * pousse; b.y += (dy / d) * pousse;
        bouge = true;
      }
    }
    if (!bouge) break;
  }
  return pos;
}

function Points({ points, selection, correspondances, rayon, zoneClic = 2.6, onSelection, survoler }: {
  points: PointRegistre[]; selection: string | null; correspondances: Set<string> | null; rayon: number;
  /** Rayon de la zone cliquable, en rayons de point : jamais plus de la moitié de l'écart entre deux points. */
  zoneClic?: number;
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
            {choisi && <circle cx={p.x} cy={p.y} r={rayon * 3.4} className="rg-halo" vectorEffect="non-scaling-stroke" />}
            <circle cx={p.x} cy={p.y} r={choisi ? rayon * 1.7 : rayon} vectorEffect="non-scaling-stroke" />
            <circle cx={p.x} cy={p.y} r={rayon * zoneClic} fill="transparent" />
          </g>
        );
      })}
    </g>
  );
}

export function CarteRegistre({ points, comptes, region, onRegion, selection, onSelection, correspondances }: Props) {
  const [info, setInfo] = useState<Info>(null);
  const [survolRegion, setSurvolRegion] = useState("");

  const cleMedaillon = "dakar";
  const nomMedaillon = SENEGAL_REGIONS.find((r) => cleRegion(r.id) === cleMedaillon)?.id ?? "Dakar";
  const pointsMedaillon = useMemo(() => points.filter(estDansMedaillon), [points]);
  const vue = useMemo(() => vueDakar(pointsMedaillon), [pointsMedaillon]);
  // Rayon dans le repère de la vue : environ 2,5 px à l'écran pour un siège isolé.
  const rayonMedaillon = vue.l / 70;
  const pointsCadre = useMemo(() => ecarter(pointsMedaillon, rayonMedaillon * 2.5), [pointsMedaillon, rayonMedaillon]);
  // Grande carte : tous les sièges sauf ceux de Dakar, montrés dans le médaillon.
  const pointsCarte = useMemo(() => points.filter((p) => !estDansMedaillon(p)), [points]);

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
    setInfo({ ...position(e), titre: id, detail: n ? `${n} ${pluriel(n, "institution")} · cliquer pour filtrer` : "Aucune institution" });
  };
  const choisirRegion = (cle: string) => onRegion(region === cle ? "" : cle);

  return (
    <div className="rg-carte" onMouseLeave={() => { setInfo(null); setSurvolRegion(""); }}>
      <svg viewBox="-4 4 634 466" role="img" aria-label="Carte du Sénégal : sièges des institutions de microfinance par région">
        <g className="rg-regions">
          {SENEGAL_REGIONS.map((r) => {
            const cle = cleRegion(r.id);
            const etat = region === cle ? " active" : region ? " estompee" : "";
            return (
              <path key={r.id} d={r.d} className={`rg-region${etat}${survolRegion === r.id ? " survol" : ""}`}
                onClick={() => choisirRegion(cle)}
                onMouseMove={(e) => { if (!(e.target as Element).closest(".rg-point")) survolerRegion(r.id, e); }}
                onMouseLeave={() => setSurvolRegion("")} />
            );
          })}
        </g>
        {/* Noms des régions sous les points : un siège n'est jamais masqué par un libellé. */}
        {SENEGAL_REGIONS.map((r) => r.id !== "Dakar" && (
          <text key={r.id} x={r.lx} y={r.ly} className={`rg-etiquette${region === cleRegion(r.id) ? " active" : ""}`}>{r.id}</text>
        ))}
        <Points points={pointsCarte} selection={selection} correspondances={correspondances} rayon={3.2} onSelection={onSelection} survoler={survolerPoint} />
      </svg>

      <figure className={`rg-medaillon${region === cleMedaillon ? " actif" : ""}`} aria-label={`${nomMedaillon} agrandie`}
        title={region === cleMedaillon ? "Afficher tout le Sénégal" : "Filtrer la région de Dakar"}>
        <svg viewBox={`${vue.x} ${vue.y} ${vue.l} ${vue.h}`} aria-hidden="true">
          {SENEGAL_REGIONS.map((r) => {
            const cle = cleRegion(r.id);
            return (
              <path key={r.id} d={r.d} vectorEffect="non-scaling-stroke" onClick={() => choisirRegion(cle)}
                className={`rg-region ${cle === cleMedaillon ? "rg-medaillon-cible" : "rg-medaillon-voisine"}`} />
            );
          })}
          <Points points={pointsCadre} selection={selection} correspondances={correspondances} rayon={rayonMedaillon} zoneClic={1.25} onSelection={onSelection} survoler={survolerPoint} />
        </svg>
        <figcaption>{nomMedaillon} <span>{comptes[cleMedaillon] ?? 0}</span></figcaption>
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
