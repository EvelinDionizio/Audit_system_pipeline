import { createFileRoute, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoSair } from "@/components/botao-sair";
import { obterSessao } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/auth.functions";

/** Logou com a Microsoft, mas ainda não está em usuarios_autorizados (ou foi desativado). */
export const Route = createFileRoute("/acesso-pendente")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso pendente — Bernhoeft" },
      { name: "description", content: "Seu acesso ao Sistema de Auditoria aguarda liberação de um analista." },
      { property: "og:title", content: "Acesso pendente — Bernhoeft" },
      { property: "og:description", content: "Seu acesso aguarda liberação de um analista." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (!(await obterSessao())) {
      throw redirect({ to: "/auth" });
    }
    // Sempre busca de novo: o analista pode ter liberado o acesso agora.
    const me = await context.queryClient.fetchQuery({ ...meQueryOptions(), staleTime: 0 });
    if (me.ativo && me.papel) {
      throw redirect({ to: "/" });
    }
    return { me };
  },
  component: PaginaAcessoPendente,
});

function PaginaAcessoPendente() {
  const { me } = Route.useRouteContext();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acesso pendente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Você entrou como <span className="font-medium text-foreground">{me.email}</span>, mas
            seu acesso ao Sistema de Auditoria ainda não foi liberado.
          </p>
          <p>Peça a um analista para cadastrar seu e-mail e depois entre novamente.</p>
          <BotaoSair />
        </CardContent>
      </Card>
    </main>
  );
}
