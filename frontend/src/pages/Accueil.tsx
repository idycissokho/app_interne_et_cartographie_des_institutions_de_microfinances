/**
 * Accueil public — première page de la plateforme, sans connexion.
 * Le registre officiel des institutions de microfinance : recherche par numéro d'agrément, nom ou
 * sigle ; carte des sièges ; liste par région ; « extrait du registre » d'une institution.
 * Le registre complet (quelques centaines de lignes) est chargé une fois : recherche et filtres
 * sont instantanés. Données exposées : backend/apps/imf/views_public.py (ni dirigeants, ni
 * chiffres financiers, ni contacts).
 *
 * Liste de suggestions : ouverte pendant la saisie ou au focus, fermée au choix d'une institution,
 * par Échap ou par un clic en dehors (elle ne masque jamais l'extrait).
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import logo from "../assets/logo-drs-sfd.png";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CarteRegistre, type PointRegistre } from "../components/accueil/CarteRegistre";
import { SenegalMap } from "../components/carto/SenegalMap";
import { Badge, CadreTableau, EnTete, EtatVide, Pagination, TON_STATUT, Tableau } from "../components/tableau/Tableau";
import { dansLeSenegal, projeter } from "../data/projection";
import { cleRegion, SENEGAL_REGIONS } from "../data/senegalRegions";
import { regionAffichee } from "../lib/metier";
import { pluriel } from "../lib/format";

interface Institution {
  id: string;
  nom: string;
  sigle: string;
  numero_agrement: string;
  statut: string;
  statut_libelle: string;
  type: string;
  forme_juridique: string;
  region: string;
  departement: string;
  localite: string;
  annee_creation: number | null;
  telephone: string;
  position: [number, number] | null;
}

const PAR_PAGE = 12;
const SUGGESTIONS = 6;
const nombre = (n: number) => n.toLocaleString("fr-FR");
/** Comparaison tolérante : sans accents ni casse ; « compact » ignore aussi espaces et tirets. */
const plat = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const compact = (t: string) => plat(t).replace(/[^A-Z0-9]/g, "");

/**
 * Numéros du siège, tels que saisis dans la liste officielle (« 338696965 », « 33 829 20 20 / 77 503 06 06 »,
 * « +221 33 849 02 48 ») : un numéro par entrée, chiffres groupés à la sénégalaise, lien d'appel.
 */
function telephones(texte: string) {
  return texte.split(/[/;,]|\bet\b/).map((t) => t.trim()).filter(Boolean).map((brut) => {
    let chiffres = brut.replace(/\D/g, "");
    if (chiffres.length === 12 && chiffres.startsWith("221")) chiffres = chiffres.slice(3);
    if (chiffres.length !== 9) return { texte: brut, lien: null };
    return { texte: chiffres.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4"), lien: `tel:+221${chiffres}` };
  });
}

/** Position du siège dans le Sénégal (hors valeur par défaut de l'import), sinon null. */
function lonLat(f: Institution): [number, number] | null {
  if (!f.position) return null;
  const [lon, lat] = f.position;
  if (!dansLeSenegal(lat, lon) || (Math.abs(lat - 14.75) < 1e-4 && Math.abs(lon + 17.33333) < 1e-4)) return null;
  return [lon, lat];
}

/** Pertinence d'une institution pour la recherche (plus petit = meilleur ; null = sans rapport). */
function score(f: Institution, q: string, qc: string): number | null {
  const agr = compact(f.numero_agrement);
  if (qc.length >= 4 && agr === qc) return 0;
  if (qc && agr.startsWith(qc)) return 1;
  const nom = plat(f.nom), sigle = plat(f.sigle);
  if (sigle && sigle.startsWith(q)) return 1.5;
  if (nom.startsWith(q) || nom.includes(` ${q}`)) return 2;
  if (nom.includes(q) || sigle.includes(q)) return 3;
  if (qc.length >= 2 && agr.includes(qc)) return 4;
  return null;
}

function Surligne({ texte, q }: { texte: string; q: string }) {
  const i = q.length >= 2 ? plat(texte).indexOf(q) : -1;
  if (i < 0) return <>{texte}</>;
  return <>{texte.slice(0, i)}<mark>{texte.slice(i, i + q.length)}</mark>{texte.slice(i + q.length)}</>;
}

const Icone = ({ children, taille = 18 }: { children: ReactNode; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export function Accueil() {
  const { utilisateur } = useAuth();
  const [params, setParams] = useSearchParams();
  const [registre, setRegistre] = useState<Institution[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Champ toujours vide au chargement (seul le texte d'exemple s'affiche), même avec ?q= dans l'adresse.
  const [saisie, setSaisie] = useState("");
  const [ouverte, setOuverte] = useState(false);
  const [actif, setActif] = useState(0);
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(1);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLFormElement>(null);
  const idListe = useId();

  useEffect(() => {
    api.get<{ institutions: Institution[] }>("/public/registre/")
      .then((r) => {
        setRegistre(r.institutions);
        // Lien partagé (?q=numéro d'agrément) : l'extrait s'ouvre directement.
        const q = compact(params.get("q") ?? "");
        const trouvee = q ? r.institutions.find((f) => compact(f.numero_agrement) === q) : undefined;
        if (trouvee) setFicheId(trouvee.id);
      })
      .catch((e: Error) => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // « / » place le curseur dans la recherche.
  useEffect(() => {
    const surTouche = (e: globalThis.KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(cible.tagName)) { e.preventDefault(); champ.current?.focus(); }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, []);

  // Clic en dehors de la recherche : les suggestions se ferment.
  useEffect(() => {
    if (!ouverte) return;
    const surClic = (e: PointerEvent) => { if (!zone.current?.contains(e.target as Node)) setOuverte(false); };
    document.addEventListener("pointerdown", surClic);
    return () => document.removeEventListener("pointerdown", surClic);
  }, [ouverte]);

  const q = plat(saisie.trim());
  const qc = compact(saisie);
  const recherche = q.length >= 2;

  const resultats = useMemo(() => {
    if (!registre || !recherche) return null;
    return registre
      .map((f) => ({ f, s: score(f, q, qc) }))
      .filter((r): r is { f: Institution; s: number } => r.s !== null)
      .sort((a, b) => a.s - b.s || a.f.nom.localeCompare(b.f.nom, "fr"))
      .map((r) => r.f);
  }, [registre, recherche, q, qc]);

  const comptes = useMemo(() => {
    const c: Record<string, number> = {};
    (registre ?? []).forEach((f) => { const k = cleRegion(f.region || ""); if (k) c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [registre]);
  const regionsTriees = useMemo(() => Object.entries(comptes).sort((a, b) => b[1] - a[1]), [comptes]);
  const maxRegion = regionsTriees[0]?.[1] ?? 1;

  const points = useMemo<PointRegistre[]>(() => (registre ?? []).flatMap((f) => {
    const ll = lonLat(f);
    if (!ll) return [];
    const { x, y } = projeter(ll[0], ll[1]);
    return [{ id: f.id, x, y, nom: f.nom, agrement: f.numero_agrement, statut: f.statut, region: f.region }];
  }), [registre]);

  const correspondances = useMemo(() => (resultats ? new Set(resultats.map((f) => f.id)) : null), [resultats]);
  const liste = useMemo(() => (resultats ?? registre ?? []).filter((f) => !region || cleRegion(f.region || "") === region), [resultats, registre, region]);
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  useEffect(() => setPage(1), [q, region]);

  const fiche = registre?.find((f) => f.id === ficheId) ?? null;
  const suggestions = (resultats ?? []).slice(0, SUGGESTIONS);
  const suggestionsVisibles = ouverte && recherche && registre !== null;
  const enActivite = registre?.filter((f) => f.statut === "EN_ACTIVITE").length ?? 0;
  const nomRegion = (cle: string) => SENEGAL_REGIONS.find((r) => cleRegion(r.id) === cle)?.id ?? cle;

  function ouvrir(f: Institution) {
    setFicheId(f.id);
    setOuverte(false);
    setParams(f.numero_agrement ? { q: f.numero_agrement } : {}, { replace: true });
    champ.current?.blur();
    requestAnimationFrame(() => document.getElementById("rg-extrait")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function ouvrirParId(id: string) {
    const f = registre?.find((i) => i.id === id);
    if (f) ouvrir(f);
  }
  function fermer() {
    setFicheId(null);
    setParams({}, { replace: true });
  }
  function voirRegistre() {
    setOuverte(false);
    document.getElementById("rg-registre")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (resultats?.length === 1) ouvrir(resultats[0]!);
    else voirRegistre(); // plusieurs réponses (ou aucune) : on les montre dans le registre
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOuverte(false); return; }
    const n = suggestions.length;
    if (!n) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOuverte(true); setActif((a) => (a + 1) % n); }
    if (e.key === "ArrowUp") { e.preventDefault(); setOuverte(true); setActif((a) => (a - 1 + n) % n); }
    if (e.key === "Enter" && suggestionsVisibles && suggestions[actif]) { e.preventDefault(); ouvrir(suggestions[actif]!); }
  }

  async function copierLien() {
    if (!fiche) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/?q=${encodeURIComponent(fiche.numero_agrement)}`);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch { /* presse-papiers indisponible (page non sécurisée) */ }
  }

  const ll = fiche ? lonLat(fiche) : null;
  const pointFiche = ll ? { ...projeter(ll[0], ll[1]), lon: ll[0], lat: ll[1] } : null;
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="rg-page">
      <header className="rg-entete">
        <div className="rg-largeur rg-entete-in">
          <Link to="/" className="rg-marque" aria-label="Accueil — Direction de la Réglementation et de la Supervision des SFD"><img src={logo} alt="" /></Link>
          <nav className="rg-entete-nav" aria-label="Accès">
            <span className="rg-entete-mention">Réseau interne · Ministère des Finances et du Budget</span>
            {utilisateur
              ? <Link to="/tableau-de-bord" className="rg-acces">Ouvrir l'application <span aria-hidden="true">→</span></Link>
              : <Link to="/connexion" className="rg-acces">Espace agents <span aria-hidden="true">→</span></Link>}
          </nav>
        </div>
      </header>

      <main>
        <section className="rg-largeur rg-tete" aria-labelledby="rg-titre">
          <div className="rg-tete-texte">
            <p className="rg-surtitre">Registre officiel · DRS-SFD</p>
            <h1 id="rg-titre">Les institutions de microfinance <em>agréées</em> au Sénégal</h1>
            <p className="rg-intro">Vérifiez le statut d'une institution à partir de son numéro d'agrément, et situez son siège.</p>

            <form ref={zone} className="rg-recherche" role="search" onSubmit={onSubmit}>
              <label htmlFor="rg-q">Numéro d'agrément, dénomination ou sigle</label>
              <div className="rg-champ">
                <Icone taille={20}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icone>
                <input id="rg-q" ref={champ} type="text" autoComplete="off" spellCheck={false} enterKeyHint="search"
                  placeholder="Ex. DK1-93-00008"
                  value={saisie}
                  onChange={(e) => { setSaisie(e.target.value); setOuverte(true); setActif(0); }}
                  onFocus={() => setOuverte(true)}
                  onKeyDown={onKeyDown}
                  role="combobox" aria-expanded={suggestionsVisibles && suggestions.length > 0} aria-controls={idListe} aria-autocomplete="list"
                  aria-activedescendant={suggestionsVisibles && suggestions.length ? `${idListe}-${actif}` : undefined} />
                {saisie
                  ? <button type="button" className="rg-effacer" aria-label="Effacer" onClick={() => { setSaisie(""); setOuverte(false); champ.current?.focus(); }}><Icone taille={16}><path d="M18 6 6 18M6 6l12 12" /></Icone></button>
                  : <kbd aria-hidden="true" title="Raccourci clavier">/</kbd>}
                <button type="submit" className="rg-verifier">Vérifier</button>
              </div>

              {suggestionsVisibles && (
                <div className="rg-suggestions">
                  {suggestions.length ? (
                    <ul id={idListe} role="listbox" aria-label="Institutions">
                      {suggestions.map((f, i) => (
                        <li key={f.id} id={`${idListe}-${i}`} role="option" aria-selected={i === actif} className={i === actif ? "actif" : undefined}
                          onMouseEnter={() => setActif(i)} onMouseDown={(e) => { e.preventDefault(); ouvrir(f); }}>
                          <span className="rg-agr"><Surligne texte={f.numero_agrement || "—"} q={q} /></span>
                          <span className="rg-sugg-nom"><Surligne texte={f.nom} q={q} />{f.sigle && f.sigle !== f.nom && <small><Surligne texte={f.sigle} q={q} /></small>}</span>
                          <span className={`rg-statut s-${f.statut}`}>{f.statut_libelle}</span>
                        </li>
                      ))}
                      {(resultats?.length ?? 0) > SUGGESTIONS && (
                        <li className="rg-sugg-tout" onMouseDown={(e) => { e.preventDefault(); voirRegistre(); }}>
                          Voir les {resultats!.length} résultats dans le registre <span aria-hidden="true">↓</span>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="rg-sugg-vide"><strong>Aucune institution ne correspond à « {saisie.trim()} ».</strong> Vérifiez le numéro (lettres, chiffres, tirets) ou essayez la dénomination.</p>
                  )}
                </div>
              )}
            </form>

            <p className="rg-aide">Le numéro figure sur les documents officiels de l'institution ; tirets et espaces sont facultatifs.</p>

            {registre && (
              <dl className="rg-chiffres">
                <div><dt>Institutions</dt><dd>{nombre(registre.length)}</dd></div>
                <div><dt>En activité</dt><dd>{nombre(enActivite)}</dd></div>
                <div><dt>Régions</dt><dd>{regionsTriees.length}</dd></div>
              </dl>
            )}
            {erreur && <p className="rg-erreur" role="alert">Le registre n'a pas pu être chargé : {erreur}</p>}
          </div>

          <div className="rg-tete-carte">
            <CarteRegistre points={points} comptes={comptes} region={region} onRegion={setRegion}
              selection={ficheId} onSelection={ouvrirParId} correspondances={correspondances} />
            <ul className="rg-legende" aria-label="Légende">
              <li><span className="rg-pastille s-EN_ACTIVITE" />En activité</li>
              <li><span className="rg-pastille s-OPR" />OPR</li>
              <li><span className="rg-pastille s-RETRAIT_AGREMENT" />Retrait d'agrément</li>
              <li className="rg-legende-note">Un point par siège · une région se filtre d'un clic</li>
            </ul>
          </div>
        </section>

        {fiche && (
          <section id="rg-extrait" className="rg-largeur rg-extrait" aria-labelledby="rg-extrait-titre">
            <div className="rg-extrait-bandeau">
              <span>Extrait du registre des institutions de microfinance</span>
              <span>Consulté le {aujourdhui}</span>
              <button type="button" onClick={fermer} aria-label="Fermer l'extrait"><Icone taille={18}><path d="M18 6 6 18M6 6l12 12" /></Icone></button>
            </div>
            <div className="rg-extrait-corps">
              <div className="rg-extrait-infos">
                <p className={`rg-etat s-${fiche.statut}`}>
                  <span className="rg-etat-icone" aria-hidden="true">
                    {fiche.statut === "EN_ACTIVITE"
                      ? <Icone taille={14}><path d="m5 12 5 5L20 7" /></Icone>
                      : fiche.statut === "RETRAIT_AGREMENT" ? <Icone taille={14}><path d="M18 6 6 18M6 6l12 12" /></Icone> : <Icone taille={14}><path d="M12 7v6M12 17h.01" /></Icone>}
                  </span>
                  <strong>{fiche.statut_libelle}</strong>
                  <span className="rg-etat-texte">
                    {fiche.statut === "EN_ACTIVITE" && "Institution agréée, autorisée à exercer"}
                    {fiche.statut === "RETRAIT_AGREMENT" && "N'est plus autorisée à exercer"}
                    {fiche.statut === "OPR" && "Renseignez-vous auprès de la DRS-SFD"}
                  </span>
                </p>

                <h2 id="rg-extrait-titre">{fiche.nom}</h2>
                {fiche.sigle && fiche.sigle !== fiche.nom && <p className="rg-extrait-sigle">{fiche.sigle}</p>}

                <div className="rg-numero">
                  <span className="rg-numero-libelle">Numéro d'agrément</span>
                  <span className="rg-numero-valeur">{fiche.numero_agrement || "Non renseigné"}</span>
                  {fiche.numero_agrement && (
                    <button type="button" className="rg-numero-copier" onClick={() => void copierLien()} title="Copier le lien de cet extrait">
                      <Icone taille={16}>{copie ? <path d="m5 12 5 5L20 7" /> : <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>}</Icone>
                      {copie ? "Lien copié" : "Copier le lien"}
                    </button>
                  )}
                </div>

                <dl className="rg-releve">
                  <div><dt>Type</dt><dd>{fiche.type || "—"}</dd></div>
                  <div><dt>Forme juridique</dt><dd>{fiche.forme_juridique || "—"}</dd></div>
                  <div><dt>Année de création</dt><dd>{fiche.annee_creation ?? "—"}</dd></div>
                  <div><dt>Région</dt><dd>{regionAffichee(fiche.region) || "—"}</dd></div>
                  <div><dt>Département</dt><dd>{fiche.departement || "—"}</dd></div>
                  <div><dt>Siège</dt><dd>{fiche.localite || "—"}</dd></div>
                  <div>
                    <dt>Téléphone</dt>
                    <dd className="rg-telephones">
                      {fiche.telephone
                        ? telephones(fiche.telephone).map((t) => t.lien ? <a key={t.texte} href={t.lien}>{t.texte}</a> : <span key={t.texte}>{t.texte}</span>)
                        : "Non renseigné"}
                    </dd>
                  </div>
                </dl>

                <button type="button" className="rg-lien rg-nouvelle" onClick={() => { fermer(); setSaisie(""); champ.current?.focus(); }}>
                  Nouvelle vérification
                </button>
              </div>
              <div className="rg-extrait-carte">
                <SenegalMap theme="light" fillMode="muted" flow={false} showLabels={false} zoomSelection rayon={0}
                  selected={regionAffichee(fiche.region) ?? ""} selectedPoint={pointFiche} />
                {!pointFiche && <p className="rg-carte-note">Position exacte du siège non renseignée : la carte montre sa région.</p>}
              </div>
            </div>
          </section>
        )}

        <section id="rg-registre" className="rg-registre" aria-labelledby="rg-registre-titre">
          <div className="rg-largeur rg-registre-in">
            <aside className="rg-regions" aria-label="Filtrer par région">
              <h2 id="rg-registre-titre">Le registre</h2>
              <ul>
                <li>
                  <button type="button" className={!region ? "actif" : undefined} onClick={() => setRegion("")}>
                    <span>Tout le Sénégal</span><span className="rg-nb">{nombre(registre?.length ?? 0)}</span>
                  </button>
                </li>
                {regionsTriees.map(([cle, n]) => (
                  <li key={cle}>
                    <button type="button" className={region === cle ? "actif" : undefined} onClick={() => setRegion(region === cle ? "" : cle)}>
                      <span>{nomRegion(cle)}</span><span className="rg-nb">{n}</span>
                      <span className="rg-barre" style={{ width: `${(n / maxRegion) * 100}%` }} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <select className="rg-regions-mobile" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Région">
                <option value="">Tout le Sénégal ({registre?.length ?? 0})</option>
                {regionsTriees.map(([cle, n]) => <option key={cle} value={cle}>{nomRegion(cle)} ({n})</option>)}
              </select>
            </aside>

            <div className="rg-liste">
              <p className="rg-liste-titre">
                <span>
                  {recherche ? <>{nombre(liste.length)} {pluriel(liste.length, "résultat")} pour « {saisie.trim()} »</> : <>{nombre(liste.length)} {pluriel(liste.length, "institution")}</>}
                  {region && <> · {nomRegion(region)}</>}
                </span>
                {(recherche || region) && <button type="button" className="rg-lien" onClick={() => { setSaisie(""); setRegion(""); }}>Tout afficher</button>}
              </p>
              <CadreTableau pied={<Pagination page={page} pages={pages} onPage={setPage} resume={<>Page {page} sur {pages}</>} />}>
                <Tableau largeurMin={640}>
                  <thead>
                    <tr><EnTete>N° d'agrément</EnTete><EnTete>Dénomination</EnTete><EnTete>Région</EnTete><EnTete>Statut</EnTete></tr>
                  </thead>
                  <tbody>
                    {liste.slice((page - 1) * PAR_PAGE, page * PAR_PAGE).map((f) => (
                      <tr key={f.id} className={`rg-ligne${f.id === ficheId ? " choisie" : ""}`} onClick={() => ouvrir(f)} tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") ouvrir(f); }}>
                        <td data-label="N° d'agrément" className="rg-agr">{f.numero_agrement || "—"}</td>
                        <td data-label="Dénomination"><span className="rg-ligne-nom">{f.nom}</span>{f.sigle && f.sigle !== f.nom && <span className="rg-ligne-sigle">{f.sigle}</span>}</td>
                        <td data-label="Région">{regionAffichee(f.region) || "—"}</td>
                        <td data-label="Statut"><Badge ton={TON_STATUT[f.statut] ?? "neutre"}>{f.statut_libelle}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Tableau>
                {registre && liste.length === 0 && <EtatVide titre="Aucune institution ne correspond">Vérifiez le numéro d'agrément ou changez de région.</EtatVide>}
              </CadreTableau>
            </div>
          </div>
        </section>
      </main>

      <footer className="rg-pied">
        <div className="rg-largeur rg-pied-in">
          <span>Direction de la Réglementation et de la Supervision des Systèmes Financiers Décentralisés</span>
          <span>Ministère des Finances et du Budget · République du Sénégal</span>
        </div>
      </footer>
    </div>
  );
}
