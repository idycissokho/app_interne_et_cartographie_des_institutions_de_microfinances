import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import type { Role } from "./api/types";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import type { CleMenu } from "./components/layout/Sidebar";
import { Audit } from "./pages/Audit";
import { CarteMacro } from "./pages/CarteMacro";
import { CarteMicro } from "./pages/CarteMicro";
import { Connexion } from "./pages/Connexion";
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

/** Écran pas encore reproduit (remplacé au fil des étapes 02 → 11). */
function AVenir({ active }: { active: CleMenu }) {
  return (
    <AppLayout active={active}>
      <main style={{ flex: "999 1 640px", padding: 32 }}>Écran en cours de reproduction.</main>
    </AppLayout>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/" element={<Protege><TableauDeBord /></Protege>} />
          <Route path="/carte/macro" element={<Protege><CarteMacro /></Protege>} />
          <Route path="/carte/micro" element={<Protege><CarteMicro /></Protege>} />
          <Route path="/supervision" element={<Protege roles={GESTION}><AVenir active="supervision" /></Protege>} />
          <Route path="/consultation" element={<Protege><AVenir active="consultation" /></Protege>} />
          <Route path="/imf" element={<Protege roles={GESTION}><AVenir active="imf" /></Protege>} />
          <Route path="/imf/nouveau" element={<Protege roles={GESTION}><AVenir active="imf" /></Protege>} />
          <Route path="/imf/:id/modifier" element={<Protege roles={GESTION}><AVenir active="imf" /></Protege>} />
          <Route path="/points-service" element={<Protege roles={GESTION}><AVenir active="points" /></Protege>} />
          <Route path="/dirigeants" element={<Protege roles={GESTION}><AVenir active="dirigeants" /></Protege>} />
          <Route path="/donnees" element={<Protege roles={GESTION}><AVenir active="import" /></Protege>} />
          <Route path="/audit" element={<Protege roles={["ADMIN"]}><AppLayout active="audit"><main style={{ flex: "999 1 640px", minWidth: 0, padding: "28px 32px 48px 32px", boxSizing: "border-box" }}><Audit /></main></AppLayout></Protege>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
