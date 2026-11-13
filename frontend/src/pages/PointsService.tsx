/**
 * Écran 09 — Points de service : liste + tiroir de création / édition
 * (maquette-carto-imf/ecrans/09-points-de-service.dc.html).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, qs } from "../api/client";
import type { Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Drawer, EMAIL_OK, Erreur, Label, Toast, btnPrimaire, btnSecondaire, erreursChamps } from "../components/form";
import { AppLayout } from "../components/layout/AppLayout";
import { dansLeSenegal } from "../data/projection";
import { montantCourt, nombre } from "../lib/format";
import { SB, STATUT_POINT, TYPE_POINT, regionAffichee } from "../lib/metier";
import { nombreFr, regionProche } from "../lib/region";
import { useDonnees, type Compte } from "../lib/useDonnees";
import { COULEUR_TYPE_POINT } from "../styles/tokens";

interface Ligne { id: string; nom: string; imf_nom: string; type_point: string; statut_point: string; region_nom: string | null; commune_nom: string | null; nombre_membres: number | null; encours: string }
interface Detail { imf: string; nom: string; type_point: string; statut_point: string; statut_reglementaire: string; adresse: string; localisation: { coordinates: [number, number] } | null; region: string | null; departement: string | null; commune: string | null; telephone: string; email: string; date_ouverture: string | null; nombre_membres: number | null; encours: string; depots: string | null }
interface Zone { id: string; nom: string; parent: string | null }

const TAILLE = 20;
const TYPES = Object.entries(TYPE_POINT);
const STATUTS = Object.entries(STATUT_POINT);
const REGL: [string, string][] = [["EN_COURS", "En cours d'agrément"], ["AGREE", "Agréé"], ["RADIE", "Radié"]];
const VIDE = { imf: "", nom: "", type: "AGENCE", statut: "OUVERT", regl: "EN_COURS", adresse: "", lat: "", lon: "", region: "", departement: "", commune: "", tel: "", email: "", date: "", membres: "", encours: "", depots: "" };
const champ: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const pageBtn = (on = false): CSSProperties => ({ width: 36, height: 36, borderRadius: 10, font: "inherit", cursor: "pointer", ...(on ? { border: "none", background: "#0B1424", color: "#F3D98C", fontWeight: 800 } : { border: "1px solid #ECE5D5", background: "#FFFFFF", color: "#0B1424", fontWeight: 700 }) });

export function PointsService() {
  // Diagramme : ajouter = ADMIN, modifier = SUPERVISEUR/ADMIN, consulter = tous les rôles.
  const { estAdmin, peutModifier } = useAuth();
  const [params, setParams] = useSearchParams();
  const sansGps = params.get("sans_gps") === "true";
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [tiroir, setTiroir] = useState<null | { id?: string }>(params.get("nouveau") && estAdmin ? {} : null);
  const [toast, setToast] = useState<string | null>(null);

  const { donnees: d } = useDonnees<{ rows: Page<Ligne>; k0: Compte; k1: Compte; k2: Compte; k3: Compte }>({
    rows: `/points-service/${qs({ page, page_size: TAILLE, ordering: "nom", sans_gps: sansGps ? "true" : "" })}`,
    k0: "/points-service/?type_point=SIEGE&page_size=1", k1: "/points-service/?type_point=AGENCE&page_size=1",
    k2: "/points-service/?type_point=GUICHET&page_size=1", k3: "/points-service/?type_point=BUREAU&page_size=1",
  }, [version]);
  const rows = d.rows?.results ?? [];
  const total = d.rows?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAILLE));
  const kpis = [
    { n: d.k0?.count, label: "Sièges sociaux", color: "#C9A44C" }, { n: d.k1?.count, label: "Agences", color: "#1F4E79" },
    { n: d.k2?.count, label: "Guichets", color: "#B5763A" }, { n: d.k3?.count, label: "Bureaux de représentation", color: "#2E7D6B" },
  ];
  const numeros = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2 || n === 1 || n === pages);

  return (
    <AppLayout active="points" minHeight={1100}>
      <main className="app-main" style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 40px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="ps-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A6A1F" }}>Référentiels</span>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>Points de service</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#4A5568" }}>Sièges, agences, guichets et bureaux de représentation.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/carte/micro" style={{ height: 46, padding: "0 16px", borderRadius: 14, border: "1px solid #ECE5D5", background: "#FFFFFF", fontSize: 14, fontWeight: 700, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, textDecoration: "none", boxSizing: "border-box" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>Voir sur la carte</Link>
            {estAdmin && <button type="button" onClick={() => setTiroir({})} style={{ height: 46, padding: "0 18px", borderRadius: 14, border: "none", background: "#C9A44C", font: "inherit", fontSize: 14, fontWeight: 800, color: "#0B1424", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 10px 24px rgba(201,164,76,.35)" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nouveau point</button>}
          </div>
        </header>

        <section className="ps-up d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap: 12 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ padding: 16, borderRadius: 18, background: "#FFFFFF", border: "1px solid #ECE5D5", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 12, height: 40, flex: "none", borderRadius: 6, background: k.color }} />
              <div><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{nombre(k.n ?? 0)}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>{k.label}</div></div>
            </div>
          ))}
        </section>

        {sansGps && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#4A5568" }}>
            Filtre actif :
            <button type="button" onClick={() => { params.delete("sans_gps"); setParams(params); setPage(1); }} style={{ height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid #0B1424", background: "#0B1424", color: "#F3D98C", font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Sans coordonnées GPS ×</button>
          </div>
        )}

        <section className="ps-up d2" style={{ borderRadius: 24, background: "#FFFFFF", border: "1px solid #ECE5D5", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B7280", background: "#FDFBF6" }}><th style={{ padding: "12px 18px" }}>Point de service</th><th style={{ padding: "12px 8px" }}>IMF</th><th style={{ padding: "12px 8px" }}>Type</th><th style={{ padding: "12px 8px" }}>Localisation</th><th style={{ padding: "12px 8px" }}>Statut</th><th style={{ padding: "12px 8px", textAlign: "right" }}>Membres</th><th style={{ padding: "12px 18px", textAlign: "right" }}>Encours</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const c = SB[r.statut_point === "SUSPENDU" ? "SUSPENDU_POINT" : r.statut_point];
                  const col = COULEUR_TYPE_POINT[r.type_point];
                  return (
                    <tr key={r.id} className="ps-row" onClick={() => peutModifier && setTiroir({ id: r.id })} style={{ borderTop: "1px solid #F6F1E4", cursor: peutModifier ? "pointer" : "default" }} tabIndex={peutModifier ? 0 : undefined} onKeyDown={(e) => peutModifier && e.key === "Enter" && setTiroir({ id: r.id })}>
                      <td style={{ padding: "13px 18px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 10, height: 10, flex: "none", borderRadius: "50%", background: col, boxShadow: `0 0 0 4px ${col}22` }} /><b>{r.nom}</b></div></td>
                      <td style={{ padding: "13px 8px", color: "#4A5568", fontWeight: 600 }}>{r.imf_nom}</td>
                      <td style={{ padding: "13px 8px" }}>{TYPE_POINT[r.type_point]}</td>
                      <td style={{ padding: "13px 8px" }}><div style={{ fontWeight: 600 }}>{r.commune_nom ?? "—"}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{regionAffichee(r.region_nom) ?? "Sans GPS"}</div></td>
                      <td style={{ padding: "13px 8px" }}><span style={{ fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: c[0], color: c[1] }}>{STATUT_POINT[r.statut_point]}</span></td>
                      <td style={{ padding: "13px 8px", textAlign: "right", fontWeight: 700 }}>{r.nombre_membres != null ? nombre(r.nombre_membres) : "—"}</td>
                      <td style={{ padding: "13px 18px", textAlign: "right", fontWeight: 800 }}>{montantCourt(r.encours)}</td>
                    </tr>
                  );
                })}
                {d.rows && rows.length === 0 && <tr><td colSpan={7} style={{ padding: "40px 18px", textAlign: "center", color: "#6B7280" }}>Aucun point de service.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 18px", borderTop: "1px solid #F1ECE0", fontSize: 13, color: "#4A5568" }}>
            <span>{total ? `${(page - 1) * TAILLE + 1}–${(page - 1) * TAILLE + rows.length} sur ${nombre(total)} points` : "0 point"}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" aria-label="Page précédente" disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ ...pageBtn(), fontWeight: 400, color: "#4A5568" }}>‹</button>
              {numeros.map((n) => <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} style={pageBtn(n === page)}>{n}</button>)}
              <button type="button" aria-label="Page suivante" disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ ...pageBtn(), fontWeight: 400, color: "#4A5568" }}>›</button>
            </div>
          </div>
        </section>
      </main>
      {tiroir && (
        <TiroirPoint id={tiroir.id} imfInitiale={params.get("imf") ?? ""} onClose={() => { setTiroir(null); if (params.get("nouveau")) { params.delete("nouveau"); params.delete("imf"); setParams(params); } }}
          onSaved={(msg) => { setTiroir(null); setToast(msg); setVersion((v) => v + 1); setTimeout(() => setToast(null), 3500); }} />
      )}
      {toast && <Toast ton="ok" titre="Point de service enregistré" texte={toast} bas={28} />}
    </AppLayout>
  );
}

function TiroirPoint({ id, imfInitiale, onClose, onSaved }: { id?: string; imfInitiale: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({ ...VIDE, imf: imfInitiale });
  const [modifies, setModifies] = useState<Record<string, boolean>>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const { donnees: r } = useDonnees<{ imfs: Page<{ id: string; nom: string; sigle: string }>; regions: Page<Zone>; depts: Page<Zone>; communes: Page<Zone> }>({
    imfs: "/imf/?page_size=1000",
    regions: "/cartographie/zones/?type_zone=REGION&page_size=1000",
    depts: "/cartographie/zones/?type_zone=DEPARTEMENT&page_size=1000",
    communes: "/cartographie/zones/?type_zone=COMMUNE&page_size=1000",
  });

  useEffect(() => {
    if (!id) return;
    api.get<Detail>(`/points-service/${id}/`).then((p) => {
      const c = p.localisation?.coordinates;
      setF({
        imf: p.imf, nom: p.nom, type: p.type_point, statut: p.statut_point, regl: p.statut_reglementaire, adresse: p.adresse,
        lat: c ? String(Number(c[1].toFixed(5))) : "", lon: c ? String(Number(c[0].toFixed(5))) : "",
        region: p.region ?? "", departement: p.departement ?? "", commune: p.commune ?? "",
        tel: p.telephone, email: p.email, date: p.date_ouverture ?? "", membres: p.nombre_membres != null ? String(p.nombre_membres) : "",
        encours: Number(p.encours) ? String(Number(p.encours)) : "", depots: p.depots != null ? String(Number(p.depots)) : "",
      });
    });
  }, [id]);

  const set = (k: keyof typeof VIDE) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErreurs({}); };
  const setZone = (k: "region" | "departement" | "commune") => (v: string) => { set(k)(v); setModifies((m) => ({ ...m, [k]: true })); };
  const lat = nombreFr(f.lat), lon = nombreFr(f.lon);
  const unSeul = (f.lat === "") !== (f.lon === "");
  const hasGps = f.lat !== "" && f.lon !== "" && !isNaN(lat) && !isNaN(lon);
  const gpsHors = hasGps && !dansLeSenegal(lat, lon);
  const deduite = hasGps && !gpsHors ? regionProche(lat, lon) : "";
  const err = {
    imf: touched && !f.imf ? "L'institution est obligatoire." : erreurs.imf,
    nom: touched && !f.nom.trim() ? "Le nom du point est obligatoire." : erreurs.nom,
    email: !EMAIL_OK(f.email) ? "Adresse email invalide." : erreurs.email,
    gps: unSeul ? "Renseignez la latitude et la longitude." : gpsHors ? "Ces coordonnées sont en dehors du Sénégal (lat. 12,3 à 16,7 ; long. −17,6 à −11,3)." : erreurs.localisation,
  };

  async function enregistrer() {
    setTouched(true);
    if (!f.imf || !f.nom.trim() || err.email || unSeul || gpsHors) return;
    setEnvoi(true);
    const corps: Record<string, unknown> = {
      imf: f.imf, nom: f.nom.trim(), type_point: f.type, statut_point: f.statut, statut_reglementaire: f.regl, adresse: f.adresse.trim(),
      localisation: hasGps ? { type: "Point", coordinates: [lon, lat] } : null,
      telephone: f.tel.trim(), email: f.email.trim(), date_ouverture: f.date || null,
      nombre_membres: f.membres === "" ? null : Number(f.membres), encours: f.encours === "" ? "0" : String(nombreFr(f.encours)),
      depots: f.depots === "" ? null : String(nombreFr(f.depots)),
    };
    // Région / département / commune : envoyés seulement si l'utilisateur les a modifiés (sinon déduits du GPS).
    (["region", "departement", "commune"] as const).forEach((k) => { if (modifies[k]) corps[k] = f[k] || null; });
    try {
      if (id) await api.patch(`/points-service/${id}/`, corps);
      else await api.post("/points-service/", corps);
      onSaved(`« ${f.nom.trim()} » est disponible dans le référentiel.`);
    } catch (e) {
      setErreurs(erreursChamps(e));
    } finally {
      setEnvoi(false);
    }
  }

  const zoneOptions = (liste: Zone[] | undefined, parent: string, libAuto: string): [string, string][] => [["", libAuto], ...(liste ?? []).filter((z) => !parent || !z.parent || z.parent === parent).map((z): [string, string] => [z.id, regionAffichee(z.nom) ?? z.nom])];
  const inputCls = (bad?: string | false) => "fi-input ps-input" + (bad ? " bad" : "");

  return (
    <Drawer surTitre="Points de service" titre={id ? "Modifier le point de service" : "Nouveau point de service"} onClose={onClose}
      pied={<><button type="button" onClick={onClose} style={btnSecondaire}>Annuler</button><button type="button" className="ps-primary" disabled={envoi} onClick={enregistrer} style={btnPrimaire}>Enregistrer le point</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); enregistrer(); }} style={{ flex: 1, overflowY: "auto", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={champ}><Label htmlFor="ps-imf" requis>Institution</Label><select id="ps-imf" className={inputCls(err.imf)} value={f.imf} onChange={(e) => set("imf")(e.target.value)}><option value="">Choisir une institution…</option>{(r.imfs?.results ?? []).map((i) => <option key={i.id} value={i.id}>{i.nom}{i.sigle ? ` (${i.sigle})` : ""}</option>)}</select><Erreur>{err.imf}</Erreur></div>
          <div style={champ}><Label htmlFor="ps-nom" requis>Nom du point</Label><input id="ps-nom" className={inputCls(err.nom)} value={f.nom} onChange={(e) => set("nom")(e.target.value)} placeholder="Ex. Agence de …" /><Erreur>{err.nom}</Erreur></div>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="ps-label" style={{ marginBottom: 8 }}>Type de point <span className="ps-req">*</span></legend>
            <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {TYPES.map(([k, l]) => {
                const on = f.type === k, c = COULEUR_TYPE_POINT[k];
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set("type")(k)} style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 12px", borderRadius: 12, font: "inherit", fontSize: 13, fontWeight: 700, color: "#0B1424", cursor: "pointer", textAlign: "left", ...(on ? { background: "#FDF8EA", border: "1.5px solid #C9A44C" } : { background: "#FFFFFF", border: "1.5px solid #E2DCCD" }) }}>
                    <span style={{ width: 12, height: 12, flex: "none", borderRadius: "50%", background: c, ...(on ? { boxShadow: `0 0 0 4px ${c}33` } : {}) }} />{l}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="ps-grille2">
            <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
              <legend className="ps-label" style={{ marginBottom: 8 }}>Statut du point</legend>
              <div role="radiogroup" style={{ display: "flex", padding: 4, borderRadius: 12, background: "#F6F1E4", gap: 2 }}>
                {STATUTS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.statut === k} onClick={() => set("statut")(k)} style={{ flex: 1, height: 38, border: "none", borderRadius: 9, font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", ...(f.statut === k ? { background: "#FFFFFF", color: "#0B1424", boxShadow: "0 2px 8px rgba(11,20,36,.10)" } : { background: "transparent", color: "#6B7280" }) }}>{l}</button>)}
              </div>
            </fieldset>
            <div style={champ}><Label htmlFor="ps-reg">Statut réglementaire</Label><select id="ps-reg" className={inputCls()} value={f.regl} onChange={(e) => set("regl")(e.target.value)}>{REGL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
        </div>
        <div style={{ height: 1, background: "#F1ECE0" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>Localisation</h3>
          <div style={champ}><Label htmlFor="ps-adr">Adresse</Label><input id="ps-adr" className={inputCls(erreurs.adresse)} value={f.adresse} onChange={(e) => set("adresse")(e.target.value)} placeholder="Rue, quartier" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div style={champ}><Label htmlFor="ps-lat">Latitude</Label><input id="ps-lat" className={inputCls(err.gps)} value={f.lat} onChange={(e) => set("lat")(e.target.value)} inputMode="decimal" placeholder="14.6928" /></div>
            <div style={champ}><Label htmlFor="ps-lon">Longitude</Label><input id="ps-lon" className={inputCls(err.gps)} value={f.lon} onChange={(e) => set("lon")(e.target.value)} inputMode="decimal" placeholder="-17.4467" /></div>
          </div>
          <Erreur>{err.gps}</Erreur>
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#F3ECDC", color: "#5B4A1E", fontSize: 13, lineHeight: 1.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg><span>Région, département et commune sont <b>déduits automatiquement</b> des coordonnées GPS à l'enregistrement. Vous pouvez les corriger.</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="ps-grille3">
            <div style={champ}><Label htmlFor="ps-r">Région</Label><select id="ps-r" className={inputCls(erreurs.region) + (modifies.region ? "" : " auto")} value={f.region} onChange={(e) => setZone("region")(e.target.value)}>{zoneOptions(r.regions?.results, "", deduite ? `${deduite} (déduite)` : "Déduite du GPS").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={champ}><Label htmlFor="ps-d">Département</Label><select id="ps-d" className={inputCls(erreurs.departement) + (modifies.departement ? "" : " auto")} value={f.departement} onChange={(e) => setZone("departement")(e.target.value)}>{zoneOptions(r.depts?.results, f.region, "Déduit du GPS").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div style={champ}><Label htmlFor="ps-c">Commune</Label><select id="ps-c" className={inputCls(erreurs.commune) + (modifies.commune ? "" : " auto")} value={f.commune} onChange={(e) => setZone("commune")(e.target.value)}>{zoneOptions(r.communes?.results, f.departement, "Déduite du GPS").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
        </div>
        <div style={{ height: 1, background: "#F1ECE0" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Contact et ouverture</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="ps-grille2">
            <div style={champ}><Label htmlFor="ps-tel">Téléphone</Label><input id="ps-tel" className={inputCls(erreurs.telephone)} value={f.tel} onChange={(e) => set("tel")(e.target.value)} placeholder="+221 33 000 00 00" inputMode="tel" /></div>
            <div style={champ}><Label htmlFor="ps-mail">Email</Label><input id="ps-mail" type="email" className={inputCls(err.email)} value={f.email} onChange={(e) => set("email")(e.target.value)} placeholder="agence@imf.sn" /><Erreur>{err.email}</Erreur></div>
            <div style={champ}><Label htmlFor="ps-date">Date d'ouverture</Label><input id="ps-date" type="date" className={inputCls(erreurs.date_ouverture)} value={f.date} onChange={(e) => set("date")(e.target.value)} /><Erreur>{erreurs.date_ouverture}</Erreur></div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>Indicateurs <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", background: "#F1ECE0", padding: "3px 8px", borderRadius: 999 }}>Optionnel</span></h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="ps-grille3">
            <div style={champ}><Label htmlFor="ps-mb">Membres</Label><input id="ps-mb" className={inputCls(erreurs.nombre_membres)} value={f.membres} onChange={(e) => set("membres")(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" /><Erreur>{erreurs.nombre_membres}</Erreur></div>
            <div style={champ}><Label htmlFor="ps-enc">Encours</Label><div className="ps-unit"><input id="ps-enc" className={inputCls(erreurs.encours)} value={f.encours} onChange={(e) => set("encours")(e.target.value)} inputMode="decimal" placeholder="0" /><span>FCFA</span></div><Erreur>{erreurs.encours}</Erreur></div>
            <div style={champ}><Label htmlFor="ps-dep">Dépôts</Label><div className="ps-unit"><input id="ps-dep" className={inputCls(erreurs.depots)} value={f.depots} onChange={(e) => set("depots")(e.target.value)} inputMode="decimal" placeholder="0" /><span>FCFA</span></div><Erreur>{erreurs.depots}</Erreur></div>
          </div>
        </div>
        <Erreur>{erreurs.__global}</Erreur>
      </form>
    </Drawer>
  );
}
