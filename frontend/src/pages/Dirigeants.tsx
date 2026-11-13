/**
 * Écran 10 — Dirigeants et mandats : liste + modale en 2 étapes
 * (maquette-carto-imf/ecrans/10-dirigeants.dc.html).
 */
import { useEffect, useState, type CSSProperties } from "react";

import { api, qs, requete } from "../api/client";
import type { Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { EMAIL_OK, Erreur, Etapes, FileDrop, Label, Modal, Toast, btnPrimaire, btnSecondaire, erreursChamps } from "../components/form";
import { AppLayout } from "../components/layout/AppLayout";
import { CODE_FONCTION, nombre } from "../lib/format";
import { FONCTIONS, LIBELLE_FONCTION, SB, STATUT_MANDAT, avancementMandat, initiales } from "../lib/metier";
import { useDonnees } from "../lib/useDonnees";

interface Mandat {
  id: string; dirigeant: string; dirigeant_nom_complet: string; dirigeant_email: string; imf: string; imf_nom: string; imf_sigle: string;
  fonction_mandat: string; date_debut: string; date_fin: string | null; statut_mandat: string; fichier_justificatif: string | null; documents_justificatifs: string;
}
interface DirigeantRes { id: string; nom_complet: string; email_professionnel: string; nb_mandats: number }

const FAMILLES: [string, string, string[]][] = [
  ["Toutes", "Toutes les fonctions", []],
  ["Conseils", "Conseils", ["PCA", "PRESIDENT_CONSEIL", "PRESIDENT_CONSEIL_SURVEILLANCE"]],
  ["Direction", "Direction", ["DG", "DGA", "GERANT", "DAF", "RESPONSABLE_SI", "RESPONSABLE_OPERATIONS"]],
  ["Comités", "Comités", ["PRESIDENT_COMITE_CREDIT"]],
  ["Contrôle", "Contrôle", ["RESPONSABLE_CONFORMITE", "AUDITEUR_INTERNE"]],
];
const STATUTS: [string, string, string][] = [["EN_FONCTION", "En fonction", "#15803D"], ["INTERIM", "Intérim", "#D97706"], ["SUSPENDU", "Suspendu", "#B91C1C"]];
const TAILLE = 20;
const chip = (on: boolean): CSSProperties => ({ font: "inherit", fontSize: 13, fontWeight: 700, padding: "9px 14px", borderRadius: 999, cursor: "pointer", ...(on ? { background: "#0B1424", color: "#F3D98C", border: "1px solid #0B1424" } : { background: "#FFFFFF", color: "#4A5568", border: "1px solid #ECE5D5" }) });
const seg = (on: boolean): CSSProperties => ({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, border: "none", borderRadius: 9, font: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", ...(on ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 2px 8px rgba(11,20,36,.10)" } : { background: "transparent", color: "#6B7280" }) });
const pageBtn = (on = false): CSSProperties => ({ width: 36, height: 36, borderRadius: 10, font: "inherit", cursor: "pointer", ...(on ? { border: "none", background: "#0B1424", color: "#F3D98C", fontWeight: 800 } : { border: "1px solid #ECE5D5", background: "#FFFFFF", color: "#0B1424", fontWeight: 700 }) });
const champ: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const nomFichier = (url: string) => decodeURIComponent(url.split("/").pop() ?? "Fichier");

export function Dirigeants() {
  // Diagramme : créer un mandat = ADMIN, modifier un mandat = SUPERVISEUR/ADMIN, consulter = tous.
  const { estAdmin, peutModifier } = useAuth();
  const [famille, setFamille] = useState("Toutes");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [modale, setModale] = useState<null | { mandat?: Mandat }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fonctions = FAMILLES.find((x) => x[0] === famille)![2];
  const { donnees: d } = useDonnees<{ rows: Page<Mandat> }>({
    rows: `/dirigeants/mandats/${qs({ page, page_size: TAILLE, fonction_mandat__in: fonctions.join(",") })}`,
  }, [version]);
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const numeros = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2 || n === 1 || n === pages);

  return (
    <AppLayout active="dirigeants" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="di-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Référentiels · Gouvernance</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Dirigeants et mandats</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>PCA, DG, gérants, comités. Chaque consultation de fiche est journalisée.</p>
          </div>
          {estAdmin && <button type="button" onClick={() => setModale({})} style={{ height: 46, padding: "0 18px", borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 10px 24px rgba(201,164,76,.35)" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouveau mandat</button>}
        </header>

        <div className="di-up d1" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FAMILLES.map(([k, l]) => <button key={k} type="button" aria-pressed={k === famille} onClick={() => { setFamille(k); setPage(1); }} style={chip(k === famille)}>{l}</button>)}
        </div>

        <section className="di-up d1" style={{ borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280", background: "#FDFBF6" }}><th style={{ padding: "12px 18px" }}>Dirigeant</th><th style={{ padding: "12px 8px" }}>Fonction</th><th style={{ padding: "12px 8px" }}>IMF</th><th style={{ padding: "12px 8px" }}>Mandat</th><th style={{ padding: "12px 8px" }}>Statut</th><th style={{ padding: "12px 18px" }}>Justificatif</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const av = avancementMandat(r.date_debut, r.date_fin);
                  const c = SB[r.statut_mandat];
                  const lien = r.fichier_justificatif || r.documents_justificatifs;
                  return (
                    <tr key={r.id} className="di-row" tabIndex={peutModifier ? 0 : undefined} onClick={() => peutModifier && setModale({ mandat: r })} onKeyDown={(e) => peutModifier && e.key === "Enter" && setModale({ mandat: r })} style={{ borderTop: "1px solid #F6F1E4", cursor: peutModifier ? "pointer" : "default" }}>
                      <td style={{ padding: "13px 18px" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 40, height: 40, flex: "none", borderRadius: "50%", background: "#0B1424", color: "#F3D98C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{initiales(r.dirigeant_nom_complet)}</span><div><div style={{ fontWeight: 800 }}>{r.dirigeant_nom_complet}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{r.dirigeant_email || "—"}</div></div></div></td>
                      <td style={{ padding: "13px 8px" }}><span style={{ fontSize: 12, fontWeight: 800, color: "#6E5416", background: "#F3ECDC", padding: "4px 9px", borderRadius: 8, marginRight: 6 }}>{CODE_FONCTION[r.fonction_mandat]}</span><span style={{ fontSize: 13, color: "#4A5568" }}>{LIBELLE_FONCTION[r.fonction_mandat]}</span></td>
                      <td style={{ padding: "13px 8px", fontWeight: 600 }}>{r.imf_nom}</td>
                      <td style={{ padding: "13px 8px", minWidth: 170 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginBottom: 5 }}><span>{r.date_debut.slice(0, 4)}</span><span>{r.date_fin ? r.date_fin.slice(0, 4) : "—"}</span></div><div style={{ height: 6, borderRadius: 99, background: "#F1ECE0", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 99, background: av.color, width: `${av.prog}%` }} /></div></td>
                      <td style={{ padding: "13px 8px" }}><span style={{ fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap", background: c[0], color: c[1] }}>{STATUT_MANDAT[r.statut_mandat]}</span></td>
                      <td style={{ padding: "13px 18px" }}>{lien
                        ? <a href={lien} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, textDecoration: "none" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6" /></svg>{r.fichier_justificatif ? nomFichier(r.fichier_justificatif) : "Lien externe"}</a>
                        : <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309" }}>Manquant</span>}</td>
                    </tr>
                  );
                })}
                {d.rows && rows.length === 0 && <tr><td colSpan={6} style={{ padding: "40px 18px", textAlign: "center", color: "#6B7280" }}>Aucun mandat pour ce filtre.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 18px", borderTop: "1px solid #F1ECE0", fontSize: 13, color: "#4A5568" }}>
            <span>{total ? `${(page - 1) * TAILLE + 1}–${(page - 1) * TAILLE + rows.length} sur ${nombre(total)} mandats` : "0 mandat"}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" aria-label="Page précédente" disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ ...pageBtn(), fontWeight: 400, color: "#4A5568" }}>‹</button>
              {numeros.map((n) => <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} style={pageBtn(n === page)}>{n}</button>)}
              <button type="button" aria-label="Page suivante" disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ ...pageBtn(), fontWeight: 400, color: "#4A5568" }}>›</button>
            </div>
          </div>
        </section>
      </main>
      {modale && <ModaleMandat mandat={modale.mandat} onClose={() => setModale(null)} onSaved={(m) => { setModale(null); setToast(m); setVersion((v) => v + 1); setTimeout(() => setToast(null), 3500); }} />}
      {toast && <Toast ton="ok" titre="Mandat enregistré" texte={toast} bas={28} />}
    </AppLayout>
  );
}

function ModaleMandat({ mandat, onClose, onSaved }: { mandat?: Mandat; onClose: () => void; onSaved: (msg: string) => void }) {
  const edition = !!mandat;
  const [step, setStep] = useState(edition ? 2 : 1);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [q, setQ] = useState("");
  const [trouves, setTrouves] = useState<DirigeantRes[]>([]);
  const [choisi, setChoisi] = useState<DirigeantRes | null>(mandat ? { id: mandat.dirigeant, nom_complet: mandat.dirigeant_nom_complet, email_professionnel: mandat.dirigeant_email, nb_mandats: 0 } : null);
  const [p, setP] = useState({ prenom: "", nom: "", tel: "", email: "", email2: "" });
  const [m, setM] = useState({ imf: mandat?.imf ?? "", fonction: mandat?.fonction_mandat ?? "DG", debut: mandat?.date_debut ?? "", fin: mandat?.date_fin ?? "", statut: mandat?.statut_mandat ?? "EN_FONCTION", lien: mandat?.documents_justificatifs ?? "" });
  const [fichier, setFichier] = useState<File | null>(null);
  const [avecLien, setAvecLien] = useState(!!mandat?.documents_justificatifs);
  const [touched, setTouched] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const { donnees: r } = useDonnees<{ imfs: Page<{ id: string; nom: string; sigle: string }> }>({ imfs: "/imf/?page_size=1000" });

  useEffect(() => {
    if (mode !== "existing") return;
    const t = setTimeout(() => api.get<Page<DirigeantRes>>(`/dirigeants/${qs({ search: q, page_size: 5 })}`).then((x) => setTrouves(x.results)).catch(() => setTrouves([])), 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  const nomComplet = mode === "existing" || edition ? choisi?.nom_complet ?? "" : `${p.prenom} ${p.nom}`.trim();
  const err1 = {
    prenom: touched && mode === "new" && !p.prenom.trim() ? "Le prénom est obligatoire." : erreurs.prenom,
    nom: touched && mode === "new" && !p.nom.trim() ? "Le nom est obligatoire." : erreurs.nom,
    email: !EMAIL_OK(p.email) ? "Adresse email invalide." : erreurs.email_professionnel,
    email2: !EMAIL_OK(p.email2) ? "Adresse email invalide." : erreurs.email_secondaire,
    choix: touched && mode === "existing" && !choisi ? "Sélectionnez un dirigeant." : undefined,
  };
  const finAvantDebut = !!(m.debut && m.fin && m.fin < m.debut);
  const err2 = {
    imf: touched && !m.imf ? "L'institution est obligatoire." : erreurs.imf,
    debut: touched && !m.debut ? "La date de début est obligatoire." : erreurs.date_debut,
    fin: finAvantDebut ? "La date de fin doit être postérieure à la date de début." : erreurs.date_fin,
    lien: erreurs.documents_justificatifs, fichier: erreurs.fichier_justificatif,
  };

  function continuer() {
    setTouched(true);
    if (mode === "new" ? !p.prenom.trim() || !p.nom.trim() || err1.email || err1.email2 : !choisi) return;
    setTouched(false); setErreurs({}); setStep(2);
  }

  async function enregistrer() {
    setTouched(true);
    if (!m.imf || !m.debut || finAvantDebut) return;
    setEnvoi(true);
    try {
      let dirigeantId = choisi?.id;
      if (!edition && mode === "new") {
        try {
          const d = await api.post<{ id: string }>("/dirigeants/", { prenom: p.prenom.trim(), nom: p.nom.trim(), telephone: p.tel.trim(), email_professionnel: p.email.trim(), email_secondaire: p.email2.trim() });
          dirigeantId = d.id;
          setChoisi({ id: d.id, nom_complet: nomComplet, email_professionnel: p.email, nb_mandats: 0 });
          setMode("existing");
        } catch (e) {
          setErreurs(erreursChamps(e)); setStep(1); return;
        }
      }
      const fd = new FormData();
      fd.append("imf", m.imf); fd.append("fonction_mandat", m.fonction); fd.append("date_debut", m.debut);
      fd.append("date_fin", m.fin); fd.append("statut_mandat", m.statut); fd.append("documents_justificatifs", avecLien ? m.lien.trim() : "");
      if (fichier) fd.append("fichier_justificatif", fichier);
      // En multipart, DRF lit un booléen absent comme False : le mandat serait créé déjà désactivé.
      if (!edition) fd.append("is_active", "true");
      const chemin = edition ? `/dirigeants/${mandat!.dirigeant}/mandats/${mandat!.id}/` : `/dirigeants/${dirigeantId}/mandats/`;
      await requete(chemin, { method: edition ? "PATCH" : "POST", body: fd });
      onSaved(`${LIBELLE_FONCTION[m.fonction]} · ${nomComplet}`);
    } catch (e) {
      setErreurs(erreursChamps(e));
    } finally {
      setEnvoi(false);
    }
  }

  const cls = (bad?: string | false) => "fi-input ps-input" + (bad ? " bad" : "");
  return (
    <Modal titre={edition ? "Modifier le mandat" : "Nouveau mandat"} sousTitre="Identifiez le dirigeant, puis décrivez sa fonction dans l'IMF." onClose={onClose}
      entete={!edition && <div style={{ padding: "0 26px 18px 26px" }}><Etapes etapes={["Dirigeant", "Mandat et justificatif"]} courante={step} /></div>}
      pied={<>
        <button type="button" onClick={() => (step === 1 || edition ? onClose() : setStep(1))} style={btnSecondaire}>{step === 1 || edition ? "Annuler" : "Retour"}</button>
        <button type="button" className="di-primary" disabled={envoi} onClick={step === 1 ? continuer : enregistrer} style={{ ...btnPrimaire, display: "flex", alignItems: "center", gap: 8 }}>{step === 1 ? "Continuer" : "Enregistrer le mandat"} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (step === 1) continuer(); else enregistrer(); }} style={{ padding: "4px 26px 22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
        {step === 1 && (<>
          <div role="radiogroup" style={{ display: "flex", padding: 4, borderRadius: 12, background: "#F6F1E4", gap: 2 }}>
            {([["existing", "Dirigeant existant"], ["new", "Nouveau dirigeant"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} style={seg(mode === k)}>{l}</button>)}
          </div>
          {mode === "existing" && (<>
            <div style={champ}><Label htmlFor="di-find">Rechercher un dirigeant</Label><input id="di-find" className="fi-input ps-input" placeholder="Nom, prénom ou email…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {trouves.map((t) => {
                const on = choisi?.id === t.id;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setChoisi(t)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, font: "inherit", color: "#0B1424", cursor: "pointer", textAlign: "left", ...(on ? { border: "1.5px solid #C9A44C", background: "#FDF8EA" } : { border: "1.5px solid #E2DCCD", background: "#FFFFFF" }) }}>
                    <span style={{ width: 38, height: 38, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, ...(on ? { background: "#0B1424", color: "#F3D98C" } : { background: "#F1ECE0", color: "#6E5416" }) }}>{initiales(t.nom_complet)}</span>
                    <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 14 }}>{t.nom_complet}</b><span style={{ fontSize: 12, color: "#6B7280" }}>{t.nb_mandats} mandat{t.nb_mandats > 1 ? "s" : ""}{t.email_professionnel ? ` · ${t.email_professionnel}` : ""}</span></span>
                    <span style={{ width: 18, height: 18, flex: "none", borderRadius: "50%", boxSizing: "border-box", ...(on ? { border: "5px solid #C9A44C" } : { border: "2px solid #D3C9B2" }) }} />
                  </button>
                );
              })}
              {trouves.length === 0 && <span className="fi-help">Aucun dirigeant trouvé.</span>}
              <Erreur>{err1.choix}</Erreur>
            </div>
          </>)}
          {mode === "new" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="ps-grille2">
              <div style={champ}><Label htmlFor="di-prenom" requis>Prénom</Label><input id="di-prenom" className={cls(err1.prenom)} value={p.prenom} onChange={(e) => setP({ ...p, prenom: e.target.value })} /><Erreur>{err1.prenom}</Erreur></div>
              <div style={champ}><Label htmlFor="di-nom" requis>Nom</Label><input id="di-nom" className={cls(err1.nom)} value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} /><Erreur>{err1.nom}</Erreur></div>
              <div style={champ}><Label htmlFor="di-tel">Téléphone</Label><input id="di-tel" className={cls(erreurs.telephone)} value={p.tel} onChange={(e) => setP({ ...p, tel: e.target.value })} placeholder="+221 77 000 00 00" inputMode="tel" /></div>
              <div style={champ}><Label htmlFor="di-mail">Email professionnel</Label><input id="di-mail" type="email" className={cls(err1.email)} value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} placeholder="prenom.nom@imf.sn" /><Erreur>{err1.email}</Erreur></div>
              <div style={{ ...champ, gridColumn: "span 2" }} className="ps-plein"><label className="fi-label" htmlFor="di-mail2">Email secondaire <span style={{ fontWeight: 600, color: "#6B7280" }}>(optionnel)</span></label><input id="di-mail2" type="email" className={cls(err1.email2)} value={p.email2} onChange={(e) => setP({ ...p, email2: e.target.value })} placeholder="adresse personnelle" /><Erreur>{err1.email2}</Erreur></div>
            </div>
          )}
        </>)}

        {step === 2 && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#0B1424", color: "#F4EFE3" }}>
            <span style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", background: "#C9A44C", color: "#0B1424", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{initiales(nomComplet)}</span>
            <div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{nomComplet}</b><div style={{ fontSize: 12, color: "#A9B3C4" }}>{edition || mode === "existing" ? "Dirigeant existant" : "Nouveau dirigeant"}</div></div>
            {!edition && <button type="button" onClick={() => setStep(1)} style={{ border: "none", background: "transparent", color: "#F3D98C", font: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Modifier</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="ps-grille2">
            <div style={champ}><Label htmlFor="di-imf" requis>Institution</Label><select id="di-imf" className={cls(err2.imf)} value={m.imf} onChange={(e) => setM({ ...m, imf: e.target.value })}><option value="">Choisir…</option>{(r.imfs?.results ?? []).map((i) => <option key={i.id} value={i.id}>{i.nom}{i.sigle ? ` (${i.sigle})` : ""}</option>)}</select><Erreur>{err2.imf}</Erreur></div>
            <div style={champ}><Label htmlFor="di-fct" requis>Fonction</Label><select id="di-fct" className={cls(erreurs.fonction_mandat)} value={m.fonction} onChange={(e) => setM({ ...m, fonction: e.target.value })}>{FONCTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={champ}><Label htmlFor="di-deb" requis>Début du mandat</Label><input id="di-deb" type="date" className={cls(err2.debut)} value={m.debut} onChange={(e) => setM({ ...m, debut: e.target.value })} /><Erreur>{err2.debut}</Erreur></div>
            <div style={champ}><Label htmlFor="di-fin">Fin du mandat</Label><input id="di-fin" type="date" className={cls(err2.fin)} value={m.fin} onChange={(e) => setM({ ...m, fin: e.target.value })} />{err2.fin ? <Erreur>{err2.fin}</Erreur> : <span className="fi-help">Doit être postérieure au début. Laisser vide si indéterminée.</span>}</div>
          </div>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="fi-label" style={{ marginBottom: 8 }}>Statut du mandat</legend>
            <div role="radiogroup" style={{ display: "flex", padding: 4, borderRadius: 12, background: "#F6F1E4", gap: 2 }}>
              {STATUTS.map(([k, l, c]) => <button key={k} type="button" role="radio" aria-checked={m.statut === k} onClick={() => setM({ ...m, statut: k })} style={seg(m.statut === k)}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l}</button>)}
            </div>
          </fieldset>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="fi-label">Document justificatif</span>
            <FileDrop id="di-file" accept=".pdf,.jpg,.jpeg,.png" titre="Déposez le PV, la décision, l'arrêté ou la lettre" formats="PDF, JPG ou PNG" fichier={fichier} onFichier={setFichier} />
            {!fichier && mandat?.fichier_justificatif && <span className="fi-help">Fichier actuel : <a href={mandat.fichier_justificatif} target="_blank" rel="noreferrer">{nomFichier(mandat.fichier_justificatif)}</a></span>}
            <Erreur>{err2.fichier}</Erreur>
            {!avecLien
              ? <span className="fi-help">Ou collez un lien vers un document externe : <a href="#" onClick={(e) => { e.preventDefault(); setAvecLien(true); }}>ajouter un lien</a></span>
              : <><input className={cls(err2.lien)} type="url" placeholder="https://…" value={m.lien} onChange={(e) => setM({ ...m, lien: e.target.value })} aria-label="Lien vers un document externe" /><Erreur>{err2.lien}</Erreur></>}
          </div>
          <Erreur>{erreurs.__global}</Erreur>
        </>)}
      </form>
    </Modal>
  );
}
