/**
 * Position de l'appareil (navigator.geolocation, haute précision), avec un message clair pour
 * chaque échec. La position reste dans le navigateur : elle n'est envoyée qu'au calcul
 * d'itinéraire, jamais enregistrée.
 */
import { useCallback, useState } from "react";

/** Au-delà, la position est signalée comme approximative (en mètres). */
export const PRECISION_FAIBLE = 100;

export type EtatGeo =
  | { statut: "inactif" }
  | { statut: "recherche" }
  | { statut: "ok"; lat: number; lon: number; precision: number }
  | { statut: "erreur"; titre: string; message: string };

const ERREURS: Record<number, { titre: string; message: string }> = {
  1: {
    titre: "Accès à la position refusé",
    message:
      "Pour l'autoriser : touchez le cadenas à gauche de l'adresse du site, choisissez « Position » puis « Autoriser », et rechargez la page. " +
      "Sur téléphone, vérifiez aussi que la localisation est activée dans les réglages. Vous pouvez aussi toucher la carte pour placer le départ.",
  },
  2: {
    titre: "Position indisponible",
    message: "Activez le GPS ou la localisation de l'appareil, puis réessayez. Vous pouvez aussi toucher la carte pour placer le départ.",
  },
  3: {
    titre: "Délai dépassé",
    message: "La position n'a pas pu être obtenue à temps. Réessayez, de préférence à l'extérieur, ou touchez la carte pour placer le départ.",
  },
};

export function useGeolocalisation() {
  const [etat, setEtat] = useState<EtatGeo>({ statut: "inactif" });

  const localiser = useCallback(() => {
    if (!window.isSecureContext) {
      setEtat({ statut: "erreur", titre: "Connexion non sécurisée", message: "Le navigateur ne donne la position que sur une adresse en HTTPS. Touchez la carte pour placer le départ." });
      return;
    }
    if (!("geolocation" in navigator)) {
      setEtat({ statut: "erreur", titre: "Géolocalisation non prise en charge", message: "Ce navigateur ne donne pas la position. Touchez la carte pour placer le départ." });
      return;
    }
    setEtat({ statut: "recherche" });
    navigator.geolocation.getCurrentPosition(
      (p) => setEtat({ statut: "ok", lat: p.coords.latitude, lon: p.coords.longitude, precision: Math.round(p.coords.accuracy) }),
      (e) => setEtat({ statut: "erreur", ...(ERREURS[e.code] ?? ERREURS[2]) }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);

  const oublier = useCallback(() => setEtat({ statut: "inactif" }), []);

  return { etat, localiser, oublier };
}
