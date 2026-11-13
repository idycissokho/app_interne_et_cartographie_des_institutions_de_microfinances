/** Types des ressources exposées par l'API Django. */

export type Role = "ADMIN" | "SUPERVISEUR" | "CONSULTANT";

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  nom_complet: string;
  role: Role;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PointGeo {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Bailleur {
  id: string;
  nom: string;
  sigle: string;
}

export interface IMFResume {
  id: string;
  nom: string;
  sigle: string;
  type_imf: string;
  statut_reglementaire: string;
  nb_points_service: number;
}

export interface IMF extends IMFResume {
  adresse_siege: string;
  localisation_siege: PointGeo | null;
  telephone: string;
  email: string;
  site_web: string;
  bailleurs: string[];
  bailleurs_detail: Bailleur[];
  statut_actif: boolean;
}

export interface PointServiceResume {
  id: string;
  nom: string;
  imf: string;
  imf_nom: string;
  type_point: string;
  statut_point: string;
  statut_reglementaire: string;
  region: string | null;
  region_nom: string | null;
}

export interface Mandat {
  id: string;
  dirigeant: string;
  dirigeant_nom_complet: string;
  imf: string;
  imf_nom: string;
  fonction_mandat: string;
  date_debut: string;
  date_fin: string | null;
  statut_mandat: string;
  documents_justificatifs: string;
  fichier_justificatif: string | null;
  est_en_cours: boolean;
}

export interface DirigeantResume {
  id: string;
  nom_complet: string;
  telephone: string;
  email_professionnel: string;
  nb_mandats: number;
}

export interface Dirigeant {
  id: string;
  nom: string;
  prenom: string;
  nom_complet: string;
  telephone: string;
  email_professionnel: string;
  email_secondaire: string;
  mandats: Mandat[];
}

export interface Zone {
  id: string;
  code: string;
  nom: string;
  type_zone: "REGION" | "DEPARTEMENT" | "COMMUNE";
  parent: string | null;
}

export interface ZoneAgregats extends Zone {
  nb_points_service: number;
  nb_imf: number;
  encours_total: string | null;
  depots_total: string | null;
  nb_membres_total: number | null;
}

export interface Importation {
  id: string;
  utilisateur_email: string;
  type_import: "IMF" | "POINTS_SERVICE" | "DIRIGEANTS";
  statut: "EN_ATTENTE" | "EN_COURS" | "TERMINE" | "ECHEC";
  nb_lignes_total: number;
  nb_lignes_importees: number;
  nb_lignes_erreur: number;
  taux_succes: number;
  rapport_erreurs: { ligne: number | null; erreurs: Record<string, unknown> }[];
  date_creation: string;
}

export interface EntreeAudit {
  id: string;
  utilisateur_email: string | null;
  action: string;
  objet_concerne: string;
  role: string;
  date_action: string;
  details: Record<string, unknown>;
}
