/**
 * Téléchargements avec retour à l'utilisateur : « Préparation… » pendant que le serveur produit
 * le fichier, puis « Export téléchargé » avec le nom du fichier, ou l'erreur.
 */
import { telecharger } from "../api/client";
import { telechargerCsv } from "./csv";
import { notifier } from "./notifier";

export async function exporter(chemin: string, nomParDefaut: string, description = "") {
  const id = notifier.attente("Préparation de l'export…", description || undefined);
  try {
    const nom = await telecharger(chemin, nomParDefaut);
    notifier.succes("Export téléchargé", nom, { remplace: id });
  } catch (e) {
    notifier.erreur("Export impossible", (e as Error).message || "Le serveur n'a pas pu produire le fichier.", { remplace: id });
  }
}

/** Fichier CSV produit dans le navigateur (sélection, rapport) : téléchargement immédiat et confirmation. */
export function exporterCsv(nom: string, lignes: Parameters<typeof telechargerCsv>[1], description?: string) {
  telechargerCsv(nom, lignes);
  notifier.succes("Fichier téléchargé", description ? `${nom} · ${description}` : nom);
}
