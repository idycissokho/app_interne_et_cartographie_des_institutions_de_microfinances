/**
 * Design tokens « Or & Nuit » (DESIGN_SYSTEM.md). Valeurs identiques à la maquette.
 */
export const T = {
  nuit900: "#0B1424",
  nuit800: "#13213A",
  or500: "#C9A44C",
  or300: "#F3D98C",
  or700: "#8A6A1F",
  ivoire: "#FAF7F0",
  sable: "#ECE5D5",
  succes: "#15803D",
  alerte: "#D97706",
  danger: "#B91C1C",
  // Couleurs récurrentes de la maquette
  blanc: "#FFFFFF",
  texteClair: "#F4EFE3",
  gris600: "#4A5568",
  gris500: "#6B7280",
  ligne: "#F1ECE0",
  creme: "#F3ECDC",
  sableFonce: "#E2DCCD",
} as const;

/** Courbe d'animation commune de la maquette. */
export const EASE = "cubic-bezier(.2,.7,.2,1)";

/** Pastilles de statut (couple fond / texte), reprises des renderVals() de la maquette. */
export const BADGES: Record<string, [string, string]> = {
  AGREE: ["#DCFCE7", "#166534"],
  EN_COURS: ["#FEF3C7", "#92400E"],
  RADIEE: ["#FDECEC", "#991B1B"],
  RADIE: ["#FDECEC", "#991B1B"],
  OUVERT: ["#DCFCE7", "#166534"],
  SUSPENDU_POINT: ["#FEF3C7", "#92400E"],
  FERME: ["#E5E7EB", "#374151"],
  EN_FONCTION: ["#DCFCE7", "#166534"],
  INTERIM: ["#FEF3C7", "#92400E"],
  SUSPENDU: ["#FDECEC", "#991B1B"],
};

/** Couleur par type de point (écran 09). */
export const COULEUR_TYPE_POINT: Record<string, string> = {
  SIEGE: "#C9A44C",
  AGENCE: "#1F4E79",
  GUICHET: "#B5763A",
  BUREAU: "#2E7D6B",
};
