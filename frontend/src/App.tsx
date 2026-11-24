import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import type { Role } from "./api/types";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AssistantGlobal } from "./components/assistant/Assistant";
import { AvisReveil, BandeauDemo } from "./components/AvisSysteme";
import { GardeSession } from "./components/GardeSession";
import { FiletErreur } from "./components/FiletErreur";
import { EcranSquelette } from "./components/Squelette";
import { Notifications } from "./components/Notifications";
import { SuiviImport } from "./components/SuiviImport";
import { PAGE_VISIBLE, PAGES } from "./lib/pages";

// Chaque page est un fichier JavaScript séparé, téléchargé à sa première visite.
const Accueil = lazy(PAGES.accueil);
const Connexion = lazy(PAGES.connexion);
const TableauDeBord = lazy(PAGES.tableauDeBord);
const CarteMacro = lazy(PAGES.carteMacro);
const CarteMicro = lazy(PAGES.carteMicro);
const Supervision = lazy(PAGES.supervision);
const Consultation = lazy(PAGES.consultation);
const Institutions = lazy(PAGES.institutions);
const FormulaireIMF = lazy(PAGES.formulaireIMF);
const PointsService = lazy(PAGES.pointsService);
const Dirigeants = lazy(PAGES.dirigeants);
const Donnees = lazy(PAGES.donnees);
const Audit = lazy(PAGES.audit);
const Itineraire = lazy(PAGES.itineraire);
const MotDePasse = lazy(PAGES.motDePasse);

/** Connexion requise, et éventuellement un ensemble de rôles autorisés. */
function Protege({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <EcranSquelette />;
  // Sans connexion : retour à l'accueil public, porte d'entrée de la plateforme.
  if (!utilisateur) return <Navigate to="/" replace />;
  // Mot de passe provisoire : rien d'autre n'est accessible avant de l'avoir changé.
  if (utilisateur.doit_changer_mot_de_passe) return <Navigate to="/mot-de-passe" replace />;
  if (roles && !roles.includes(utilisateur.role)) return <Navigate to="/tableau-de-bord" replace />;
  return <>{children}</>;
}

// Droits du diagramme de cas d'utilisation (DIAGRAMME DE CAS UTILISATION.drawio).
const GESTION: Role[] = ["ADMIN", "SUPERVISEUR"];
const ADMIN: Role[] = ["ADMIN"];


/** Filet d'erreur réinitialisé à chaque changement de page. */
function FiletErreurParPage({ children }: { children: ReactNode }) {
  return <FiletErreur cle={useLocation().pathname}>{children}</FiletErreur>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <FiletErreurParPage>
        <Suspense fallback={<EcranSquelette />}>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          {/* Accueil public : première page de la plateforme, connecté ou non. */}
          <Route path="/" element={<Accueil />} />
          <Route path="/accueil" element={<Navigate to="/" replace />} />
          <Route path="/tableau-de-bord" element={<Protege><TableauDeBord /></Protege>} />
          <Route path="/carte/macro" element={<Protege><CarteMacro /></Protege>} />
          <Route path="/carte/micro" element={<Protege><CarteMicro /></Protege>} />
          {/* Espace supervision masqué pour le moment (lib/pages.ts, PAGE_VISIBLE) : l'adresse renvoie au tableau de bord. */}
          <Route path="/supervision" element={PAGE_VISIBLE.supervision ? <Protege roles={GESTION}><Supervision /></Protege> : <Navigate to="/tableau-de-bord" replace />} />
          <Route path="/consultation" element={<Protege><Consultation /></Protege>} />
          <Route path="/imf" element={<Protege><Institutions /></Protege>} />
          <Route path="/imf/nouveau" element={<Protege roles={ADMIN}><FormulaireIMF /></Protege>} />
          <Route path="/imf/:id/modifier" element={<Protege roles={GESTION}><FormulaireIMF /></Protege>} />
          <Route path="/points-service" element={<Protege><PointsService /></Protege>} />
          <Route path="/dirigeants" element={<Protege><Dirigeants /></Protege>} />
          <Route path="/donnees" element={<Protege roles={ADMIN}><Donnees /></Protege>} />
          <Route path="/audit" element={<Protege roles={ADMIN}><Audit /></Protege>} />
          <Route path="/mot-de-passe" element={<MotDePasse />} />
          <Route path="/itineraire" element={<Protege><Itineraire /></Protege>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </FiletErreurParPage>
        <AssistantGlobal />
        <Notifications />
        <SuiviImport />
      </BrowserRouter>
      <AvisReveil />
      <GardeSession />
      <BandeauDemo />
    </AuthProvider>
  );
}
