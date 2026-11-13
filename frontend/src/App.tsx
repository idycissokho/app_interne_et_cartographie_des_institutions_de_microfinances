import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import type { Role } from "./api/types";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Audit } from "./pages/Audit";
import { CarteMacro } from "./pages/CarteMacro";
import { CarteMicro } from "./pages/CarteMicro";
import { Connexion } from "./pages/Connexion";
import { Dirigeants } from "./pages/Dirigeants";
import { Donnees } from "./pages/Donnees";
import { FormulaireIMF } from "./pages/FormulaireIMF";
import { Institutions } from "./pages/Institutions";
import { PointsService } from "./pages/PointsService";
import { Consultation } from "./pages/Consultation";
import { Supervision } from "./pages/Supervision";
import { TableauDeBord } from "./pages/TableauDeBord";

/** Connexion requise, et éventuellement un ensemble de rôles autorisés. */
function Protege({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return null;
  if (!utilisateur) return <Navigate to="/connexion" replace />;
  if (roles && !roles.includes(utilisateur.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const GESTION: Role[] = ["ADMIN", "SUPERVISEUR"];


export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/" element={<Protege><TableauDeBord /></Protege>} />
          <Route path="/carte/macro" element={<Protege><CarteMacro /></Protege>} />
          <Route path="/carte/micro" element={<Protege><CarteMicro /></Protege>} />
          <Route path="/supervision" element={<Protege roles={GESTION}><Supervision /></Protege>} />
          <Route path="/consultation" element={<Protege><Consultation /></Protege>} />
          <Route path="/imf" element={<Protege roles={GESTION}><Institutions /></Protege>} />
          <Route path="/imf/nouveau" element={<Protege roles={GESTION}><FormulaireIMF /></Protege>} />
          <Route path="/imf/:id/modifier" element={<Protege roles={GESTION}><FormulaireIMF /></Protege>} />
          <Route path="/points-service" element={<Protege roles={GESTION}><PointsService /></Protege>} />
          <Route path="/dirigeants" element={<Protege roles={GESTION}><Dirigeants /></Protege>} />
          <Route path="/donnees" element={<Protege roles={GESTION}><Donnees /></Protege>} />
          <Route path="/audit" element={<Protege roles={["ADMIN"]}><Audit /></Protege>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
