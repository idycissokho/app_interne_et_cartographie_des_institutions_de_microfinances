/**
 * Boutons de contact d'un numéro : « Appeler » (tel:) et « WhatsApp » (wa.me, portables seulement).
 *
 * - variante « icones » : deux petits boutons ronds (colonne « Contact » des tableaux) ;
 * - variante « liste » : chaque numéro, suivi de ses boutons libellés (fiches, extrait du registre).
 * Les clics ne remontent pas à la ligne du tableau (qui ouvre une fiche).
 */
import type { MouseEvent } from "react";

import { numerosTelephone, type Numero } from "../lib/telephone";

const I_APPEL = "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z";

function IconeAppel({ taille = 16 }: { taille?: number }) {
  return <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I_APPEL} /></svg>;
}
/** Bulle WhatsApp (pictogramme simplifié, monochrome). */
function IconeWhatsApp({ taille = 16 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 20.5 5 16.3A8.5 8.5 0 1 1 8 19.2l-4.5 1.3z" />
      <path d="M9.2 8.6c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .5-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3-.1.5-.4.7-.5.4-1.2.5-1.9.3-2.1-.6-4-2.5-4.6-4.6-.2-.7-.1-1.4.3-1.9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const arreter = (e: MouseEvent) => e.stopPropagation();

function Boutons({ n, libelles, nom }: { n: Numero; libelles: boolean; nom?: string }) {
  const qui = nom ? ` ${nom}` : "";
  return (
    <span className={libelles ? "ct-boutons ct-libelles" : "ct-boutons"}>
      {n.appel && (
        <a className="ct-bouton ct-appel" href={n.appel} onClick={arreter} aria-label={`Appeler${qui} au ${n.affiche}`} title={`Appeler le ${n.affiche}`}>
          <IconeAppel />{libelles && <span>Appeler</span>}
        </a>
      )}
      {n.whatsapp && (
        <a className="ct-bouton ct-whatsapp" href={n.whatsapp} target="_blank" rel="noopener noreferrer" onClick={arreter} aria-label={`Écrire${qui} sur WhatsApp au ${n.affiche}`} title={`WhatsApp : ${n.affiche}`}>
          <IconeWhatsApp />{libelles && <span>WhatsApp</span>}
        </a>
      )}
    </span>
  );
}

/** Colonne « Contact » : boutons du premier numéro joignable (WhatsApp sur le premier portable). */
export function ContactIcones({ telephone, nom }: { telephone: string | null | undefined; nom?: string }) {
  const numeros = numerosTelephone(telephone).filter((n) => n.appel);
  if (!numeros.length) return <span className="ct-aucun" title="Aucun numéro renseigné">—</span>;
  const appel = numeros[0]!;
  const portable = numeros.find((n) => n.whatsapp);
  return (
    <span className="ct-boutons">
      <Boutons n={{ ...appel, whatsapp: null }} libelles={false} nom={nom} />
      {portable && <Boutons n={{ ...portable, appel: null }} libelles={false} nom={nom} />}
    </span>
  );
}

/** Liste des numéros, chacun avec ses boutons « Appeler » et « WhatsApp ». */
export function ContactListe({ telephone, nom, vide = "Non renseigné" }: { telephone: string | null | undefined; nom?: string; vide?: string }) {
  const numeros = numerosTelephone(telephone);
  if (!numeros.length) return <span className="ct-aucun">{vide}</span>;
  return (
    <span className="ct-liste">
      {numeros.map((n) => (
        <span key={n.affiche} className="ct-ligne">
          <span className="ct-numero">{n.affiche}</span>
          <Boutons n={n} libelles nom={nom} />
        </span>
      ))}
    </span>
  );
}
