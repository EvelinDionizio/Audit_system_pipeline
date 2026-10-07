import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { authBasicoMiddleware } from "@/lib/auth-middleware";
import { getUsuarioAtual } from "@/lib/auth.server";

export type { Papel, UsuarioAtual } from "@/lib/auth.server";

// Middleware básico: quem está com a senha provisória precisa conseguir
// carregar o próprio perfil para ser levado à tela de troca de senha ou de MFA.
export const getMe = createServerFn({ method: "GET" })
  .middleware([authBasicoMiddleware])
  .handler(async ({ context }) => getUsuarioAtual(context.supabase, context.userId, context.faltaMfa));

export const meQueryKey = ["me"] as const;

export const meQueryOptions = () =>
  queryOptions({
    queryKey: meQueryKey,
    queryFn: () => getMe(),
    staleTime: 5 * 60 * 1000,
  });
