import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { authMiddleware } from "@/lib/auth-middleware";
import { getUsuarioAtual } from "@/lib/auth.server";

export type { Papel, UsuarioAtual } from "@/lib/auth.server";

export const getMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => getUsuarioAtual(context.supabase, context.userId));

export const meQueryKey = ["me"] as const;

export const meQueryOptions = () =>
  queryOptions({
    queryKey: meQueryKey,
    queryFn: () => getMe(),
    staleTime: 5 * 60 * 1000,
  });
