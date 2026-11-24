/**
 * Notifications de l'application : l'application répond à chaque action (enregistrement, import,
 * export, connexion…). Une seule zone, en bas à droite, commune à toutes les pages : une
 * notification reste visible quand on change de page.
 *
 * Envoi depuis n'importe quel fichier : lib/notifier.ts (notifier.succes, .erreur, .info, .attente).
 *
 * Identité Or & Nuit : carte bleu nuit, pastille colorée selon le ton, Inter, échelle --t-*.
 * Disparition automatique (pause au survol), barre dorée du temps restant, bouton de fermeture.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { abonner, lire, notifier, type Notification, type Ton } from "../lib/notifier";

const ICONES: Record<Ton, ReactNode> = {
  succes: <path d="m5 12 5 5L20 7" />,
  erreur: <><path d="M12 8v5" /><path d="M12 16.5h.01" /></>,
  info: <><path d="M12 11v5" /><path d="M12 7.5h.01" /></>,
  attente: <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
};

function Carte({ n }: { n: Notification }) {
  const [pause, setPause] = useState(false);
  const reste = useRef(n.duree);
  const debut = useRef(Date.now());

  // Minuterie : interrompue au survol (lecture), reprise ensuite avec le temps restant.
  useEffect(() => { reste.current = n.duree; }, [n.duree, n.titre]);
  useEffect(() => {
    if (!n.duree || pause) return;
    debut.current = Date.now();
    const t = window.setTimeout(() => notifier.fermer(n.id), reste.current);
    return () => { window.clearTimeout(t); reste.current -= Date.now() - debut.current; };
  }, [n.id, n.duree, n.titre, pause]);

  return (
    <div className={`nt-carte nt-${n.ton}`} role={n.ton === "erreur" ? "alert" : "status"}
      onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)} onFocus={() => setPause(true)} onBlur={() => setPause(false)}>
      <span className="nt-icone" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={n.ton === "attente" ? "sys-roue" : undefined}>{ICONES[n.ton]}</svg>
      </span>
      <div className="nt-corps">
        <b>{n.titre}</b>
        {n.texte && <span className="nt-texte">{n.texte}</span>}
        {n.action && <Link to={n.action.vers} className="nt-action" onClick={() => notifier.fermer(n.id)}>{n.action.libelle} <span aria-hidden="true">→</span></Link>}
      </div>
      <button type="button" className="nt-fermer" aria-label="Fermer la notification" onClick={() => notifier.fermer(n.id)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      {n.duree > 0 && <span key={`${n.id}-${n.titre}`} className="nt-temps" style={{ animationDuration: `${n.duree}ms`, animationPlayState: pause ? "paused" : "running" }} aria-hidden="true" />}
    </div>
  );
}

/** Zone des notifications, montée une fois dans App. */
export function Notifications() {
  const notifs = useSyncExternalStore(abonner, lire, lire);
  return (
    <div className="nt-zone" aria-live="polite" aria-relevant="additions">
      {notifs.map((n) => <Carte key={n.id} n={n} />)}
    </div>
  );
}
