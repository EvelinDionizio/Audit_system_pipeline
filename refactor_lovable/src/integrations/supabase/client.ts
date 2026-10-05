// Client do Supabase para o navegador. No Lovable Cloud este arquivo é
// gerado automaticamente; esta versão existe para o build local.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

// Sem .env (ex.: só compilando) usa valores de exemplo para não quebrar o import.
export const supabase = createClient<Database>(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_PUBLISHABLE_KEY || "chave-de-exemplo",
  {
    auth: {
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
