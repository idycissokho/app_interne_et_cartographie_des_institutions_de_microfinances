/** Formats d'affichage partagés (français). */

export const nombre = (n: number | null | undefined) => (n ?? 0).toLocaleString("fr-FR").replace(/ /g, " ");

export const pourcent = (n: number, decimales = 0) => `${n.toFixed(decimales).replace(".", ",")} %`;

export function dateLongue(d = new Date()) {
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const isoJour = (d: Date) => d.toISOString().slice(0, 10);

export function joursAvant(dateIso: string) {
  const fin = new Date(dateIso + "T00:00:00");
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  return Math.round((fin.getTime() - auj.getTime()) / 86400000);
}

export function ilYa(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `il y a ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return "hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Code court d'une fonction de mandat (badges PCA / DG / GÉR…). */
export const CODE_FONCTION: Record<string, string> = {
  PCA: "PCA", PRESIDENT_CONSEIL: "PC", DG: "DG", DGA: "DGA", GERANT: "GÉR",
  PRESIDENT_COMITE_CREDIT: "PCC", PRESIDENT_CONSEIL_SURVEILLANCE: "PCS",
  RESPONSABLE_CONFORMITE: "RCI", AUDITEUR_INTERNE: "AI", DAF: "DAF",
  RESPONSABLE_SI: "RSI", RESPONSABLE_OPERATIONS: "ROP",
};

/** Montant court (FCFA) comme dans la maquette : « 2,4 Mds », « 840 M », « 12 480 ». */
export function montantCourt(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!n) return "—";
  if (n >= 1e9) { const x = (n / 1e9).toFixed(1).replace(".", ",").replace(",0", ""); return `${x} ${n >= 2e9 ? "Mds" : "Md"}`; }
  if (n >= 1e6) return `${Math.round(n / 1e6)} M`;
  return nombre(n);
}
