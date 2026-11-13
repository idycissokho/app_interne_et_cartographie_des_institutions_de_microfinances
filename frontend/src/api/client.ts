/**
 * Client HTTP de l'API Django (/api/v1).
 * - Ajoute le jeton JWT, le renouvelle automatiquement sur 401 (rotation activée côté API).
 * - Normalise les erreurs DRF en message lisible.
 */

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

async function renouveler(): Promise<boolean> {
  const refresh = jetons.refresh();
  if (!refresh) return false;
  renouvellement ??= fetch(`${BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = await r.json();
      jetons.enregistrer(data.access, data.refresh);
      return true;
    })
    .finally(() => {
      renouvellement = null;
    });
  return renouvellement;
}

/** Déclenché quand la session est définitivement expirée. */
export const evenementDeconnexion = new EventTarget();

export async function requete<T = unknown>(
  chemin: string,
  options: RequestInit & { brut?: boolean } = {},
  dejaRenouvele = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  const access = jetons.access();
  if (access) headers.set("Authorization", `Bearer ${access}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const reponse = await fetch(`${BASE}${chemin}`, { ...options, headers });

  if (reponse.status === 401 && !dejaRenouvele && !chemin.startsWith("/auth/login")) {
    if (await renouveler()) return requete<T>(chemin, options, true);
    jetons.effacer();
    evenementDeconnexion.dispatchEvent(new Event("deconnexion"));
  }
  if (!reponse.ok) {
    const details = await reponse.json().catch(() => reponse.statusText);
    throw new ErreurApi(reponse.status, details);
  }
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
export async function telecharger(chemin: string, nomParDefaut: string) {
  const reponse = await requete<Response>(chemin, { brut: true });
  const dispo = reponse.headers.get("Content-Disposition") ?? "";
  const nom = /filename="([^"]+)"/.exec(dispo)?.[1] ?? nomParDefaut;
  const url = URL.createObjectURL(await reponse.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}
