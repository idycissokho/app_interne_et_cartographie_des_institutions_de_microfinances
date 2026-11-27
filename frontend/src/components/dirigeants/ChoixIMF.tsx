/**
 * Sélecteur d'institution avec recherche (nom, sigle, numéro d'agrément) : filtre
 * « tous les dirigeants d'une institution » de l'écran Dirigeants et mandats.
 */
import { useMemo, useState } from "react";

import { regionAffichee } from "../../lib/metier";
import type { ImfOption } from "../../lib/stats";
import { pluriel } from "../../lib/format";

const MAX = 8;
/** Comparaison sans accents ni majuscules. */
export const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ICONE = "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6";

export function ChoixIMF({ imfs, valeur, onChange }: { imfs: ImfOption[]; valeur: string; onChange: (id: string) => void }) {
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const choisie = imfs.find((i) => i.id === valeur);
  const trouvees = useMemo(() => {
    const t = sansAccents(texte.trim());
    return t ? imfs.filter((i) => sansAccents(`${i.nom} ${i.sigle} ${i.numero_agrement}`).includes(t)) : imfs;
  }, [imfs, texte]);
  const choisir = (id: string) => { onChange(id); setTexte(""); setOuvert(false); };

  if (choisie) {
    return (
      <div style={{ height: 46, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: "0 8px 0 12px", borderRadius: 10, border: "1.5px solid #C9A44C", background: "#FAFAF9", minWidth: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d={ICONE} /></svg>
        <span title={choisie.nom} style={{ flex: 1, minWidth: 0, fontSize: "var(--t-md)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{choisie.sigle || choisie.nom}</span>
        <button type="button" aria-label="Retirer le filtre institution" onClick={() => onChange("")} style={{ width: 30, height: 30, flex: "none", borderRadius: 9, border: "none", background: "transparent", color: "#6E5416", cursor: "pointer", fontSize: "var(--t-lg)", lineHeight: 1 }}>×</button>
      </div>
    );
  }
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9AA3B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ position: "absolute", left: 14, top: 14, pointerEvents: "none" }}><path d={ICONE} /></svg>
      <input className="fi-input ps-input" role="combobox" aria-expanded={ouvert} aria-controls="di-imf-liste" aria-label="Filtrer par institution" placeholder="Toutes les institutions…" value={texte}
        onChange={(e) => { setTexte(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)} onBlur={() => setOuvert(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOuvert(false); if (e.key === "Enter" && trouvees[0]) { e.preventDefault(); choisir(trouvees[0].id); } }}
        style={{ paddingLeft: 40 }} />
      {ouvert && (
        <div id="di-imf-liste" role="listbox" className="di-fade" style={{ position: "absolute", zIndex: 20, top: 52, left: 0, right: 0, minWidth: 300, maxHeight: 380, overflowY: "auto", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E7E5E4", boxShadow: "0 24px 50px rgba(11,20,36,.18)", padding: 6 }}>
          {trouvees.slice(0, MAX).map((i) => (
            // onMouseDown : choisir avant que le champ perde le focus (qui ferme la liste).
            <button key={i.id} type="button" role="option" aria-selected={false} className="di-opt" onMouseDown={(e) => { e.preventDefault(); choisir(i.id); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 10, border: "none", background: "transparent", font: "inherit", color: "#0B1424", cursor: "pointer" }}>
              <b style={{ display: "block", fontSize: "var(--t-sm)", lineHeight: 1.35 }}>{i.sigle ? `${i.sigle} — ` : ""}{i.nom}</b>
              <span style={{ fontSize: "var(--t-xs)", color: "#6B7280" }}>{[regionAffichee(i.region_siege), i.numero_agrement, `${i.nb_points_service} ${pluriel(i.nb_points_service, "point")} de service`].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {trouvees.length === 0 && <div style={{ padding: "12px", fontSize: "var(--t-sm)", color: "#6B7280" }}>Aucune institution trouvée.</div>}
          {trouvees.length > MAX && <div style={{ padding: "8px 12px", fontSize: "var(--t-xs)", color: "#6B7280", borderTop: "1px solid #F0EFED" }}>{trouvees.length - MAX} autres institutions — précisez la recherche.</div>}
        </div>
      )}
    </div>
  );
}
