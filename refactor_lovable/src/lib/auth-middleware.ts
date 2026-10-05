import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { exigirAnalista } from "@/lib/auth.server";

/**
 * Middleware de autenticação das server functions (substitui require_auth da API).
 *
 * - No cliente: anexa o access token da sessão do Supabase no header Authorization.
 * - No servidor: valida o token e entrega em `context` um client do banco que
 *   age COMO o usuário (as policies de RLS valem) e o `userId`.
 *
 * Uso: createServerFn(...).middleware([authMiddleware]).handler(({ context }) => ...)
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  })
  .server(async ({ next }) => {
    const token = getRequestHeader("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new Error("Não autenticado.");
    }

    // Env lido só aqui dentro, conforme a regra do runtime edge.
    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const chave =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !chave) {
      throw new Error("SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY não estão configurados.");
    }

    const db = createClient<Database>(url, chave, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      throw new Error("Sessão inválida ou expirada.");
    }

    return next({ context: { supabase: db, userId: data.user.id } });
  });

/** authMiddleware + exige analista ativo (substitui require_analista). */
export const analistaMiddleware = createMiddleware({ type: "function" })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    await exigirAnalista(context.supabase, context.userId);
    return next();
  });
