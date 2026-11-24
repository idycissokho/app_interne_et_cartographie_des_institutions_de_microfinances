/**
 * Notifications de l'application (voir components/Notifications.tsx pour l'affichage).
 *
 *   notifier.succes("Institution enregistrée", "La fiche est à jour.");
 *   const id = notifier.attente("Préparation de l'export…");  puis  notifier.succes("Export prêt", nom, { remplace: id });
 */
import type { ReactNode } from "react";

export type Ton = "succes" | "erreur" | "info" | "attente";
interface Action { libelle: string; vers: string }
export interface Notification { id: number; ton: Ton; titre: string; texte?: ReactNode; action?: Action; duree: number }
interface Options { action?: Action; duree?: number; remplace?: number }

const MAX = 4;
const DUREES: Record<Ton, number> = { succes: 5000, info: 5000, erreur: 8000, attente: 0 }; // 0 : jusqu'au remplacement
let liste: Notification[] = [];
let suivant = 1;
const abonnes = new Set<() => void>();
const publier = () => abonnes.forEach((f) => f());

function ajouter(ton: Ton, titre: string, texte?: ReactNode, options: Options = {}): number {
  const notif: Notification = { id: options.remplace ?? suivant++, ton, titre, texte, action: options.action, duree: options.duree ?? DUREES[ton] };
  const existe = liste.some((n) => n.id === notif.id);
  liste = existe ? liste.map((n) => (n.id === notif.id ? notif : n)) : [...liste, notif].slice(-MAX);
  publier();
  return notif.id;
}

export const notifier = {
  succes: (titre: string, texte?: ReactNode, options?: Options) => ajouter("succes", titre, texte, options),
  erreur: (titre: string, texte?: ReactNode, options?: Options) => ajouter("erreur", titre, texte, options),
  info: (titre: string, texte?: ReactNode, options?: Options) => ajouter("info", titre, texte, options),
  /** Action en cours (envoi, préparation) : reste affichée jusqu'à son remplacement par le résultat. */
  attente: (titre: string, texte?: ReactNode, options?: Options) => ajouter("attente", titre, texte, options),
  fermer: (id: number) => { liste = liste.filter((n) => n.id !== id); publier(); },
};

export const lire = () => liste;
export const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

