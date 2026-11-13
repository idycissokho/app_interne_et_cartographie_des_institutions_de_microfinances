/**
 * Données fictives typées pour les blocs de la maquette sans source dans le backend
 * (aucun modèle correspondant). Chaque bloc qui les utilise garde la mention
 * « Données fictives de démonstration ».
 */

/** Badge de l'entrée « Espace supervision » (file de validation : pas de modèle backend). */
export const BADGE_SUPERVISION = "5";

export interface Mission {
  day: string; month: string; title: string; where: string; team: string;
  kind: "Sur place" | "Gouvernance" | "Documentaire" | "Terrain"; prog: string;
}

export const MISSIONS: Record<"À venir" | "En cours" | "Terminées", Mission[]> = {
  "À venir": [
    { day: "18", month: "nov", title: "Contrôle sur place · [IMF A]", where: "Kolda", team: "3 agents", kind: "Sur place", prog: "20%" },
    { day: "25", month: "nov", title: "Vérification gouvernance · [IMF C]", where: "Kaolack", team: "2 agents", kind: "Gouvernance", prog: "10%" },
    { day: "02", month: "déc", title: "Revue des mandats · [IMF E]", where: "Ziguinchor", team: "2 agents", kind: "Documentaire", prog: "0%" },
  ],
  "En cours": [
    { day: "10", month: "nov", title: "Contrôle sur place · [IMF B]", where: "Thiès", team: "4 agents", kind: "Sur place", prog: "65%" },
    { day: "06", month: "nov", title: "Audit des points de service · [IMF D]", where: "Dakar", team: "3 agents", kind: "Terrain", prog: "82%" },
  ],
  "Terminées": [
    { day: "28", month: "oct", title: "Contrôle sur place · [IMF F]", where: "Saint-Louis", team: "3 agents", kind: "Sur place", prog: "100%" },
  ],
};

export interface DemandeValidation { id: number; what: string; imf: string; who: string; when: string; dot: string }

export const FILE_VALIDATION: DemandeValidation[] = [
  { id: 1, what: "Nouveau DG déclaré", imf: "[IMF A]", who: "Cellule Conventions", when: "Aujourd’hui", dot: "#C9A44C" },
  { id: 2, what: "48 points importés (CSV)", imf: "[IMF B]", who: "Cellule SIG", when: "Hier", dot: "#1F4E79" },
  { id: 3, what: "Agence passée « fermée »", imf: "[IMF D]", who: "Analyse financière", when: "11 nov.", dot: "#B91C1C" },
  { id: 4, what: "Coordonnées GPS corrigées", imf: "[IMF C]", who: "Cellule SIG", when: "10 nov.", dot: "#2E7D6B" },
];

/** Activité récente (tableau de bord) pour les rôles sans accès au journal d'audit. */
export const ACTIVITE_DEMO = [
  { dot: "#C9A44C", titre: "Import CSV", detail: "48 points de service ajoutés", meta: "Cellule SIG · il y a 2 h" },
  { dot: "#0B1424", titre: "Fiche dirigeant consultée", detail: "[Sigle IMF]", meta: "Division Supervision · il y a 3 h" },
  { dot: "#15803D", titre: "Statut mis à jour", detail: "Agence passée « ouverte »", meta: "Administrateur · hier" },
];
