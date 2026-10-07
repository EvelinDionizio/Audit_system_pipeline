import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  alterarSenhaPropria,
  criarAcessoExterno,
  redefinirMfaExterno,
  redefinirSenhaExterno,
} from "@/lib/acesso-externo.server";
import { analistaMiddleware, authBasicoMiddleware } from "@/lib/auth-middleware";
import { criarClienteAdmin } from "@/lib/supabase-admin.server";

/** Analista: cria o acesso nominal de um externo e devolve a senha temporária (uma única vez). */
export const criarAcessoExternoFn = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) =>
    z.object({ nome: z.string().trim().min(1), email: z.string().trim().email() }).parse(d),
  )
  .handler(({ data, context }) => criarAcessoExterno(criarClienteAdmin(), context.userId, data));

/** Analista: nova senha temporária para um externo que esqueceu a dele. */
export const redefinirSenhaExternoFn = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email() }).parse(d))
  .handler(({ data }) => redefinirSenhaExterno(criarClienteAdmin(), data.email));

/** Analista: remove o autenticador de um externo que perdeu o celular (ele cadastra outro no próximo login). */
export const redefinirMfaExternoFn = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email() }).parse(d))
  .handler(({ data }) => redefinirMfaExterno(criarClienteAdmin(), data.email));

/**
 * Externo: troca a própria senha. Usa o middleware básico de propósito: quem
 * está com a senha provisória precisa conseguir chegar aqui.
 */
export const alterarMinhaSenha = createServerFn({ method: "POST" })
  .middleware([authBasicoMiddleware])
  .inputValidator((d: unknown) => z.object({ atual: z.string().min(1), nova: z.string().min(1) }).parse(d))
  .handler(({ data, context }) =>
    alterarSenhaPropria(criarClienteAdmin(), { userId: context.userId, ...data }),
  );
