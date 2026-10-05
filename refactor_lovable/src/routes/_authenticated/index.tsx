import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { Spinner } from "@/components/estado";
import { ResultadoRevisao } from "@/components/revisao/resultado-revisao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { revisarAuditoria } from "@/lib/revisao.functions";

const searchSchema = z.object({
  // "Revisar →" do painel do analista abre esta tela com ?id=
  id: z.coerce.number().int().positive().optional().catch(undefined),
});

const formSchema = z.object({
  numero: z
    .string()
    .trim()
    .min(1, "Digite o número da aplicação.")
    .regex(/^#?\d+$/, "Número inválido."),
});

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Revisão de Auditoria — Bernhoeft" },
      { name: "description", content: "Revisão técnica com IA das aplicações do Checklist Fácil." },
      { property: "og:title", content: "Revisão de Auditoria — Bernhoeft" },
      { property: "og:description", content: "Revisão técnica com IA das aplicações do Checklist Fácil." },
    ],
  }),
  component: PaginaRevisao,
});

function PaginaRevisao() {
  const { id } = Route.useSearch();
  const { me } = Route.useRouteContext();
  const resultadoRef = useRef<HTMLDivElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { numero: id ? String(id) : "" },
  });

  const revisao = useMutation({
    mutationFn: (evaluationId: number) => revisarAuditoria({ data: { evaluation_id: evaluationId } }),
  });

  useEffect(() => {
    if (revisao.data) resultadoRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [revisao.data]);

  const enviar = form.handleSubmit(({ numero }) => {
    revisao.mutate(Number.parseInt(numero.replace("#", ""), 10));
  });

  const erroCampo = form.formState.errors.numero?.message;

  return (
    <div className="min-h-screen">
      <AppHeader titulo="Revisão de Auditoria">
        {me.papel === "analista" && (
          <Button variant="header" size="sm" asChild>
            <Link to="/analista">Painel →</Link>
          </Button>
        )}
      </AppHeader>

      <main className="mx-auto max-w-[680px] space-y-4 px-4 pb-16 pt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] text-primary">Solicitar revisão</CardTitle>
            <CardDescription className="text-[13px]">
              No app do Checklist Fácil, acesse <strong>Detalhes do checklist</strong> e copie o número da{" "}
              <strong>Aplicação atual</strong> (ex: #123456789).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={enviar} className="flex gap-2.5 max-sm:flex-col" noValidate>
              <Input
                inputMode="numeric"
                autoFocus
                placeholder="123456789"
                aria-label="Número da aplicação"
                aria-invalid={Boolean(erroCampo)}
                className="h-11 flex-1 text-xl font-semibold tracking-[2px] text-primary"
                {...form.register("numero")}
              />
              <Button type="submit" size="lg" className="h-11" disabled={revisao.isPending}>
                <ClipboardList strokeWidth={2.5} /> Revisar
              </Button>
            </form>
            {erroCampo ? (
              <p role="alert" className="mt-2.5 text-xs text-destructive">{erroCampo}</p>
            ) : (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3" /> Digite apenas os números, sem o # inicial
              </p>
            )}
          </CardContent>
        </Card>

        {revisao.isError && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3.5 text-[13px] text-destructive">
            {revisao.error.message || "Erro na requisição."}
          </div>
        )}

        {revisao.isPending && (
          <div className="px-5 py-10 text-center">
            <Spinner className="mb-3.5" />
            <p className="text-sm text-muted-foreground">Analisando com IA…</p>
          </div>
        )}

        <div ref={resultadoRef}>
          {revisao.data && !revisao.isPending && (
            // Nova chave a cada revisão: reinicia filtros e categorias abertas.
            <ResultadoRevisao key={revisao.submittedAt} data={revisao.data} />
          )}
        </div>
      </main>
    </div>
  );
}
