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

/** Tiroir latéral (écran 09) : voile + panneau de 560 px à droite, pied d'actions. */
export function Drawer({ surTitre, titre, onClose, children, pied }: { surTitre: string; titre: string; onClose: () => void; children: ReactNode; pied: ReactNode }) {
  return (
    <>
      <div className="ps-fade" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,20,36,.38)", backdropFilter: "blur(2px)", zIndex: 40 }} />
      <aside className="ps-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-titre" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "100%", zIndex: 41, background: "#FFFFFF", boxShadow: "-30px 0 60px rgba(11,20,36,.22)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 26px", borderBottom: "1px solid #F1ECE0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>{surTitre}</span><h2 id="drawer-titre" style={{ margin: "4px 0 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{titre}</h2></div>
          <button type="button" aria-label="Fermer" onClick={onClose} style={{ width: 40, height: 40, flex: "none", borderRadius: 12, border: "1px solid #ECE5D5", background: "#FFFFFF", color: "#0B1424", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        {children}
        <div style={{ padding: "16px 26px", borderTop: "1px solid #F1ECE0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FDFBF6", flexWrap: "wrap" }}>{pied}</div>
      </aside>
    </>
  );
}

export const btnSecondaire: CSSProperties = { height: 48, padding: "0 18px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", font: "inherit", fontSize: 14, fontWeight: 700, color: "#0B1424", cursor: "pointer" };
export const btnPrimaire: CSSProperties = { height: 48, padding: "0 22px", borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", cursor: "pointer", boxShadow: "0 10px 24px rgba(201,164,76,.35)" };

/** Fenêtre modale (écran 10) : voile flouté, carte centrée de 680 px, pied d'actions. */
export function Modal({ titre, sousTitre, onClose, children, pied, entete }: { titre: string; sousTitre: string; onClose: () => void; children: ReactNode; pied: ReactNode; entete?: ReactNode }) {
  return (
    <>
      <div className="di-fade" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,20,36,.42)", backdropFilter: "blur(3px)", zIndex: 40 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 41, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box", pointerEvents: "none" }}>
        <div className="di-modal" role="dialog" aria-modal="true" aria-labelledby="modal-titre" style={{ pointerEvents: "auto", width: 680, maxWidth: "100%", maxHeight: "100%", overflow: "auto", borderRadius: 26, background: "#FFFFFF", boxShadow: "0 40px 90px rgba(11,20,36,.35)" }}>
          <div style={{ padding: "22px 26px 18px 26px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div><h2 id="modal-titre" style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{titre}</h2><p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#6B7280" }}>{sousTitre}</p></div>
            <button type="button" aria-label="Fermer" onClick={onClose} style={{ width: 40, height: 40, flex: "none", borderRadius: 12, border: "1px solid #ECE5D5", background: "#FFFFFF", color: "#0B1424", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          </div>
          {entete}
          {children}
          <div style={{ padding: "16px 26px", borderTop: "1px solid #F1ECE0", display: "flex", justifyContent: "space-between", gap: 10, background: "#FDFBF6", borderRadius: "0 0 26px 26px" }}>{pied}</div>
        </div>
      </div>
    </>
  );
}

/** Étapes numérotées avec barres de progression (écrans 10 et 11). */
export function Etapes({ etapes, courante }: { etapes: string[]; courante: number }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 10 }}>
      {etapes.map((l, i) => {
        const n = i + 1, done = courante > n, cur = courante === n;
        return (
          <li key={l} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }} aria-current={cur ? "step" : undefined}>
            <div style={{ height: 4, borderRadius: 99, background: done || cur ? "#C9A44C" : "#ECE5D5" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: cur || done ? "#0B1424" : "#9AA3B2" }}>
              <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, ...(done ? { background: "#15803D", color: "#FFFFFF" } : cur ? { background: "#0B1424", color: "#F3D98C" } : { background: "#F1ECE0", color: "#6B7280" }) }}>{done ? "✓" : n}</span>{l}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const tailleFichier = (o: number) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const COULEUR_EXT: Record<string, string> = { PDF: "#B91C1C", XLSX: "#15803D", CSV: "#1F4E79", JPG: "#8A6A1F", JPEG: "#8A6A1F", PNG: "#8A6A1F" };

/** Zone de dépôt de fichier (glisser-déposer ou parcourir) + fichier sélectionné. */
export function FileDrop({ id, accept, titre, formats, fichier, onFichier, detail }: { id: string; accept: string; titre: string; formats: string; fichier: File | null; onFichier: (f: File | null) => void; detail?: string }) {
  const ext = fichier?.name.split(".").pop()?.toUpperCase() ?? "";
  return (
    <>
      <label className="di-drop" htmlFor={id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFichier(e.dataTransfer.files[0] ?? null); }}
        style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, padding: 18, borderRadius: 16, border: "1.5px dashed #D3C9B2", background: "#FDFBF6", cursor: "pointer", transition: "border-color .15s ease, background .15s ease" }}>
        <span style={{ width: 44, height: 44, flex: "none", borderRadius: 14, background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg></span>
        <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 14 }}>{titre}</b><span style={{ fontSize: 12, color: "#6B7280" }}>{formats} · ou <span style={{ color: "#8A6A1F", fontWeight: 700 }}>parcourir vos fichiers</span></span></span>
        <input id={id} type="file" accept={accept} onChange={(e) => onFichier(e.target.files?.[0] ?? null)} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      </label>
      {fichier && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid #ECE5D5" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#FFFFFF", background: COULEUR_EXT[ext] ?? "#4A5568", padding: "4px 6px", borderRadius: 6 }}>{ext}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{fichier.name} <span style={{ color: "#6B7280", fontWeight: 500 }}>· {tailleFichier(fichier.size)}{detail ? ` · ${detail}` : ""}</span></span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#15803D" }}>✓ Prêt</span>
          <button type="button" aria-label="Retirer le fichier" onClick={() => onFichier(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6B7280", fontSize: 16 }}>×</button>
        </div>
      )}
    </>
  );
}
