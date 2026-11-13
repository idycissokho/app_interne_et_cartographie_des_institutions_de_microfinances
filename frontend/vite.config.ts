import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Le proxy évite le CORS : le navigateur appelle /api sur le même port que Vite.
// changeOrigin=false conserve l'en-tête Host "localhost", accepté par ALLOWED_HOSTS.
const cible = process.env.VITE_API_PROXY ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: cible, changeOrigin: false },
      "/media": { target: cible, changeOrigin: false },
    },
  },
});
