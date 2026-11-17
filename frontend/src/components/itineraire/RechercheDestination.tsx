/**
 * Recherche d'une destination avec autocomplétion : IMF (nom, sigle, agrément) et points de service,
 * limités aux positions GPS fiables (GET /itineraires/destinations/?q=). Navigable au clavier.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { requeteApi } from "../../api/cache";
import { regionAffichee } from "../../lib/metier";
import type { Destination } from "./types";

/** Icônes : bâtiment pour une institution, épingle pour un point de service. */
export const ICONE_DESTINATION = {
  institution: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6",
  point_service: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
};

export function IconeDestination({ type, taille = 18 }: { type: Destination["type"]; taille?: number }) {
  return (
    <span className={`it-icone it-icone-${type}`} aria-hidden="true">
      <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONE_DESTINATION[type]} /></svg>
    </span>
  );
}

export function RechercheDestination({ onChoisir }: { onChoisir: (d: Destination) => void }) {
  const id = useId();
  const [texte, setTexte] = useState("");
  const [cherche, setCherche] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);

  // Une requête 250 ms après la dernière frappe.
  useEffect(() => {
    const minuteur = window.setTimeout(() => setCherche(texte.trim()), 250);
    return () => window.clearTimeout(minuteur);
  }, [texte]);

  const { data, isFetching, isError } = useQuery({
    ...requeteApi<{ results: Destination[] }>(`/itineraires/destinations/?q=${encodeURIComponent(cherche)}`),
    enabled: cherche.length >= 2,
    placeholderData: keepPreviousData,
  });
  const resultats = cherche.length >= 2 ? data?.results ?? [] : [];
  useEffect(() => setActif(0), [cherche]);

  const choisir = (d: Destination) => {
    onChoisir(d);
    setTexte("");
    setOuvert(false);
  };

  const montrer = ouvert && cherche.length >= 2;
  return (
    <div className="it-recherche">
      <label htmlFor={`${id}-champ`} className="fi-label">Destination</label>
      <div className="it-champ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          id={`${id}-champ`} className="fi-input" type="search" autoComplete="off" placeholder="IMF, sigle, agrément ou point de service"
          role="combobox" aria-expanded={montrer} aria-controls={`${id}-liste`} aria-autocomplete="list"
          aria-activedescendant={montrer && resultats[actif] ? `${id}-${actif}` : undefined}
          value={texte}
          onChange={(e) => { setTexte(e.target.value); setOuvert(true); }}
          onFocus={() => setOuvert(true)}
          onBlur={() => window.setTimeout(() => setOuvert(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActif((a) => Math.min(a + 1, resultats.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]); }
            else if (e.key === "Escape") setOuvert(false);
          }}
        />
      </div>
      {montrer && (
        <ul id={`${id}-liste`} role="listbox" className="it-suggestions" aria-label="Destinations proposées">
          {resultats.map((d, i) => (
            <li
              key={`${d.type}-${d.id}`} id={`${id}-${i}`} role="option" aria-selected={i === actif}
              onMouseDown={(e) => { e.preventDefault(); choisir(d); }} onMouseEnter={() => setActif(i)}
            >
              <IconeDestination type={d.type} />
              <span style={{ minWidth: 0 }}>
                <span className="it-sugg-nom">{d.nom}</span>
                <span className="it-sugg-sous">{d.sous_titre}{d.region ? ` · ${regionAffichee(d.region)}` : ""}</span>
              </span>
            </li>
          ))}
          {!resultats.length && (
            <li className="it-sugg-vide" role="presentation">
              {isError ? "La recherche n'a pas abouti. Réessayez." : isFetching ? "Recherche…" : "Aucune structure géolocalisée ne correspond."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
