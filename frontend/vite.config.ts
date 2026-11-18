import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Le proxy évite le CORS : le navigateur appelle /api sur le même port que Vite.
// changeOrigin=false conserve l'en-tête Host "localhost", accepté par ALLOWED_HOSTS.
const cible = process.env.VITE_API_PROXY ?? "http://localhost:8000";

// Dans Docker (Desktop macOS / Windows), les modifications des fichiers montés ne sont pas
// toujours signalées au conteneur : Vite servirait alors une ancienne version des pages
// (modules anciens et nouveaux mélangés, page qui plante). VITE_POLLING=true (docker-compose)
// fait relire les fichiers régulièrement.
const polling = process.env.VITE_POLLING === "true";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: polling ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      "/api": { target: cible, changeOrigin: false },
      "/media": { target: cible, changeOrigin: false },
    },
  },
});
