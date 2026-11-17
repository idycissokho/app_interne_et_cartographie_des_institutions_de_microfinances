// Inter, police variable auto-hébergée (aucun appel à Internet : compatible intranet).
// « opsz » : le dessin s'adapte à la taille (plus ouvert en petit, plus serré en titre).
import "@fontsource-variable/inter/opsz.css";
import "./styles/global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClientProvider } from "@tanstack/react-query";

import { cacheRequetes } from "./api/cache";
import { reveillerServeur } from "./api/client";
import { App } from "./App";

// Démarre le serveur s'il est en veille, avant même la première requête de données.
reveillerServeur();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={cacheRequetes}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
