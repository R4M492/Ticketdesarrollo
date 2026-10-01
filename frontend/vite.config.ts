import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Objetivo del proxy de /api y /uploads en modo desarrollo. Por defecto apunta al API Gateway
// (Traefik) en el puerto que publica en el host (ver gateway.ports en docker-compose.yml), que es
// como se corre el frontend fuera de Docker (npm run dev -w frontend) contra un stack ya levantado
// con `docker compose up`. Al correr el frontend DENTRO de Docker, API_PROXY_TARGET se fija a
// "http://gateway:80" (el nombre del servicio en la red interna) — ver docker-compose.yml y
// docs/plan-migracion-microservicios.md.
const proxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:80";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    port: 5173,
    host: true, // escucha en 0.0.0.0 — necesario para ser alcanzable desde fuera del contenedor
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/uploads": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});