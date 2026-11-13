/** Définitions des champs de formulaire partagées par les pages. */
import { options } from "../api/libelles";
import type { DefChamp } from "../components/Formulaire";

export const CHAMPS_IMF: DefChamp[] = [
  { nom: "nom", label: "Dénomination sociale", requis: true },
  { nom: "sigle", label: "Sigle" },
  { nom: "type_imf", label: "Type", type: "select", options: options("type_imf"), requis: true },
  { nom: "statut_reglementaire", label: "Statut réglementaire", type: "select", options: options("statut_reglementaire").filter((o) => o.value !== "RADIE"), requis: true },
  { nom: "adresse_siege", label: "Adresse du siège", requis: true },
  { nom: "latitude", label: "Latitude du siège", type: "number", aide: "ex. 14.6928" },
  { nom: "longitude", label: "Longitude du siège", type: "number", aide: "ex. -17.4467" },
  { nom: "telephone", label: "Téléphone" },
  { nom: "email", label: "Email", type: "email" },
  { nom: "site_web", label: "Site web", type: "url" },
];

export const champsPoint = (imfs: { value: string; label: string }[]): DefChamp[] => [
  { nom: "imf", label: "IMF", type: "select", options: imfs, requis: true },
  { nom: "nom", label: "Nom du point", requis: true },
  { nom: "type_point", label: "Type", type: "select", options: options("type_point"), requis: true },
  { nom: "statut_point", label: "Statut", type: "select", options: options("statut_point"), requis: true },
  { nom: "statut_reglementaire", label: "Statut réglementaire", type: "select", options: options("statut_reglementaire").filter((o) => o.value !== "RADIEE"), requis: true },
  { nom: "adresse", label: "Adresse" },
  { nom: "latitude", label: "Latitude", type: "number", aide: "Région, département et commune sont déduits du GPS" },
  { nom: "longitude", label: "Longitude", type: "number" },
  { nom: "date_ouverture", label: "Date d'ouverture", type: "date" },
  { nom: "telephone", label: "Téléphone" },
  { nom: "email", label: "Email", type: "email" },
  { nom: "encours", label: "Encours (FCFA)", type: "number" },
  { nom: "depots", label: "Dépôts (FCFA)", type: "number" },
  { nom: "nombre_membres", label: "Nombre de membres", type: "number" },
];

export const CHAMPS_DIRIGEANT: DefChamp[] = [
  { nom: "nom", label: "Nom", requis: true },
  { nom: "prenom", label: "Prénom", requis: true },
  { nom: "telephone", label: "Téléphone" },
  { nom: "email_professionnel", label: "Email professionnel", type: "email" },
  { nom: "email_secondaire", label: "Email secondaire", type: "email" },
];

export const champsMandat = (imfs: { value: string; label: string }[]): DefChamp[] => [
  { nom: "imf", label: "IMF", type: "select", options: imfs, requis: true },
  { nom: "fonction_mandat", label: "Fonction", type: "select", options: options("fonction_mandat"), requis: true },
  { nom: "date_debut", label: "Début du mandat", type: "date", requis: true },
  { nom: "date_fin", label: "Fin du mandat", type: "date" },
  { nom: "statut_mandat", label: "Statut", type: "select", options: options("statut_mandat"), requis: true },
  { nom: "documents_justificatifs", label: "Lien vers un justificatif", type: "url" },
  { nom: "fichier_justificatif", label: "Fichier justificatif (PDF, image)", type: "file" },
];

/** Construit un FormData (requis pour l'envoi de fichier) en ignorant les valeurs vides. */
export function versFormData(valeurs: Record<string, string | File | null>) {
  const fd = new FormData();
  Object.entries(valeurs).forEach(([k, v]) => {
    if (v instanceof File) fd.append(k, v);
    else if (v !== null && v !== "") fd.append(k, v);
  });
  return fd;
}
