/**
 * Projection lat/lon → repère SVG de la carte du Sénégal (identique à la maquette).
 */
const C = Math.cos((14.5 * Math.PI) / 180);
const k = 620 / ((-11.34 + 17.56) * C);

export function projeter(lon: number, lat: number) {
  return { x: (lon + 17.56) * C * k + 10, y: (16.71 - lat) * k + 10 };
}

/** Le point (lat, lon) est-il dans l'emprise du Sénégal (contrôle des formulaires) ? */
export const dansLeSenegal = (lat: number, lon: number) => lat >= 12.28 && lat <= 16.71 && lon >= -17.56 && lon <= -11.34;

/** Inverse de projeter() : repère SVG de la maquette → longitude / latitude. */
export function deprojeter(x: number, y: number) {
  return { lon: (x - 10) / (C * k) - 17.56, lat: 16.71 - (y - 10) / k };
}
