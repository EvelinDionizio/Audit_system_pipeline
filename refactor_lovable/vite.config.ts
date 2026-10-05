import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Ambiente local (scripts/local.sh exporta SUPABASE_PROXY_LOCAL): /supabase/*
// vai para o Supabase local, então um único túnel do ngrok serve o app e o
// banco. Sem a variável (Vercel, Lovable) nada disso entra no build.
const proxyLocal = process.env["SUPABASE_PROXY_LOCAL"];

export default defineConfig({
  server: { allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app", ".ngrok.io"] },
  preview: { allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app", ".ngrok.io"] },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // tanstackStart precisa vir antes do plugin do React. O nitro gera a saída
  // para a hospedagem (na Vercel detecta o preset sozinho); no Lovable o
  // template já cuida disso, então ele pode ser removido ao importar.
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro(proxyLocal ? { routeRules: { "/supabase/**": { proxy: `${proxyLocal}/**` } } } : {}),
    viteReact(),
  ],
});
