import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // tanstackStart precisa vir antes do plugin do React. O nitro gera a saída
  // para a hospedagem (na Vercel detecta o preset sozinho); no Lovable o
  // template já cuida disso, então ele pode ser removido ao importar.
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
});
