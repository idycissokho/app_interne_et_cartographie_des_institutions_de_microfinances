/** Région la plus proche d'un point GPS (centroïdes de la maquette, écrans 08 et 09). */
const C = Math.cos((14.5 * Math.PI) / 180);
const REG: [string, number, number][] = [
  ["Dakar", 14.72, -17.3], ["Thiès", 14.8, -16.75], ["Diourbel", 14.7, -16.2], ["Louga", 15.5, -15.7], ["Saint-Louis", 16.2, -15.3],
  ["Matam", 15.4, -13.6], ["Fatick", 14.1, -16.45], ["Kaolack", 13.9, -15.95], ["Kaffrine", 14.0, -15.2], ["Tambacounda", 13.8, -13.1],
  ["Kédougou", 12.6, -12.2], ["Kolda", 12.9, -14.6], ["Sédhiou", 12.8, -15.5], ["Ziguinchor", 12.6, -16.3],
];
export function regionProche(lat: number, lon: number) {
  let best = 1e9, region = "";
  REG.forEach(([nom, la, lo]) => {
    const d = (la - lat) ** 2 + ((lo - lon) * C) ** 2;
    if (d < best) { best = d; region = nom; }
  });
  return region;
}
export const nombreFr = (v: string) => parseFloat(String(v).replace(",", "."));
