import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import type { Role } from "./api/types";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AssistantGlobal } from "./components/assistant/Assistant";
import { AvisReveil, BandeauDemo } from "./components/AvisSysteme";
import { GardeSession } from "./components/GardeSession";
import { FiletErreur } from "./components/FiletErreur";
import { EcranSquelette } from "./components/Squelette";
import { PAGES } from "./lib/pages";

// Chaque page est un fichier JavaScript séparé, téléchargé à sa première visite.
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

/** Connexion requise, et éventuellement un ensemble de rôles autorisés. */
function Protege({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <EcranSquelette />;
  if (!utilisateur) return <Navigate to="/connexion" replace />;
  if (roles && !roles.includes(utilisateur.role)) return <Navigate to="/" replace />;
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
          <Route path="/" element={<Protege><TableauDeBord /></Protege>} />
          <Route path="/carte/macro" element={<Protege><CarteMacro /></Protege>} />
          <Route path="/carte/micro" element={<Protege><CarteMicro /></Protege>} />
          <Route path="/supervision" element={<Protege roles={GESTION}><Supervision /></Protege>} />
          <Route path="/consultation" element={<Protege><Consultation /></Protege>} />
          <Route path="/imf" element={<Protege><Institutions /></Protege>} />
          <Route path="/imf/nouveau" element={<Protege roles={ADMIN}><FormulaireIMF /></Protege>} />
          <Route path="/imf/:id/modifier" element={<Protege roles={GESTION}><FormulaireIMF /></Protege>} />
          <Route path="/points-service" element={<Protege><PointsService /></Protege>} />
          <Route path="/dirigeants" element={<Protege><Dirigeants /></Protege>} />
          <Route path="/donnees" element={<Protege roles={ADMIN}><Donnees /></Protege>} />
          <Route path="/audit" element={<Protege roles={ADMIN}><Audit /></Protege>} />
          <Route path="/itineraire" element={<Protege><Itineraire /></Protege>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </FiletErreurParPage>
        <AssistantGlobal />
      </BrowserRouter>
      <AvisReveil />
      <GardeSession />
      <BandeauDemo />
    </AuthProvider>
  );
}
