/**
 * Fond de carte « façon Google Maps » de <SenegalMap> : routes, villes, cours d'eau, relief.
 *
 * Source : tuiles vectorielles OpenStreetMap servies par OpenFreeMap (style « Liberty », libre, sans clé).
 * - thème clair : le style tel quel ;
 * - thème sombre : le même style recoloré aux teintes « Or & Nuit » (terres bleu nuit, grands axes or).
 * Si le service est injoignable (poste hors ligne), on retombe sur un fond uni : les régions,
 * les points et les survols restent fonctionnels.
 */
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type ThemeCarte = "light" | "dark";

const URL_STYLE = "https://tiles.openfreemap.org/styles/liberty";

let telechargement: Promise<StyleSpecification | null> | null = null;

function telecharger() {
  telechargement ??= fetch(URL_STYLE)
    .then((r) => (r.ok ? (r.json() as Promise<StyleSpecification>) : null))
    .catch(() => null)
    .then((style) => {
      if (!style) telechargement = null; // nouvelle tentative au prochain affichage
      return style;
    });
  return telechargement;
}

const secours = (theme: ThemeCarte): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": theme === "dark" ? "#0F1B30" : "#F1ECE0" } }],
});

/** Calques sans intérêt pour une carte de supervision (bâtiments 3D, sens uniques). */
const SUPERFLUS = (id: string) => id === "building-3d" || id.includes("one_way");

/** Noms de lieux en français quand OpenStreetMap en fournit un (« Sénégal », « Gambie », « Mauritanie »…). */
const NOM_FR = ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]];
function franciser<T extends LayerSpecification>(l: T): T {
  if (l.type !== "symbol" || !l.layout || !("text-field" in l.layout) || !JSON.stringify(l.layout["text-field"]).includes("name")) return l;
  return { ...l, layout: { ...l.layout, "text-field": NOM_FR } } as T;
}

function clair(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.filter((l) => !SUPERFLUS(l.id)).map(franciser) };
}

function nuit(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const origine of style.layers) {
    const id = origine.id;
    if (SUPERFLUS(id) || origine.type === "raster" || id === "road_area_pattern" || id.startsWith("poi") || id.includes("shield") || id.includes("hatching")) continue;
    const l = structuredClone(origine) as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
    const paint: Record<string, unknown> = { ...(l.paint ?? {}) };

    if (l.type === "background") paint["background-color"] = "#0F1B30";
    else if (l.type === "fill") {
      delete paint["fill-pattern"];
      delete paint["fill-outline-color"];
      paint["fill-color"] =
        id === "water" ? "#07101F"
        : /park|wood|grass|wetland/.test(id) ? "#123040"
        : /building|aeroway/.test(id) ? "#1A2B47"
        : "#14223B";
    } else if (l.type === "line") {
      paint["line-color"] =
        id.startsWith("waterway") ? "#07101F"
        : id.startsWith("boundary") ? "#8E99AB"
        : id.includes("rail") ? "#2A3A57"
        : id.includes("casing") ? "#0B1424"
        : /motorway|trunk_primary/.test(id) ? "#C9A44C"
        : id.includes("secondary_tertiary") ? "#6B7A97"
        : "#2C3D5C";
    } else if (l.type === "symbol") {
      const eau = id.startsWith("water");
      const majeur = /label_city|label_country|label_state/.test(id);
      paint["text-color"] = eau ? "#5F7FA8" : majeur ? "#F4EFE3" : "#B9C2D0";
      paint["text-halo-color"] = "#0B1424";
      paint["text-halo-width"] = 1.3;
      paint["icon-opacity"] = 0.55;
    }
    l.paint = paint;
    layers.push(franciser(l));
  }
  return { ...style, layers };
}

/** Style MapLibre du thème demandé, avec `secours: true` quand le fond en ligne est indisponible. */
export async function styleCarte(theme: ThemeCarte): Promise<{ style: StyleSpecification; horsLigne: boolean }> {
  const base = await telecharger();
  if (!base) return { style: secours(theme), horsLigne: true };
  return { style: theme === "dark" ? nuit(base) : clair(base), horsLigne: false };
}
