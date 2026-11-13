import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Audit } from "./pages/Audit";
import { CarteMacro } from "./pages/CarteMacro";
import { CarteMicro } from "./pages/CarteMicro";
import { Connexion } from "./pages/Connexion";
import { DirigeantFiche } from "./pages/DirigeantFiche";
import { DirigeantsListe } from "./pages/DirigeantsListe";
import { IMFFiche } from "./pages/IMFFiche";
import { IMFListe } from "./pages/IMFListe";
import { Importation } from "./pages/Importation";
import { PointsListe } from "./pages/PointsListe";

/** Protège les routes : connexion requise, et éventuellement un niveau de rôle. */
function Protege({ children, niveau }: { children: ReactNode; niveau?: "ecriture" | "admin" }) {
  const { utilisateur, chargement, peutEcrire, estAdmin } = useAuth();
  if (chargement) return <div className="muet centre">Chargement…</div>;
  if (!utilisateur) return <Navigate to="/connexion" replace />;
  if ((niveau === "ecriture" && !peutEcrire) || (niveau === "admin" && !estAdmin)) return <Navigate to="/carte" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route element={<Protege><Layout /></Protege>}>
            <Route path="/carte" element={<CarteMicro />} />
            <Route path="/carte-macro" element={<CarteMacro />} />
            <Route path="/imf" element={<IMFListe />} />
            <Route path="/imf/:id" element={<IMFFiche />} />
            <Route path="/points-service" element={<PointsListe />} />
            <Route path="/dirigeants" element={<DirigeantsListe />} />
            <Route path="/dirigeants/:id" element={<DirigeantFiche />} />
            <Route path="/importation" element={<Protege niveau="ecriture"><Importation /></Protege>} />
            <Route path="/audit" element={<Protege niveau="admin"><Audit /></Protege>} />
          </Route>
          <Route path="*" element={<Navigate to="/carte" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
