/**
 * Règles de session côté interface (le serveur applique les mêmes, voir SIMPLE_JWT) :
 * - déconnexion après `inactivite` minutes sans clic, frappe, défilement ni toucher ;
 * - déconnexion après `dureeMax` heures depuis la connexion, même en restant actif.
 *
 * L'heure de connexion et la dernière activité sont dans localStorage : elles sont communes à
 * tous les onglets (une activité dans un onglet garde les autres ouverts) et survivent au
 * rechargement, ce qui permet de refuser une session restée ouverte trop longtemps.
 */

const CLE_DEBUT = "imf.session.debut";
const CLE_ACTIVITE = "imf.session.activite";
const CLE_REGLES = "imf.session.regles";
const CLE_MOTIF = "imf.session.motif";

export interface ReglesSession { inactivite_minutes: number; duree_max_heures: number }
const DEFAUT: ReglesSession = { inactivite_minutes: 30, duree_max_heures: 8 };

const lire = (cle: string) => { try { return localStorage.getItem(cle); } catch { return null; } };
const ecrire = (cle: string, v: string) => { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } };
const retirer = (cle: string) => { try { localStorage.removeItem(cle); } catch { /* stockage indisponible */ } };

/** Canal entre onglets : nouveaux jetons après rotation, déconnexion. */
export const canalSession: BroadcastChannel | null = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("imf-session");

export type MotifDeconnexion = "inactivite" | "duree" | "expiree";

export const session = {
  regles(): ReglesSession {
    try { return { ...DEFAUT, ...JSON.parse(lire(CLE_REGLES) ?? "{}") }; } catch { return DEFAUT; }
  },
  inactiviteMs: () => session.regles().inactivite_minutes * 60_000,
  dureeMaxMs: () => session.regles().duree_max_heures * 3_600_000,

  demarrer(regles?: ReglesSession) {
    const maintenant = String(Date.now());
    ecrire(CLE_DEBUT, maintenant);
    ecrire(CLE_ACTIVITE, maintenant);
    if (regles) ecrire(CLE_REGLES, JSON.stringify(regles));
  },
  /** Enregistre une activité (au plus une écriture toutes les 5 s). */
  noterActivite(force = false) {
    const derniere = Number(lire(CLE_ACTIVITE) ?? 0);
    if (force || Date.now() - derniere > 5000) ecrire(CLE_ACTIVITE, String(Date.now()));
  },
  derniereActivite: () => Number(lire(CLE_ACTIVITE) ?? 0),
  debut: () => Number(lire(CLE_DEBUT) ?? 0),
  active: () => lire(CLE_DEBUT) !== null,

  /** Raison d'expirer la session maintenant, ou null si elle est encore valable. */
  motifExpiration(): MotifDeconnexion | null {
    if (!session.active()) return null;
    const maintenant = Date.now();
    if (maintenant - session.debut() > session.dureeMaxMs()) return "duree";
    if (maintenant - session.derniereActivite() > session.inactiviteMs()) return "inactivite";
    return null;
  },
  effacer() {
    retirer(CLE_DEBUT);
    retirer(CLE_ACTIVITE);
  },

  /** Motif affiché une fois sur la page de connexion. */
  memoriserMotif(m: MotifDeconnexion) { try { sessionStorage.setItem(CLE_MOTIF, m); } catch { /* indisponible */ } },
  lireMotif(): MotifDeconnexion | null {
    try { return sessionStorage.getItem(CLE_MOTIF) as MotifDeconnexion | null; } catch { return null; }
  },
  oublierMotif() { try { sessionStorage.removeItem(CLE_MOTIF); } catch { /* indisponible */ } },
};
