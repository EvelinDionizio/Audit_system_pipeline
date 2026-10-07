import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { obterSessao } from "@/lib/auth-client";
import { exigirAnalista } from "@/lib/auth.server";
import { senhaVencida } from "@/lib/senha";
import { criarClienteDemo } from "@/lib/demo/cliente-demo.server";
import { PREFIXO_TOKEN_DEMO, modoDemo } from "@/lib/demo/modo.server";

type MotivoTrocaSenha = "provisoria" | "vencida" | null;

/**
 * Middleware de autenticação das server functions (substitui require_auth da API).
 *
 * - No cliente: anexa o access token da sessão do Supabase no header Authorization.
 * - No servidor: valida o token e entrega em `context` um client do banco que
 *   age COMO o usuário (as policies de RLS valem) e o `userId`.
 *
 * Dois níveis:
 *   - authBasicoMiddleware: só exige sessão válida. Usado apenas por "quem sou
 *     eu" e "trocar senha", que precisam funcionar mesmo com a senha provisória.
 *   - authMiddleware: o padrão do sistema. Além da sessão, barra quem ainda
 *     está com a senha provisória (o bloqueio vale no servidor, não só na tela).
 *
 * Uso: createServerFn(...).middleware([authMiddleware]).handler(({ context }) => ...)
 */
export const authBasicoMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    // obterSessao cobre também a sessão fictícia do modo demonstração.
    const token = (await obterSessao())?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  })
  .server(async ({ next }) => {
    const token = getRequestHeader("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new Error("Não autenticado.");
    }

    // Modo demonstração: banco SQLite local e login fictício.
    if (modoDemo()) {
      if (!token.startsWith(PREFIXO_TOKEN_DEMO)) throw new Error("Sessão inválida ou expirada.");
      return next({
        context: {
          supabase: criarClienteDemo(),
          userId: token.slice(PREFIXO_TOKEN_DEMO.length),
          deveTrocarSenha: false,
          motivoTrocaSenha: null as MotivoTrocaSenha,
        },
      });
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

    const perfil = await db
      .from("profiles")
      .select("deve_trocar_senha, tipo_acesso, senha_alterada_em")
      .eq("id", data.user.id)
      .maybeSingle();
    if (perfil.error) {
      throw new Error(`Erro ao verificar o acesso: ${perfil.error.message}`);
    }

    const provisoria = perfil.data?.deve_trocar_senha ?? false;
    const vencida = perfil.data ? senhaVencida(perfil.data) : false;

    return next({
      context: {
        supabase: db,
        userId: data.user.id,
        deveTrocarSenha: provisoria || vencida,
        motivoTrocaSenha: (provisoria ? "provisoria" : vencida ? "vencida" : null) as MotivoTrocaSenha,
      },
    });
  });

export const authMiddleware = createMiddleware({ type: "function" })
  .middleware([authBasicoMiddleware])
  .server(async ({ next, context }) => {
    if (context.deveTrocarSenha) {
      throw new Error(
        context.motivoTrocaSenha === "vencida"
          ? "Sua senha venceu (validade de 90 dias). Troque a senha antes de continuar."
          : "Troque a senha provisória antes de continuar.",
      );
    }
    return next();
  });

/** authMiddleware + exige analista ativo (substitui require_analista). */
export const analistaMiddleware = createMiddleware({ type: "function" })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    await exigirAnalista(context.supabase, context.userId);
    return next();
  });
