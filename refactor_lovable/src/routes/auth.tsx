import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { destinoSeguro, entrarComMicrosoft, obterSessao } from "@/lib/auth-client";

const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
  // Erro devolvido pela Microsoft/Supabase quando o login falha.
  error_description: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  // A sessão fica no navegador, então a checagem não pode rodar no SSR.
  ssr: false,
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Login — Bernhoeft" },
      { name: "description", content: "Acesso ao Sistema de Auditoria da Bernhoeft com a conta Microsoft corporativa." },
      { property: "og:title", content: "Login — Bernhoeft" },
      { property: "og:description", content: "Acesso ao Sistema de Auditoria da Bernhoeft." },
    ],
  }),
  beforeLoad: async ({ search }) => {
    if (await obterSessao()) {
      throw redirect({ href: destinoSeguro(search.redirect) });
    }
  },
  component: PaginaLogin,
});

function PaginaLogin() {
  const { redirect: destino, error_description: erroRetorno } = Route.useSearch();
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(
    erroRetorno ? `Não foi possível entrar: ${erroRetorno}` : null,
  );

  async function entrar() {
    setEntrando(true);
    setErro(null);
    try {
      await entrarComMicrosoft(destinoSeguro(destino));
    } catch {
      setErro("Não foi possível iniciar o login com a Microsoft. Tente novamente.");
      setEntrando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Bernhoeft</CardTitle>
          <CardDescription>Sistema de Auditoria</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <h1 className="text-center text-lg font-semibold text-foreground">
            Entrar na plataforma
          </h1>
          <Button className="w-full" onClick={entrar} disabled={entrando}>
            {entrando ? "Redirecionando…" : "Entrar com Microsoft"}
          </Button>
          {erro && (
            <p role="alert" className="text-center text-sm text-destructive">
              {erro}
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Use sua conta corporativa @bernhoeft.com.br.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
