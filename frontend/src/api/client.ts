/**
 * Client HTTP de l'API Django (/api/v1).
 * - Ajoute le jeton JWT, le renouvelle automatiquement sur 401 (rotation activée côté API).
 * - Normalise les erreurs DRF en message lisible.
 */

import { canalSession, session } from "../auth/session";

const BASE = "/api/v1";
const CLE_ACCESS = "imf.access";
const CLE_REFRESH = "imf.refresh";

/**
 * Jetons JWT : localStorage si « Rester connecté sur ce poste » est coché,
 * sinon sessionStorage (effacés à la fermeture du navigateur).
 */
const stockage = () => (localStorage.getItem(CLE_REFRESH) ? localStorage : sessionStorage);

export const jetons = {
  access: () => stockage().getItem(CLE_ACCESS),
  refresh: () => stockage().getItem(CLE_REFRESH),
  enregistrer(access: string, refresh?: string, persistant?: boolean) {
    const cible = persistant === undefined ? stockage() : persistant ? localStorage : sessionStorage;
    cible.setItem(CLE_ACCESS, access);
    if (refresh) cible.setItem(CLE_REFRESH, refresh);
  },
  effacer() {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(CLE_ACCESS);
      s.removeItem(CLE_REFRESH);
    });
  },
};

export class ErreurApi extends Error {
  constructor(public statut: number, public details: unknown) {
    super(formaterErreur(details) || `Erreur ${statut}`);
  }
}

function formaterErreur(details: unknown): string {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) return details.map(formaterErreur).join(" ");
  if (typeof details === "object") {
    return Object.entries(details as Record<string, unknown>)
      .map(([cle, val]) =>
        cle === "detail" || cle === "non_field_errors" ? formaterErreur(val) : `${cle} : ${formaterErreur(val)}`,
      )
      .join(" — ");
  }
  return String(details);
}

let renouvellement: Promise<boolean> | null = null;
/** Heure du dernier renouvellement réussi (la session côté serveur expire sans renouvellement). */
export const etatJetons = { renouveleA: Date.now() };

/**
 * Renouvelle la paire de jetons (rotation : l'ancien jeton de rafraîchissement est révoqué).
 * Les autres onglets reçoivent les nouveaux jetons par le canal de session.
 */
export async function renouveler(): Promise<boolean> {
  const refresh = jetons.refresh();
  if (!refresh) return false;
  renouvellement ??= fetch(`${BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (r) => {
      // Un autre onglet a renouvelé au même moment : ses jetons, déjà reçus, font foi.
      if (!r.ok) return jetons.refresh() !== null && jetons.refresh() !== refresh;
      const data = await r.json();
      jetons.enregistrer(data.access, data.refresh);
      etatJetons.renouveleA = Date.now();
      canalSession?.postMessage({ type: "jetons", access: data.access, refresh: data.refresh });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      renouvellement = null;
    });
  return renouvellement;
}

// Jetons renouvelés dans un autre onglet : on les reprend pour ne pas utiliser un jeton révoqué.
canalSession?.addEventListener("message", (e: MessageEvent) => {
  if (e.data?.type === "jetons" && jetons.refresh()) {
    jetons.enregistrer(e.data.access, e.data.refresh);
    etatJetons.renouveleA = Date.now();
  }
});

/** Déclenché quand la session est définitivement expirée. */
export const evenementDeconnexion = new EventTarget();

/** Déclenché après chaque écriture réussie (POST, PATCH, DELETE) : le cache des lectures est alors périmé. */
export const evenementEcriture = new EventTarget();

/**
 * Serveur momentanément indisponible (hébergement mis en veille qui redémarre, redémarrage
 * de l'intranet) : réponses 502 / 503 / 504 du serveur web, ou aucune réponse.
 * `evenementReveil` signale le début ("debut") et la fin ("fin") de l'attente, pour afficher
 * « Démarrage du serveur, merci de patienter… » au lieu d'une erreur.
 */
export const evenementReveil = new EventTarget();
/** Attente en cours : lu au montage de l'avis, qui peut arriver après le signal "debut". */
export const etatReveil = { enCours: false };
const INDISPONIBLE = new Set([502, 503, 504]);
const ATTENTE_MAX = 120_000; // ms
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let reveil: Promise<void> | null = null;

/** Interroge /sante/ jusqu'à ce que le serveur réponde (une seule attente partagée par toutes les requêtes). */
function attendreServeur(): Promise<void> {
  reveil ??= (async () => {
    etatReveil.enCours = true;
    evenementReveil.dispatchEvent(new Event("debut"));
    try {
      const limite = Date.now() + ATTENTE_MAX;
      while (Date.now() < limite) {
        try {
          if ((await fetch(`${BASE}/sante/`, { cache: "no-store" })).ok) return;
        } catch {
          /* pas encore joignable */
        }
        await pause(3000);
      }
      throw new ErreurApi(503, "Le serveur ne répond pas. Réessayez dans quelques instants.");
    } finally {
      etatReveil.enCours = false;
      evenementReveil.dispatchEvent(new Event("fin"));
      reveil = null;
    }
  })();
  return reveil;
}

/** À l'ouverture de l'application : réveille le serveur pendant que l'utilisateur saisit ses identifiants. */
export function reveillerServeur() {
  fetch(`${BASE}/sante/`, { cache: "no-store" }).then((r) => { if (!r.ok && INDISPONIBLE.has(r.status)) void attendreServeur().catch(() => undefined); }, () => undefined);
}

export async function requete<T = unknown>(
  chemin: string,
  /** `sansEffet` : POST qui ne modifie aucune donnée (calcul d'itinéraire) ; le cache des lectures reste valable. */
  options: RequestInit & { brut?: boolean; sansEffet?: boolean } = {},
  dejaRenouvele = false,
  dejaAttendu = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  const access = jetons.access();
  if (access) headers.set("Authorization", `Bearer ${access}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let reponse: Response | null = null;
  try {
    reponse = await fetch(`${BASE}${chemin}`, { ...options, headers });
  } catch (e) {
    if (dejaAttendu) throw e;
  }
  if (!reponse || (INDISPONIBLE.has(reponse.status) && !dejaAttendu)) {
    await attendreServeur();
    // Lecture ou authentification : rejouée sans risque. Écriture : elle a pu être reçue
    // avant la coupure, on ne la renvoie pas pour ne pas l'enregistrer deux fois.
    const methode = (options.method ?? "GET").toUpperCase();
    if (methode === "GET" || chemin.startsWith("/auth/")) return requete<T>(chemin, options, dejaRenouvele, true);
    throw new ErreurApi(503, "Le serveur vient de redémarrer : vérifiez si l'opération a été enregistrée, puis recommencez si besoin.");
  }

  if (reponse.status === 401 && !dejaRenouvele && !chemin.startsWith("/auth/login")) {
    if (await renouveler()) return requete<T>(chemin, options, true, dejaAttendu);
    if (jetons.refresh() || jetons.access()) session.memoriserMotif("expiree");
    jetons.effacer();
    session.effacer();
    evenementDeconnexion.dispatchEvent(new Event("deconnexion"));
  }
  if (!reponse.ok) {
    const details = await reponse.json().catch(() => reponse.statusText);
    throw new ErreurApi(reponse.status, details);
  }
  const ecriture = (options.method ?? "GET") !== "GET" && !chemin.startsWith("/auth/") && !options.sansEffet;
  if (ecriture) evenementEcriture.dispatchEvent(new Event("ecriture"));
  if (options.brut) return reponse as unknown as T;
  if (reponse.status === 204) return undefined as T;
  return reponse.json() as Promise<T>;
}

export const api = {
  get: <T>(chemin: string) => requete<T>(chemin),
  post: <T>(chemin: string, corps?: unknown) =>
    requete<T>(chemin, { method: "POST", body: corps instanceof FormData ? corps : JSON.stringify(corps ?? {}) }),
  patch: <T>(chemin: string, corps: unknown) =>
    requete<T>(chemin, { method: "PATCH", body: JSON.stringify(corps) }),
  delete: (chemin: string) => requete<void>(chemin, { method: "DELETE" }),
};

/** Construit une query string en ignorant les valeurs vides. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Télécharge un fichier renvoyé par l'API (CSV d'export, modèle d'import). */
export async function telecharger(chemin: string, nomParDefaut: string): Promise<string> {
  const reponse = await requete<Response>(chemin, { brut: true });
  const dispo = reponse.headers.get("Content-Disposition") ?? "";
  const nom = /filename="([^"]+)"/.exec(dispo)?.[1] ?? nomParDefaut;
  const url = URL.createObjectURL(await reponse.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
  return nom;
}
