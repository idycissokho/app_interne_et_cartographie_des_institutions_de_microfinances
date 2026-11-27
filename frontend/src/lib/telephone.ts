/**
 * Numéros de téléphone sénégalais saisis librement (« 33 829 20 20 / 77 503 06 06 »,
 * « +221 77 195 28 29 », deux numéros collés…) : découpage, affichage et liens de contact.
 *
 * - Appel : lien tel:+221XXXXXXXXX (composé directement sur téléphone).
 * - WhatsApp : lien https://wa.me/221XXXXXXXXX (ouvre la discussion), seulement pour les
 *   portables (70, 75, 76, 77, 78) : une ligne fixe (33…) n'a pas de compte WhatsApp.
 */

export interface Numero {
  /** « 77 195 28 29 » (ou le texte d'origine s'il n'est pas reconnu). */
  affiche: string;
  /** Lien d'appel, ou null si le numéro n'est pas reconnu. */
  appel: string | null;
  /** Lien de discussion WhatsApp (portables uniquement), sinon null. */
  whatsapp: string | null;
}

const PORTABLE = /^7[05678]/;

function neufChiffres(chiffres: string): string[] {
  if (chiffres.length === 12 && chiffres.startsWith("221")) return [chiffres.slice(3)];
  if (chiffres.length === 9) return [chiffres];
  // Plusieurs numéros collés sans séparateur (18, 27 chiffres…).
  if (chiffres.length % 9 === 0) return chiffres.match(/\d{9}/g) ?? [];
  return [];
}

export function numerosTelephone(texte: string | null | undefined): Numero[] {
  if (!texte) return [];
  const morceaux = texte.split(/[/;,|]|\bet\b|\bou\b/i).map((t) => t.trim()).filter(Boolean);
  const vus = new Set<string>();
  const resultat: Numero[] = [];
  for (const brut of morceaux) {
    const reconnus = neufChiffres(brut.replace(/\D/g, ""));
    if (!reconnus.length) {
      resultat.push({ affiche: brut, appel: null, whatsapp: null });
      continue;
    }
    for (const n of reconnus) {
      if (vus.has(n)) continue;
      vus.add(n);
      resultat.push({
        affiche: n.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4"),
        appel: `tel:+221${n}`,
        whatsapp: PORTABLE.test(n) ? `https://wa.me/221${n}` : null,
      });
    }
  }
  return resultat;
}
