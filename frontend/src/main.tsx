import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
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
