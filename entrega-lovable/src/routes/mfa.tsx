import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BotaoSair } from "@/components/botao-sair";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obterSessao } from "@/lib/auth-client";
import { meQueryKey, meQueryOptions } from "@/lib/auth.functions";
import { confirmarCodigoTotp, fatorTotpVerificado, iniciarCadastroTotp } from "@/lib/mfa-client";

const formSchema = z.object({
  codigo: z
    .string()
    .transform((c) => c.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "O código tem 6 números.")),
});
type Formulario = z.input<typeof formSchema>;

export const Route = createFileRoute("/mfa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Verificação em duas etapas — Bernhoeft" },
      { name: "description", content: "Código do autenticador para o acesso externo ao Sistema de Auditoria." },
      { property: "og:title", content: "Verificação em duas etapas — Bernhoeft" },
      { property: "og:description", content: "Código do autenticador para o acesso externo." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (!(await obterSessao())) {
      throw redirect({ to: "/auth" });
    }
    // Sempre busca de novo: o estado muda assim que o código é confirmado.
    const me = await context.queryClient.fetchQuery({ ...meQueryOptions(), staleTime: 0 });
    if (me.tipo_acesso !== "senha" || !me.mfa_pendente) {
      throw redirect({ to: "/" });
    }
    // A senha provisória ou vencida vem primeiro.
    if (me.deve_trocar_senha) {
      throw redirect({ to: "/alterar-senha" });
    }
    return { me };
  },
  component: PaginaMfa,
});

function PaginaMfa() {
  // Já tem autenticador cadastrado? Então só pede o código; senão, cadastra primeiro.
  const fator = useQuery({
    queryKey: ["mfa", "fator"],
    queryFn: fatorTotpVerificado,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        {fator.isError ? (
          <>
            <CardHeader>
              <CardTitle>Verificação em duas etapas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {fator.error.message}
              </p>
              <div className="flex justify-between">
                <BotaoSair />
                <Button onClick={() => void fator.refetch()}>Tentar de novo</Button>
              </div>
            </CardContent>
          </>
        ) : fator.isPending ? (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent>
        ) : fator.data ? (
          <VerificarCodigo factorId={fator.data} />
        ) : (
          <CadastrarAutenticador />
        )}
      </Card>
    </main>
  );
}

/** Campo do código de 6 dígitos + botão, compartilhado entre cadastro e login. */
function FormularioCodigo({
  rotuloBotao,
  carregando,
  erro,
  onEnviar,
  rodape,
}: {
  rotuloBotao: string;
  carregando: boolean;
  erro: string | null;
  onEnviar: (codigo: string) => void;
  rodape: React.ReactNode;
}) {
  const form = useForm<Formulario>({ resolver: zodResolver(formSchema), defaultValues: { codigo: "" } });
  const erroCampo = form.formState.errors.codigo;

  return (
    <form
      className="space-y-3.5"
      onSubmit={form.handleSubmit((d) => onEnviar(formSchema.parse(d).codigo))}
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="mfa-codigo">Código de 6 dígitos</Label>
        <Input
          id="mfa-codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000000"
          autoFocus
          aria-invalid={Boolean(erroCampo)}
          {...form.register("codigo")}
        />
        {erroCampo && <p className="text-xs text-destructive">{erroCampo.message}</p>}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        {rodape}
        <Button type="submit" disabled={carregando}>
          {carregando ? "Verificando…" : rotuloBotao}
        </Button>
      </div>
    </form>
  );
}

/** Depois de confirmar: descarta o "me" antigo (ainda com mfa_pendente) e segue para o sistema. */
function useAoConfirmar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    queryClient.removeQueries({ queryKey: meQueryKey });
    toast.success("Verificação concluída.");
    await navigate({ to: "/" });
  };
}

function VerificarCodigo({ factorId }: { factorId: string }) {
  const aoConfirmar = useAoConfirmar();
  const verificar = useMutation({
    mutationFn: (codigo: string) => confirmarCodigoTotp(factorId, codigo),
    onSuccess: aoConfirmar,
  });

  return (
    <>
      <CardHeader>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <CardDescription>Digite o código que aparece no seu aplicativo autenticador.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioCodigo
          rotuloBotao="Entrar"
          carregando={verificar.isPending}
          erro={verificar.isError ? verificar.error.message : null}
          onEnviar={(codigo) => verificar.mutate(codigo)}
          rodape={<BotaoSair />}
        />
        <p className="pt-3 text-xs text-muted-foreground">
          Perdeu o acesso ao autenticador? Peça a um analista da Bernhoeft para redefinir o seu MFA.
        </p>
      </CardContent>
    </>
  );
}

function CadastrarAutenticador() {
  const aoConfirmar = useAoConfirmar();
  const cadastro = useMutation({ mutationFn: iniciarCadastroTotp });
  const confirmar = useMutation({
    mutationFn: (codigo: string) => confirmarCodigoTotp((cadastro.data as { factorId: string }).factorId, codigo),
    onSuccess: aoConfirmar,
  });

  if (!cadastro.data) {
    return (
      <>
        <CardHeader>
          <CardTitle>Ative a verificação em duas etapas</CardTitle>
          <CardDescription>
            O acesso externo exige um aplicativo autenticador (Microsoft Authenticator, Google Authenticator ou
            similar). Você vai usá-lo a cada login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cadastro.isError && (
            <p role="alert" className="text-sm text-destructive">
              {cadastro.error.message}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <BotaoSair />
            <Button onClick={() => cadastro.mutate()} disabled={cadastro.isPending}>
              {cadastro.isPending ? "Gerando…" : "Gerar QR code"}
            </Button>
          </div>
        </CardContent>
      </>
    );
  }

  return (
    <>
      <CardHeader>
        <CardTitle>Escaneie o QR code</CardTitle>
        <CardDescription>
          No aplicativo autenticador, adicione uma conta lendo o QR code e digite o código de 6 dígitos que ele mostrar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <img
          src={cadastro.data.qrCode}
          alt="QR code para cadastrar o autenticador"
          className="mx-auto size-48 rounded-md border bg-white p-2"
        />
        <p className="text-center text-xs text-muted-foreground">
          Sem câmera? Digite esta chave no aplicativo:
          <br />
          <code className="select-all break-all font-mono text-foreground">{cadastro.data.segredo}</code>
        </p>
        <FormularioCodigo
          rotuloBotao="Ativar e entrar"
          carregando={confirmar.isPending}
          erro={confirmar.isError ? confirmar.error.message : null}
          onEnviar={(codigo) => confirmar.mutate(codigo)}
          rodape={<BotaoSair />}
        />
      </CardContent>
    </>
  );
}
