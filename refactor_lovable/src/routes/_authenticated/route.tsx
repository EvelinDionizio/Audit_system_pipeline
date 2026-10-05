import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { obterSessao } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/auth.functions";

/**
 * Layout protegido (substitui require_auth). Toda rota dentro de
 * _authenticated/ exige sessão e usuário autorizado por um analista.
 * As rotas filhas recebem `context.me` com perfil e papel.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    if (!(await obterSessao())) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (!me.ativo || !me.papel) {
      throw redirect({ to: "/acesso-pendente" });
    }

    return { me };
  },
  component: Outlet,
});
