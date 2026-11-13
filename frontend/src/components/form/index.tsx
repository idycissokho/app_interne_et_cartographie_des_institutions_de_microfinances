/**
 * Composants de formulaire partagés (écrans 08 à 11). Styles transcrits de
 * 08-formulaire-imf.dc.html ; fi-input = ps-input = di-input (même style, cf. PROMPT_REPRODUCTION.md).
 */
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";

import { ErreurApi } from "../../api/client";

/** Erreurs DRF → { champ: message } (affichées sous chaque champ). */
export function erreursChamps(err: unknown): Record<string, string> {
  if (!(err instanceof ErreurApi) || typeof err.details !== "object" || !err.details) return { __global: (err as Error)?.message ?? "Erreur inconnue" };
  const o: Record<string, string> = {};
  Object.entries(err.details as Record<string, unknown>).forEach(([k, v]) => {
    o[k === "non_field_errors" || k === "detail" ? "__global" : k] = Array.isArray(v) ? v.map(String).join(" ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
  return o;
}

export function Label({ htmlFor, requis, children }: { htmlFor?: string; requis?: boolean; children: ReactNode }) {
  return <label className="fi-label" htmlFor={htmlFor}>{children}{requis && <span className="fi-req">*</span>}</label>;
}

export const Erreur = ({ children }: { children?: ReactNode }) => (children ? <span className="fi-err" role="alert">⚠ {children}</span> : null);
export const Aide = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <span className="fi-help" style={style}>{children}</span>;

/** Champ texte : libellé, astérisque, aide, erreur (bordure rouge). */
export function TextField({ id, label, requis, aide, erreur, addon, multiline, auto, style, ...props }:
  { id: string; label: string; requis?: boolean; aide?: ReactNode; erreur?: string | false | null; addon?: string; multiline?: boolean; auto?: boolean; style?: CSSProperties }
  & InputHTMLAttributes<HTMLInputElement> & { onChange?: (e: { target: { value: string } }) => void }) {
  const cls = "fi-input" + (erreur ? " bad" : "") + (auto ? " auto" : "");
  const champ = multiline
    ? <textarea id={id} className={cls} value={props.value as string} onChange={props.onChange} placeholder={props.placeholder} aria-invalid={!!erreur} />
    : <input id={id} className={cls} aria-invalid={!!erreur} {...props} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      <Label htmlFor={id} requis={requis}>{label}</Label>
      {addon ? <div className="fi-addon"><span>{addon}</span>{champ}</div> : champ}
      {aide && <Aide>{aide}</Aide>}
      <Erreur>{erreur || null}</Erreur>
    </div>
  );
}

export function SelectField({ id, label, requis, erreur, value, onChange, options, auto, style }:
  { id: string; label: string; requis?: boolean; erreur?: string | null; value: string; onChange: (v: string) => void; options: [string, string][]; auto?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      <Label htmlFor={id} requis={requis}>{label}</Label>
      <select id={id} className={"fi-input" + (erreur ? " bad" : "") + (auto ? " auto" : "")} value={value} onChange={(e) => onChange(e.target.value)} style={{ cursor: "pointer" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Erreur>{erreur}</Erreur>
    </div>
  );
}

/** Cartes de choix radio (type d'IMF, référentiel à importer…). */
export function ChoiceCards({ options, value, onChange, minWidth = 190 }: { options: { value: string; label: string; desc: string; icon: string }[]; value: string; onChange: (v: string) => void; minWidth?: number }) {
  return (
    <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`, gap: 12 }}>
      {options.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} type="button" className="fi-choice" role="radio" aria-checked={on} onClick={() => onChange(t.value)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, font: "inherit", color: "#0B1424", cursor: "pointer", ...(on ? { background: "#FDF8EA", border: "1.5px solid #C9A44C", boxShadow: "0 0 0 4px rgba(201,164,76,.14)" } : { background: "#FFFFFF", border: "1.5px solid #E2DCCD" }) }}>
            <span style={{ width: 40, height: 40, flex: "none", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", ...(on ? { background: "#0B1424", color: "#F3D98C" } : { background: "#F6F1E4", color: "#8A6A1F" }) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}><b style={{ fontSize: 14 }}>{t.label}</b><span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{t.desc}</span></span>
            <span style={{ marginLeft: "auto", width: 18, height: 18, flex: "none", borderRadius: "50%", boxSizing: "border-box", ...(on ? { border: "5px solid #C9A44C", background: "#FFFFFF" } : { border: "2px solid #D3C9B2" }) }} />
          </button>
        );
      })}
    </div>
  );
}

/** Contrôle segmenté avec pastille de couleur (statut réglementaire, statut de point / de mandat). */
export function Segmented({ options, value, onChange, label, hauteur = 44, base = "160px" }: { options: { value: string; label: string; color?: string }[]; value: string; onChange: (v: string) => void; label: string; hauteur?: number; base?: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", padding: 5, borderRadius: 14, background: "#F6F1E4", gap: 4, flexWrap: "wrap" }}>
      {options.map((s) => {
        const on = s.value === value;
        return (
          <button key={s.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(s.value)}
            style={{ flex: `1 1 ${base}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: hauteur, border: "none", borderRadius: 11, font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", ...(on ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 2px 10px rgba(11,20,36,.10)" } : { background: "transparent", color: "#6B7280" }) }}>
            {s.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />}{s.label}
          </button>
        );
      })}
    </div>
  );
}

/** Cases à cocher en pastilles (bailleurs associés). */
export function ToggleChips({ options, valeurs, onToggle }: { options: [string, string][]; valeurs: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {options.map(([v, l]) => {
        const on = valeurs.includes(v);
        return (
          <button key={v} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(v)}
            style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 16px 0 12px", borderRadius: 12, font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#F4EFE3", border: "1.5px solid #0B1424" } : { background: "#FFFFFF", color: "#1A2333", border: "1.5px solid #E2DCCD" }) }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, boxSizing: "border-box", ...(on ? { background: "#C9A44C", color: "#0B1424" } : { border: "2px solid #D3C9B2" }) }}>{on ? "✓" : ""}</span>{l}
          </button>
        );
      })}
    </div>
  );
}

/** Toast de confirmation / d'erreur (écran 08). */
export function Toast({ ton, titre, texte, bas = 96 }: { ton: "ok" | "ko"; titre: string; texte: ReactNode; bas?: number }) {
  return (
    <div className="fi-toast" role="status" style={{ position: "fixed", right: 28, bottom: bas, zIndex: 60, display: "flex", gap: 12, alignItems: "center", padding: "14px 18px", borderRadius: 16, background: ton === "ko" ? "#7F1D1D" : "#0B1424", color: "#F4EFE3", boxShadow: "0 20px 50px rgba(11,20,36,.35)", maxWidth: 380 }}>
      <span style={{ width: 32, height: 32, flex: "none", borderRadius: 10, background: ton === "ko" ? "#FCA5A5" : "#C9A44C", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{ton === "ko" ? "!" : "✓"}</span>
      <div style={{ fontSize: 13, lineHeight: 1.45 }}><b style={{ display: "block", fontSize: 14 }}>{titre}</b>{texte}</div>
    </div>
  );
}

/** En-tête numérotée d'une section de formulaire. */
export function EnteteSection({ n, titre, sousTitre, extra }: { n: number; titre: ReactNode; sousTitre: string; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <span style={{ width: 36, height: 36, flex: "none", borderRadius: 11, background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{n}</span>
      <div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{titre}{extra}</h2><p style={{ margin: "2px 0 0 0", fontSize: 13, color: "#6B7280" }}>{sousTitre}</p></div>
    </div>
  );
}

export const EMAIL_OK = (v: string) => v === "" || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v);
