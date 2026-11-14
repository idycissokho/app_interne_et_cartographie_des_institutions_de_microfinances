/**
 * Écran 08 — Formulaire IMF, création et modification (maquette-carto-imf/ecrans/08-formulaire-imf.dc.html).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { Page } from "../api/types";
import { SenegalMap } from "../components/carto/SenegalMap";
import { ChoiceCards, EMAIL_OK, EnteteSection, Erreur, Segmented, TextField, Toast, ToggleChips, erreursChamps } from "../components/form";
import { useAuth } from "../auth/AuthContext";
import { AppLayout } from "../components/layout/AppLayout";
import { dansLeSenegal, projeter } from "../data/projection";
import { nombreFr, regionProche } from "../lib/region";

const TY = [
  { value: "MUTUELLE", label: "Mutuelle", desc: "Mutuelle d'épargne et de crédit", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
  { value: "COOPERATIVE", label: "Coopérative", desc: "Coopérative financière", icon: "M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" },
  { value: "SA", label: "Société Anonyme", desc: "Société de capitaux", icon: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" },
  { value: "ASSOCIATION", label: "Association", desc: "Association de microfinance", icon: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" },
];
const ST = [{ value: "AGREE", label: "Agréée", color: "#15803D" }, { value: "EN_COURS", label: "En cours d'agrément", color: "#D97706" }, { value: "RADIEE", label: "Radiée", color: "#B91C1C" }];
const SECT: [string, string][] = [["identite", "Identité"], ["statut", "Statut"], ["siege", "Siège & GPS"], ["contacts", "Contacts"], ["bailleurs", "Bailleurs"]];
const VIDE = { nom: "", sigle: "", type: "MUTUELLE", statut: "EN_COURS", adresse: "", lat: "", lon: "", tel: "", email: "", web: "", bailleurs: [] as string[] };
const carte: CSSProperties = { borderRadius: 22, background: "#FFFFFF", border: "1px solid #ECE5D5", padding: 24, display: "flex", flexDirection: "column" };

interface ImfApi { nom: string; sigle: string; type_imf: string; statut_reglementaire: string; adresse_siege: string; localisation_siege: { coordinates: [number, number] } | null; telephone: string; email: string; site_web: string; bailleurs: string[] }

export function FormulaireIMF() {
  // Diagramme : « ajouter un point de service » est réservé à l'ADMIN.
  const { estAdmin } = useAuth();
  const { id } = useParams();
  const naviguer = useNavigate();
  const [f, setF] = useState(VIDE);
  const [touched, setTouched] = useState(false);
  const [toast, setToast] = useState<null | "ok" | "next" | "ko">(null);
  const [erreursApi, setErreursApi] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [bailleurs, setBailleurs] = useState<[string, string][]>([]);

  useEffect(() => {
    api.get<Page<{ id: string; nom: string; sigle: string }>>("/imf/bailleurs/?page_size=1000").then((p) => setBailleurs(p.results.map((b) => [b.id, b.sigle || b.nom]))).catch(() => {});
    if (!id) return;
    api.get<ImfApi>(`/imf/${id}/`).then((d) => {
      const c = d.localisation_siege?.coordinates;
      setF({
        nom: d.nom, sigle: d.sigle, type: d.type_imf, statut: d.statut_reglementaire, adresse: d.adresse_siege,
        lat: c ? String(Number(c[1].toFixed(5))) : "", lon: c ? String(Number(c[0].toFixed(5))) : "",
        tel: d.telephone.replace(/^\+221\s*/, ""), email: d.email, web: d.site_web.replace(/^https?:\/\//, ""), bailleurs: d.bailleurs,
      });
    });
  }, [id]);

  const upd = (k: keyof typeof VIDE) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setToast(null); setErreursApi({}); };
  const lat = nombreFr(f.lat), lon = nombreFr(f.lon);
  const hasGps = f.lat !== "" && f.lon !== "" && !isNaN(lat) && !isNaN(lon);
  const inSn = hasGps && dansLeSenegal(lat, lon);
  const region = inSn ? regionProche(lat, lon) : "";
  const emailBad = !EMAIL_OK(f.email);
  const err = { nom: touched && !f.nom.trim(), adresse: touched && !f.adresse.trim(), email: emailBad, gps: hasGps && !inSn };
  const done: Record<string, boolean> = {
    identite: !!f.nom.trim() && !!f.type, statut: !!f.statut, siege: !!f.adresse.trim() && inSn,
    contacts: !!(f.tel || f.email) && !emailBad, bailleurs: f.bailleurs.length > 0,
  };
  const nDone = Object.values(done).filter(Boolean).length;
  const circ = 2 * Math.PI * 16;
  const canSave = !err.email && !err.gps && f.nom.trim() && f.adresse.trim();

  async function enregistrer(ensuite: boolean) {
    setTouched(true);
    if (!canSave) { setToast("ko"); return; }
    setEnvoi(true);
    const corps = {
      nom: f.nom.trim(), sigle: f.sigle.trim(), type_imf: f.type, statut_reglementaire: f.statut, adresse_siege: f.adresse.trim(),
      localisation_siege: inSn ? { type: "Point", coordinates: [lon, lat] } : null,
      telephone: f.tel.trim() ? `+221 ${f.tel.trim()}` : "", email: f.email.trim(),
      site_web: f.web.trim() ? (/^https?:\/\//.test(f.web.trim()) ? f.web.trim() : `https://${f.web.trim()}`) : "",
      bailleurs: f.bailleurs,
    };
    try {
      const res = id ? await api.patch<{ id: string }>(`/imf/${id}/`, corps) : await api.post<{ id: string }>("/imf/", corps);
      setToast(ensuite ? "next" : "ok");
      setTimeout(() => naviguer(ensuite ? `/points-service?nouveau=1&imf=${res.id}` : "/imf"), 1400);
    } catch (e) {
      setErreursApi(erreursChamps(e));
      setToast("ko");
    } finally {
      setEnvoi(false);
    }
  }

  const titre = id ? "Modifier l'institution" : "Nouvelle institution";
  return (
    <AppLayout active="imf" minHeight={1100}>
      <main className="app-main fi-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 0 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22 }}>
        <header className="fi-up" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <nav aria-label="Fil d'Ariane" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#6B7280" }}><Link to="/imf" style={{ fontWeight: 700, textDecoration: "none" }}>Institutions</Link><span>›</span><span style={{ color: "#0B1424", fontWeight: 600 }}>{titre}</span></nav>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div><h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>{titre}</h1><p style={{ margin: "6px 0 0 0", fontSize: 14, color: "#4A5568" }}>Renseignez l'identité, le statut et le siège de l'IMF. Vous pourrez ensuite ajouter ses points de service et ses dirigeants.</p></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, background: "#FFFFFF", border: "1px solid #ECE5D5" }}>
              <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="#F1ECE0" strokeWidth="5" /><circle cx="20" cy="20" r="16" fill="none" stroke="#C9A44C" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${((circ * nDone) / 5).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 20 20)" style={{ transition: "stroke-dasharray .4s ease" }} /></svg>
              <div><div style={{ fontSize: 18, fontWeight: 800 }}>{Math.round((100 * nDone) / 5)} %</div><div style={{ fontSize: 12, color: "#6B7280" }}>de la fiche complétée</div></div>
            </div>
          </div>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
          <nav aria-label="Sections du formulaire" className="fi-up d1 fi-sommaire" style={{ flex: "1 1 220px", maxWidth: 250, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: 10, borderRadius: 20, background: "#FFFFFF", border: "1px solid #ECE5D5", position: "sticky", top: 20 }}>
            {SECT.map(([k, l]) => (
              <a key={k} className="fi-nav" href={`#${k}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, textDecoration: "none", color: "#0B1424" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, ...(done[k] ? { background: "#15803D", color: "#FFFFFF" } : { border: "2px solid #D3C9B2", boxSizing: "border-box" }) }}>{done[k] ? "✓" : ""}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{l}</span>
              </a>
            ))}
          </nav>

          <form onSubmit={(e) => { e.preventDefault(); enregistrer(false); }} style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            <section id="identite" className="fi-up d1" style={{ ...carte, gap: 20 }}>
              <EnteteSection n={1} titre="Identité" sousTitre="Comment l'institution est désignée officiellement." />
              <div className="fi-grille-id" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 16 }}>
                <TextField id="fi-nom" label="Dénomination sociale" requis value={f.nom} onChange={upd("nom")} placeholder="Ex. Mutuelle d'épargne et de crédit de …" style={{ gridColumn: "span 2" }}
                  erreur={err.nom ? "La dénomination sociale est obligatoire." : erreursApi.nom} />
                <TextField id="fi-sigle" label="Sigle" value={f.sigle} onChange={upd("sigle")} placeholder="Ex. MEC-XX" maxLength={50} aide="50 caractères maximum. Affiché sur la carte et dans les listes." erreur={erreursApi.sigle} />
              </div>
              <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <legend className="fi-label" style={{ marginBottom: 10 }}>Type d'IMF <span className="fi-req">*</span></legend>
                <ChoiceCards options={TY} value={f.type} onChange={(v) => setF({ ...f, type: v })} />
              </fieldset>
            </section>

            <section id="statut" className="fi-up d2" style={{ ...carte, gap: 18 }}>
              <EnteteSection n={2} titre={<>Statut réglementaire <span className="fi-req">*</span></>} sousTitre="Situation de l'institution vis-à-vis de l'agrément." />
              <Segmented label="Statut réglementaire" options={ST} value={f.statut} onChange={(v) => setF({ ...f, statut: v })} />
              {f.statut === "RADIEE" && <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#FDECEC", color: "#991B1B", fontSize: 13, lineHeight: 1.5 }}><span><b>Attention :</b> une IMF radiée n'apparaît plus sur les cartes publiques. Ses points de service restent consultables dans l'historique.</span></div>}
            </section>

            <section id="siege" className="fi-up d3" style={{ ...carte, gap: 18 }}>
              <EnteteSection n={3} titre="Siège et localisation" sousTitre="L'adresse et la position GPS du siège social." />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                  <TextField id="fi-adr" label="Adresse du siège" requis multiline value={f.adresse} onChange={upd("adresse")} placeholder="Rue, quartier, ville" erreur={err.adresse ? "L'adresse du siège est obligatoire." : erreursApi.adresse_siege} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    <TextField id="fi-lat" label="Latitude" inputMode="decimal" value={f.lat} onChange={upd("lat")} placeholder="14.6928" erreur={err.gps ? " " : null} />
                    <TextField id="fi-lon" label="Longitude" inputMode="decimal" value={f.lon} onChange={upd("lon")} placeholder="-17.4467" erreur={err.gps ? " " : null} />
                  </div>
                  {err.gps && <Erreur>Ces coordonnées sont en dehors du Sénégal (lat. 12,3 à 16,7 ; long. −17,6 à −11,3).</Erreur>}
                  <Erreur>{erreursApi.localisation_siege}</Erreur>
                  {inSn && <span className="fi-help" style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "#15803D", fontWeight: 800 }}>✓</span><span>Position située en région de <b style={{ color: "#0B1424" }}>{region}</b> (déduite des coordonnées).</span></span>}
                  <button type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(5), lon: p.coords.longitude.toFixed(5) })))} style={{ alignSelf: "flex-start", height: 40, padding: "0 14px", borderRadius: 11, border: "1px dashed #C9A44C", background: "#FDFBF6", font: "inherit", fontSize: 13, fontWeight: 700, color: "#6E5416", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>Utiliser ma position actuelle</button>
                </div>
                <div style={{ flex: "1 1 300px", minWidth: 0, height: 300, borderRadius: 18, border: "1px solid #ECE5D5", boxSizing: "border-box", position: "relative", overflow: "hidden" }}>
                  <SenegalMap theme="light" fillMode="muted" flow={false} showLabels zoomSelection rayon={17} selected={region} selectedPoint={inSn ? { ...projeter(lon, lat), lon, lat } : null} />
                  <span style={{ position: "absolute", left: 12, top: 10, zIndex: 3, fontSize: 11, fontWeight: 700, color: "#4A5568", background: "rgba(255,255,255,.92)", padding: "4px 8px", borderRadius: 8, pointerEvents: "none" }}>Aperçu de la position</span>
                </div>
              </div>
            </section>

            <section id="contacts" className="fi-up d4" style={{ ...carte, gap: 18 }}>
              <EnteteSection n={4} titre="Contacts" sousTitre="Coordonnées générales de l'institution." />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 16 }}>
                <TextField id="fi-tel" label="Téléphone" addon="+221" inputMode="tel" value={f.tel} onChange={upd("tel")} placeholder="33 800 00 00" erreur={erreursApi.telephone} />
                <TextField id="fi-mail" label="Email" type="email" value={f.email} onChange={upd("email")} placeholder="contact@imf.sn" erreur={emailBad ? "Adresse email invalide." : erreursApi.email} />
                <TextField id="fi-web" label="Site web" addon="https://" value={f.web} onChange={upd("web")} placeholder="www.imf.sn" erreur={erreursApi.site_web} />
              </div>
            </section>

            <section id="bailleurs" className="fi-up d5" style={{ ...carte, gap: 16 }}>
              <EnteteSection n={5} titre="Bailleurs associés" extra={<span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", background: "#F1ECE0", padding: "3px 8px", borderRadius: 999, marginLeft: 6 }}>Optionnel</span>} sousTitre="Sélectionnez les partenaires qui financent ou accompagnent l'IMF." />
              <ToggleChips options={bailleurs} valeurs={f.bailleurs} onToggle={(b) => setF({ ...f, bailleurs: f.bailleurs.includes(b) ? f.bailleurs.filter((x) => x !== b) : [...f.bailleurs, b] })} />
              {bailleurs.length === 0 && <span className="fi-help">Aucun bailleur dans le référentiel.</span>}
              <Erreur>{erreursApi.bailleurs}</Erreur>
            </section>

            <Erreur>{erreursApi.__global}</Erreur>
            <div className="fi-barre" style={{ position: "sticky", bottom: 0, zIndex: 5, margin: "6px -32px 0 -32px", padding: "16px 32px", background: "rgba(250,247,240,.92)", backdropFilter: "blur(10px)", borderTop: "1px solid #ECE5D5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}><span className="fi-req">*</span> Champs obligatoires</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="fi-ghost" to="/imf" style={{ height: 48, padding: "0 18px", borderRadius: 14, fontSize: 14, fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", textDecoration: "none" }}>Annuler</Link>
                {estAdmin && <button type="button" disabled={envoi} onClick={() => enregistrer(true)} style={{ height: 48, padding: "0 18px", borderRadius: 14, border: "1.5px solid #0B1424", background: "#FFFFFF", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", cursor: "pointer" }}>Enregistrer et ajouter un point</button>}
                <button type="submit" className="fi-primary" disabled={envoi} style={{ height: 48, padding: "0 22px", borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 10px 24px rgba(201,164,76,.35)" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>Enregistrer l'institution</button>
              </div>
            </div>
          </form>
        </div>
      </main>
      {toast && (
        <Toast ton={toast === "ko" ? "ko" : "ok"} titre={toast === "ko" ? "Fiche incomplète" : "Institution enregistrée"}
          texte={toast === "ko" ? "Corrigez les champs signalés en rouge avant d’enregistrer." : toast === "next" ? "Redirection vers l’ajout d’un point de service…" : "La fiche est disponible dans le référentiel."} />
      )}
    </AppLayout>
  );
}
