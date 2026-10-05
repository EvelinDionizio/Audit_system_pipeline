// Client do Supabase para o navegador. No Lovable Cloud este arquivo é
// gerado automaticamente; esta versão existe para o build local.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

// Ambiente local (scripts/local.sh): VITE_SUPABASE_URL="/supabase" é um caminho
// no próprio app, que repassa ao Supabase local. Assim um único túnel do ngrok
// serve o app e o banco. No servidor, o caminho relativo vira o SUPABASE_URL.
function resolverUrl(url: string | undefined): string {
  if (!url?.startsWith("/")) return url || "http://localhost:54321";
  if (typeof window !== "undefined") return window.location.origin + url;
  return globalThis.process?.env["SUPABASE_URL"] ?? "http://localhost:54321";
}

// Sem .env (ex.: só compilando) usa valores de exemplo para não quebrar o import.
export const supabase = createClient<Database>(
  resolverUrl(SUPABASE_URL),
  SUPABASE_PUBLISHABLE_KEY || "chave-de-exemplo",
  {
    auth: {
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
