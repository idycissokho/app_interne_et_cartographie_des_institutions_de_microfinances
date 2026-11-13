/** Libellés français des valeurs codées de l'API (miroir des TextChoices Django). */

export const LIBELLES: Record<string, Record<string, string>> = {
  type_imf: { MUTUELLE: "Mutuelle", COOPERATIVE: "Coopérative", SA: "Société Anonyme" },
  statut_reglementaire: {
    AGREE: "Agréée",
    EN_COURS: "En cours d'agrément",
    RADIEE: "Radiée",
    RADIE: "Radié",
  },
  type_point: { SIEGE: "Siège social", AGENCE: "Agence", GUICHET: "Guichet", BUREAU: "Bureau de représentation" },
  statut_point: { OUVERT: "Ouvert", FERME: "Fermé", SUSPENDU: "Suspendu" },
  fonction_mandat: {
    PCA: "PCA",
    PRESIDENT_CONSEIL: "Président du Conseil",
    DG: "Directeur Général",
    DGA: "Directeur Général Adjoint",
    GERANT: "Gérant",
    PRESIDENT_COMITE_CREDIT: "Président Commission Crédit",
    PRESIDENT_CONSEIL_SURVEILLANCE: "Président Conseil de Surveillance",
    RESPONSABLE_CONFORMITE: "Resp. Conformité / Contrôle interne",
    AUDITEUR_INTERNE: "Auditeur interne",
    DAF: "DAF",
    RESPONSABLE_SI: "Resp. IT / SI",
    RESPONSABLE_OPERATIONS: "Resp. Opérations / Réseau",
  },
  statut_mandat: { EN_FONCTION: "En fonction", INTERIM: "Intérim", SUSPENDU: "Suspendu" },
  type_zone: { REGION: "Région", DEPARTEMENT: "Département", COMMUNE: "Commune" },
  type_import: { IMF: "IMF", POINTS_SERVICE: "Points de service", DIRIGEANTS: "Dirigeants" },
  statut_import: { EN_ATTENTE: "En attente", EN_COURS: "En cours", TERMINE: "Terminé", ECHEC: "Échec" },
  role: { ADMIN: "Administrateur", SUPERVISEUR: "Superviseur", CONSULTANT: "Consultant" },
};

export const libelle = (champ: string, valeur: string | null | undefined) =>
  valeur ? LIBELLES[champ]?.[valeur] ?? valeur : "—";

export const options = (champ: string) =>
  Object.entries(LIBELLES[champ] ?? {}).map(([value, label]) => ({ value, label }));

export const montant = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("fr-FR") + " FCFA";

export const dateFr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-FR") : "—";
