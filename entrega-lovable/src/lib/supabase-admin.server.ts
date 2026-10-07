import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { criarClienteDemo } from "@/lib/demo/cliente-demo.server";
import { modoDemo } from "@/lib/demo/modo.server";

/**
 * Client com service_role: ignora o RLS. Usar só em código de servidor e só
 * depois de checar a permissão de quem chamou (ex.: exigirAnalista).
 *
 * Se o Lovable tiver gerado um client admin próprio (ex.:
 * `@/integrations/supabase/client.server`), troque as chamadas por ele.
 */
export function criarClienteAdmin() {
  // Modo demonstração: o "admin" é o mesmo banco SQLite local.
  if (modoDemo()) return criarClienteDemo();

  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão configurados.");
  }
  return createClient<Database>(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
