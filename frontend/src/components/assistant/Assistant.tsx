/**
 * Assistant de la plateforme : bouton flottant en bas à droite, panneau de conversation.
 * Les réponses viennent de POST /assistant/question/ (moteur local, données de la base uniquement).
 * L'historique est conservé le temps de la session (sessionStorage), effacé à la déconnexion.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { api, ErreurApi } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

interface Element { titre: string; sous_titre: string; lien: string }
interface ReponseApi { texte: string; elements: Element[]; lien: { libelle: string; url: string } | null; suggestions: string[]; hors_sujet: boolean }
type Message = { id: number; de: "moi"; texte: string } | ({ id: number; de: "assistant"; erreur?: boolean } & ReponseApi);

export const CLE_HISTORIQUE = "imf.assistant.historique";
const MAX_CARACTERES = 300;
const ACCUEIL: Message = {
  id: 0, de: "assistant", hors_sujet: false, elements: [], lien: null,
  texte: "Bonjour. Je réponds à vos questions sur les **institutions de microfinance**, leurs **points de service** et leurs **dirigeants**, à partir des données de la plateforme.",
  suggestions: ["Combien d'IMF sont en OPR ?", "Qui est le DG de l'ACEP Dakar ?", "Points de service de la région de Thiès", "Statistiques du secteur"],
};

function lireHistorique(): Message[] {
  try {
    const brut = sessionStorage.getItem(CLE_HISTORIQUE);
    const liste = brut ? (JSON.parse(brut) as Message[]) : [];
    return liste.length ? liste : [ACCUEIL];
  } catch {
    return [ACCUEIL];
  }
}

/** Texte de réponse : retours à la ligne et passages en **gras**. */
function TexteRiche({ texte }: { texte: string }) {
  return (
    <>
      {texte.split("\n").map((ligne, i) => (
        <p key={i} className="as-ligne">
          {ligne.split("**").map((morceau, j) => (j % 2 ? <strong key={j}>{morceau}</strong> : <span key={j}>{morceau}</span>))}
        </p>
      ))}
    </>
  );
}

const Icone = ({ d, taille = 18 }: { d: string; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const I_BULLE = "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12zM8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01";
const I_FERMER = "M6 6l12 12M18 6 6 18";
const I_ENVOYER = "M5 12h14M13 6l6 6-6 6";
const I_NOUVEAU = "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5";
const I_FLECHE = "M9 6l6 6-6 6";

export function Assistant() {
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<Message[]>(lireHistorique);
  const [saisie, setSaisie] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(CLE_HISTORIQUE, JSON.stringify(messages.slice(-40))); } catch { /* stockage indisponible */ }
  }, [messages]);

  // Défilement vers le dernier message, focus sur le champ à l'ouverture.
  useEffect(() => { if (ouvert) fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" }); }, [messages, envoi, ouvert]);
  useEffect(() => { if (ouvert) champ.current?.focus(); }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { setOuvert(false); bouton.current?.focus(); } };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  // Hauteur du champ : de 1 à 4 lignes selon la saisie.
  useEffect(() => {
    const c = champ.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 112)}px`;
  }, [saisie]);

  async function poser(question: string) {
    const q = question.trim().slice(0, MAX_CARACTERES);
    if (!q || envoi) return;
    const id = Date.now();
    setMessages((m) => [...m, { id, de: "moi", texte: q }]);
    setSaisie("");
    setEnvoi(true);
    try {
      const r = await api.post<ReponseApi>("/assistant/question/", { question: q });
      setMessages((m) => [...m, { id: id + 1, de: "assistant", ...r }]);
    } catch (e) {
      const texte = e instanceof ErreurApi && e.statut === 429
        ? "Vous avez posé beaucoup de questions d'affilée. Patientez une minute, puis réessayez."
        : "La réponse n'a pas pu être obtenue. Vérifiez votre connexion, puis réessayez.";
      setMessages((m) => [...m, { id: id + 1, de: "assistant", erreur: true, texte, elements: [], lien: null, suggestions: [], hors_sujet: false }]);
    } finally {
      setEnvoi(false);
    }
  }

  const surEnvoi = (e: FormEvent) => { e.preventDefault(); void poser(saisie); };
  const surTouche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void poser(saisie); }
  };
  const fermerSurMobile = () => { if (window.matchMedia("(max-width: 640px)").matches) setOuvert(false); };
  const dernier = messages[messages.length - 1];

  const bulleAssistant = (m: Extract<Message, { de: "assistant" }>): ReactNode => (
    <div className={"as-reponse" + (m.hors_sujet ? " as-hors-sujet" : "") + (m.erreur ? " as-erreur" : "")}>
      <TexteRiche texte={m.texte} />
      {m.elements.length > 0 && (
        <ul className="as-elements">
          {m.elements.map((el, i) => (
            <li key={i}>
              <Link to={el.lien} onClick={fermerSurMobile} className="as-element">
                <span><b>{el.titre}</b>{el.sous_titre && <span>{el.sous_titre}</span>}</span>
                <Icone d={I_FLECHE} taille={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {m.lien && <Link to={m.lien.url} onClick={fermerSurMobile} className="as-lien">{m.lien.libelle} →</Link>}
    </div>
  );

  return (
    <>
      {ouvert && (
        <section className="as-panneau" role="dialog" aria-modal="false" aria-labelledby="as-titre">
          <header className="as-entete">
            <span className="as-marque" aria-hidden="true"><Icone d={I_BULLE} taille={16} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id="as-titre">Assistant</h2>
              <p>Institutions, points de service et dirigeants</p>
            </div>
            <button type="button" className="as-icone" title="Nouvelle conversation" aria-label="Nouvelle conversation" onClick={() => setMessages([ACCUEIL])} disabled={envoi}><Icone d={I_NOUVEAU} taille={17} /></button>
            <button type="button" className="as-icone" title="Fermer" aria-label="Fermer l'assistant" onClick={() => { setOuvert(false); bouton.current?.focus(); }}><Icone d={I_FERMER} taille={17} /></button>
          </header>

          <div className="as-fil" ref={fil} aria-live="polite" aria-busy={envoi}>
            {messages.map((m) => (m.de === "moi"
              ? <div key={m.id} className="as-question"><span>{m.texte}</span></div>
              : <div key={m.id}>{bulleAssistant(m)}</div>))}
            {envoi && <div className="as-reponse"><span className="as-attente" aria-label="L'assistant prépare sa réponse"><i /><i /><i /></span></div>}
            {!envoi && dernier.de === "assistant" && dernier.suggestions.length > 0 && (
              <div className="as-suggestions">
                {dernier.suggestions.map((s) => <button key={s} type="button" onClick={() => void poser(s)}>{s}</button>)}
              </div>
            )}
          </div>

          <form className="as-saisie" onSubmit={surEnvoi}>
            <textarea ref={champ} rows={1} value={saisie} maxLength={MAX_CARACTERES} onChange={(e) => setSaisie(e.target.value)} onKeyDown={surTouche}
              placeholder="Posez votre question…" aria-label="Votre question" disabled={envoi} />
            <button type="submit" className="as-envoyer" disabled={envoi || !saisie.trim()} aria-label="Envoyer"><Icone d={I_ENVOYER} taille={18} /></button>
          </form>
          <p className="as-mention">Réponses tirées uniquement des données de la plateforme.{saisie.length > MAX_CARACTERES - 50 && ` ${saisie.length}/${MAX_CARACTERES}`}</p>
        </section>
      )}

      <button ref={bouton} type="button" className="as-bouton" aria-expanded={ouvert} aria-label={ouvert ? "Fermer l'assistant" : "Ouvrir l'assistant"} title="Assistant"
        onClick={() => setOuvert((o) => !o)}>
        <Icone d={ouvert ? I_FERMER : I_BULLE} taille={22} />
      </button>
    </>
  );
}

/** Assistant affiché sur toutes les pages, pour un utilisateur connecté (jamais sur la connexion). */
export function AssistantGlobal() {
  const { utilisateur } = useAuth();
  const { pathname } = useLocation();
  if (!utilisateur || pathname.startsWith("/connexion")) return null;
  return <Assistant />;
}
