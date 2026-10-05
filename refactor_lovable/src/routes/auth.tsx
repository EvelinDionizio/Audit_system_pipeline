import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { destinoSeguro, entrarComMicrosoft, obterSessao } from "@/lib/auth-client";
import { entrarComSenha } from "@/lib/auth-senha";

const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
  // Erro devolvido pela Microsoft/Supabase quando o login falha.
  error_description: z.string().optional().catch(undefined),
});

const formExternoSchema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
  senha: z.string().min(1, "Informe a senha."),
});

export const Route = createFileRoute("/auth")({
  // A sessão fica no navegador, então a checagem não pode rodar no SSR.
  ssr: false,
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Login — Bernhoeft" },
      { name: "description", content: "Acesso ao Sistema de Auditoria da Bernhoeft: conta Microsoft corporativa ou acesso externo." },
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
  const navigate = useNavigate();
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

  // Acesso externo: e-mail e senha. Depois do login, o layout protegido decide
  // se o usuário vai ao destino ou antes à troca de senha provisória.
  const formExterno = useForm<z.infer<typeof formExternoSchema>>({
    resolver: zodResolver(formExternoSchema),
    defaultValues: { email: "", senha: "" },
  });
  const loginExterno = useMutation({
    mutationFn: ({ email, senha }: z.infer<typeof formExternoSchema>) => entrarComSenha(email, senha),
    onSuccess: () => navigate({ href: destinoSeguro(destino) }),
  });
  const errosExterno = formExterno.formState.errors;

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

          <div className="flex items-center gap-3 pt-1" role="separator" aria-label="ou">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Acesso externo</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            className="space-y-3"
            onSubmit={formExterno.handleSubmit((dados) => loginExterno.mutate(dados))}
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                placeholder="seu@email.com"
                aria-invalid={Boolean(errosExterno.email)}
                {...formExterno.register("email")}
              />
              {errosExterno.email && <p className="text-xs text-destructive">{errosExterno.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-senha">Senha</Label>
              <Input
                id="login-senha"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errosExterno.senha)}
                {...formExterno.register("senha")}
              />
              {errosExterno.senha && <p className="text-xs text-destructive">{errosExterno.senha.message}</p>}
            </div>
            {loginExterno.isError && (
              <p role="alert" className="text-center text-sm text-destructive">
                {loginExterno.error.message}
              </p>
            )}
            <Button type="submit" variant="outline" className="w-full" disabled={loginExterno.isPending}>
              {loginExterno.isPending ? "Entrando…" : "Entrar com e-mail e senha"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Para auditores externos. O acesso é criado por um analista da Bernhoeft.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
