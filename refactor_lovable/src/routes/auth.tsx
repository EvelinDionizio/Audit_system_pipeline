import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
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
import {
  destinoSeguro,
  entrarComMicrosoft,
  entrarComSenha,
  loginTesteHabilitado,
  obterSessao,
} from "@/lib/auth-client";

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
          {loginTesteHabilitado && <LoginTeste destino={destinoSeguro(destino)} />}
        </CardContent>
      </Card>
    </main>
  );
}

/** Só no ambiente local (VITE_LOGIN_TESTE=true): login dos usuários de teste. */
function LoginTeste({ destino }: { destino: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await entrarComSenha(email.trim(), senha);
      await navigate({ href: destino });
    } catch {
      setErro("E-mail ou senha incorretos.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3 border-t pt-4">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Ambiente local — usuário de teste
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="email-teste">E-mail</Label>
        <Input id="email-teste" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="senha-teste">Senha</Label>
        <Input id="senha-teste" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" className="w-full" disabled={enviando || !email || !senha}>
        {enviando ? "Entrando…" : "Entrar com usuário de teste"}
      </Button>
      {erro && (
        <p role="alert" className="text-center text-sm text-destructive">
          {erro}
        </p>
      )}
    </form>
  );
}
