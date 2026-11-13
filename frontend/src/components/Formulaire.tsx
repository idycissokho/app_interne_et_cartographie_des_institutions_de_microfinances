import { useState, type FormEvent } from "react";

export interface DefChamp {
  nom: string;
  label: string;
  type?: "text" | "email" | "url" | "date" | "number" | "select" | "file";
  options?: { value: string; label: string }[];
  requis?: boolean;
  aide?: string;
}

type Valeurs = Record<string, string | File | null>;

/**
 * Formulaire générique en fenêtre modale.
 * `soumettre` reçoit les valeurs et doit lever une erreur (message affiché) en cas d'échec.
 */
export function Formulaire({
  titre, champs, initial = {}, soumettre, fermer,
}: {
  titre: string;
  champs: DefChamp[];
  initial?: object;
  soumettre: (valeurs: Valeurs) => Promise<void>;
  fermer: () => void;
}) {
  const [valeurs, setValeurs] = useState<Valeurs>(() =>
    Object.fromEntries(
      // Un champ fichier part toujours vide : on n'envoie un fichier que s'il est re-sélectionné.
      champs.map((c) => [c.nom, c.type === "file" ? null : (initial as Record<string, unknown>)[c.nom] == null ? "" : String((initial as Record<string, unknown>)[c.nom])]),
    ),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await soumettre(valeurs);
      fermer();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="modale-fond" onClick={fermer}>
      <form className="modale" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>{titre}</h2>
        <div className="grille-form">
          {champs.map((c) => (
            <label key={c.nom} className={c.type === "file" ? "large" : ""}>
              <span>{c.label}{c.requis && " *"}</span>
              {c.type === "select" ? (
                <select required={c.requis} value={valeurs[c.nom] as string} onChange={(e) => setValeurs({ ...valeurs, [c.nom]: e.target.value })}>
                  <option value="">—</option>
                  {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : c.type === "file" ? (
                <input type="file" onChange={(e) => setValeurs({ ...valeurs, [c.nom]: e.target.files?.[0] ?? null })} />
              ) : (
                <input
                  type={c.type ?? "text"}
                  step={c.type === "number" ? "any" : undefined}
                  required={c.requis}
                  value={valeurs[c.nom] as string}
                  onChange={(e) => setValeurs({ ...valeurs, [c.nom]: e.target.value })}
                />
              )}
              {c.aide && <small className="muet">{c.aide}</small>}
            </label>
          ))}
        </div>
        {erreur && <div className="alerte alerte-erreur">{erreur}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={fermer}>Annuler</button>
          <button type="submit" className="btn btn-primaire" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </div>
  );
}

/** Convertit les valeurs du formulaire en JSON pour l'API : "" → null pour les champs optionnels. */
export function versJson(valeurs: Record<string, unknown>, nullables: string[] = []) {
  return Object.fromEntries(
    Object.entries(valeurs).map(([k, v]) => [k, v === "" && nullables.includes(k) ? null : v]),
  );
}

/** latitude/longitude → GeoJSON Point (ou null si vides). */
export function versPoint(lat: unknown, lon: unknown) {
  if (lat === "" || lon === "" || lat == null || lon == null) return null;
  return { type: "Point", coordinates: [Number(lon), Number(lat)] };
}
