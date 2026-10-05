import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BotaoSair } from "@/components/botao-sair";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alterarMinhaSenha } from "@/lib/acesso-externo.functions";
import { obterSessao } from "@/lib/auth-client";
import { meQueryKey, meQueryOptions } from "@/lib/auth.functions";
import { REGRAS_SENHA, validarSenha } from "@/lib/senha";
import { cn } from "@/lib/utils";

const formSchema = z
  .object({
    atual: z.string().min(1, "Informe a senha atual."),
    nova: z.string().superRefine((senha, ctx) => {
      const erro = validarSenha(senha);
      if (erro) ctx.addIssue({ code: "custom", message: erro });
    }),
    confirmar: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((v) => v.nova === v.confirmar, { path: ["confirmar"], message: "As senhas não coincidem." })
  .refine((v) => v.nova !== v.atual, { path: ["nova"], message: "A nova senha precisa ser diferente da atual." });

type Formulario = z.infer<typeof formSchema>;

export const Route = createFileRoute("/alterar-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Alterar senha — Bernhoeft" },
      { name: "description", content: "Troca de senha do acesso externo ao Sistema de Auditoria." },
      { property: "og:title", content: "Alterar senha — Bernhoeft" },
      { property: "og:description", content: "Troca de senha do acesso externo." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (!(await obterSessao())) {
      throw redirect({ to: "/auth" });
    }
    // Sempre busca de novo: a flag pode ter mudado desde o último carregamento.
    const me = await context.queryClient.fetchQuery({ ...meQueryOptions(), staleTime: 0 });
    // Quem entra pela Microsoft não tem senha própria no sistema.
    if (me.tipo_acesso !== "senha") {
      throw redirect({ to: "/" });
    }
    return { me };
  },
  component: PaginaAlterarSenha,
});

function PaginaAlterarSenha() {
  const { me } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<Formulario>({
    resolver: zodResolver(formSchema),
    defaultValues: { atual: "", nova: "", confirmar: "" },
  });
  const nova = form.watch("nova");
  const erros = form.formState.errors;

  const troca = useMutation({
    mutationFn: (dados: Formulario) => alterarMinhaSenha({ data: { atual: dados.atual, nova: dados.nova } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      toast.success("Senha alterada.");
      await navigate({ to: "/" });
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{me.deve_trocar_senha ? "Defina uma nova senha" : "Alterar senha"}</CardTitle>
          <CardDescription>
            {me.deve_trocar_senha
              ? "Você entrou com uma senha provisória. Por segurança, escolha uma senha só sua para continuar."
              : `Conta: ${me.email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3.5" onSubmit={form.handleSubmit((d) => troca.mutate(d))} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="senha-atual">Senha atual</Label>
              <Input
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(erros.atual)}
                {...form.register("atual")}
              />
              {erros.atual && <p className="text-xs text-destructive">{erros.atual.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha-nova">Nova senha</Label>
              <Input
                id="senha-nova"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(erros.nova)}
                {...form.register("nova")}
              />
              <ul className="space-y-0.5 pt-1" aria-label="Requisitos da senha">
                {REGRAS_SENHA.map((regra) => {
                  const ok = regra.ok(nova);
                  return (
                    <li
                      key={regra.id}
                      className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success" : "text-muted-foreground")}
                    >
                      {ok ? <Check className="size-3" /> : <Circle className="size-3" />}
                      {regra.rotulo}
                    </li>
                  );
                })}
              </ul>
              {erros.nova && nova.length > 0 && <p className="text-xs text-destructive">{erros.nova.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha-confirmar">Confirmar nova senha</Label>
              <Input
                id="senha-confirmar"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(erros.confirmar)}
                {...form.register("confirmar")}
              />
              {erros.confirmar && <p className="text-xs text-destructive">{erros.confirmar.message}</p>}
            </div>

            {troca.isError && (
              <p role="alert" className="text-sm text-destructive">
                {troca.error.message}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {me.deve_trocar_senha ? (
                <BotaoSair />
              ) : (
                <Button variant="outline" asChild>
                  <Link to="/">Cancelar</Link>
                </Button>
              )}
              <Button type="submit" disabled={troca.isPending}>
                {troca.isPending ? "Salvando…" : "Salvar nova senha"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
