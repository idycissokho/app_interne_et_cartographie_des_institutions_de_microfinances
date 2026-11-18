/**
 * Filet de sécurité de l'application : une erreur d'affichage (ou une page introuvable après une
 * mise en ligne) montre un message et un bouton « Recharger », au lieu d'une page blanche.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

export class FiletErreur extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error("Erreur d'affichage :", erreur, info.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#FFFFFF", fontFamily: "var(--police)" }}>
        <div style={{ maxWidth: 440, textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <b style={{ fontSize: "var(--t-xl)", color: "#0B1424" }}>Cette page n'a pas pu s'afficher</b>
          <span style={{ fontSize: "var(--t-base)", color: "#4A5568", lineHeight: 1.5 }}>
            L'application a peut-être été mise à jour entre-temps. Rechargez la page pour obtenir la dernière version.
          </span>
          <button type="button" onClick={() => window.location.reload()} style={{ height: 48, padding: "0 22px", borderRadius: 10, border: "none", background: "#C9A44C", color: "#0B1424", font: "inherit", fontSize: "var(--t-md)", fontWeight: 700, cursor: "pointer" }}>
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
