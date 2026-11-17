/** Types et formats de la section « Itinéraire » (API /itineraires/, voir backend/apps/itineraires). */

export type Mode = "pied" | "moto" | "voiture";
export type TypeDestination = "institution" | "point_service";

export const MODES: { cle: Mode; libelle: string; google: "walking" | "driving" }[] = [
  { cle: "pied", libelle: "À pied", google: "walking" },
  // Google Maps n'a pas de mode « moto » universel : la navigation se fait en mode voiture.
  { cle: "moto", libelle: "Moto", google: "driving" },
  { cle: "voiture", libelle: "Voiture", google: "driving" },
];

export interface Position { lat: number; lon: number }

export interface Destination extends Position {
  type: TypeDestination;
  id: string;
  nom: string;
  sous_titre: string;
  adresse: string;
  telephone: string;
  region: string | null;
}

export interface Etape { instruction: string; distance_km: number; duree_min: number }

export interface ResultatMode {
  statut: "ok" | "aucun_itineraire" | "indisponible" | "erreur";
  distance_km: number | null;
  duree_min: number | null;
  geometrie: { type: "LineString"; coordinates: [number, number][] } | null;
  etapes: Etape[];
  message: string;
}

export interface ReponseCalcul {
  destination: Destination;
  fournisseur: string;
  modes: Partial<Record<Mode, ResultatMode>>;
  plus_rapide: Mode | null;
}

/** « 18 min », « 1 h 05 ». */
export function duree(minutes: number | null) {
  if (minutes === null) return "—";
  const m = Math.max(1, Math.round(minutes));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** « 850 m », « 12,5 km ». */
export function distance(km: number | null) {
  if (km === null) return "—";
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${(km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace(".", ",")} km`;
}

/** Origine arrondie à ≈ 50 m : même clé de cache que le serveur, et rien de plus précis dans le cache du navigateur. */
export const arrondir = (v: number) => Math.round(v / 0.0005) * 0.0005;

/** Lien Google Maps (navigation vocale sur le téléphone) : départ = position actuelle du téléphone. */
export const lienGoogleMaps = (d: Position, mode: Mode) =>
  `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}&travelmode=${MODES.find((m) => m.cle === mode)?.google ?? "driving"}`;
