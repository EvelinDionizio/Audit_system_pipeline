import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Área do analista (substitui require_analista). Esta checagem só decide a
 * navegação: quem protege os dados de fato são as policies de RLS do banco
 * e o papel vem do servidor (getMe), nunca de localStorage.
 */
export const Route = createFileRoute("/_authenticated/analista")({
  beforeLoad: ({ context }) => {
    if (context.me.papel !== "analista") {
      throw redirect({ to: "/" });
    }
  },
  component: Outlet,
});
