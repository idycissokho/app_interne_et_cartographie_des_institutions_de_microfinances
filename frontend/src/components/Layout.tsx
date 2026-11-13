import { NavLink, Outlet } from "react-router-dom";

import { libelle } from "../api/libelles";
import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { utilisateur, deconnecter, peutEcrire, estAdmin } = useAuth();
  const liens = [
    { to: "/carte", label: "Carte des points de service" },
    { to: "/carte-macro", label: "Carte macro (zones)" },
    { to: "/imf", label: "Institutions (IMF)" },
    { to: "/points-service", label: "Points de service" },
    { to: "/dirigeants", label: "Dirigeants" },
    ...(peutEcrire ? [{ to: "/importation", label: "Import / Export" }] : []),
    ...(estAdmin ? [{ to: "/audit", label: "Journal d'audit" }] : []),
  ];
  return (
    <div className="appli">
      <aside className="barre">
        <div className="marque">
          <strong>Cartographie IMF</strong>
          <span>DRS-SFD · Sénégal</span>
        </div>
        <nav>
          {liens.map((l) => (
            <NavLink key={l.to} to={l.to}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="profil">
          <div>{utilisateur?.nom_complet}</div>
          <small>{libelle("role", utilisateur?.role)}</small>
          <button className="btn btn-lien" onClick={deconnecter}>Se déconnecter</button>
        </div>
      </aside>
      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
