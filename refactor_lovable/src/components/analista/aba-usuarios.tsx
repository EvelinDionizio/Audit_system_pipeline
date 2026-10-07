import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Copy, KeyRound, Plus, RefreshCw, ShieldOff, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Estado } from "@/components/estado";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  criarAcessoExternoFn,
  redefinirMfaExternoFn,
  redefinirSenhaExternoFn,
} from "@/lib/acesso-externo.functions";
import {
  type UsuarioPainel,
  autorizarUsuario,
  definirAtivo,
  listarInativos,
  removerAutorizacao,
  usuariosQuery,
} from "@/lib/analista.functions";
import { fmtDataBR } from "@/lib/format";
import { Filtros, Tabela, campoCls, textoErro } from "./ui";

type Confirmacao = { tipo: "perfil" | "remover" | "mfa"; usuario: UsuarioPainel } | null;

const formSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome."),
  email: z.string().trim().email("E-mail inválido."),
  perfil: z.enum(["auditor", "analista"]),
});
type FormUsuario = z.infer<typeof formSchema>;

const formExternoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome."),
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
});
type FormExterno = z.infer<typeof formExternoSchema>;

/** Senha temporária recém-gerada: só existe em memória, até o analista fechar o aviso. */
type SenhaGerada = { nome: string; email: string; senha: string; motivo: "criado" | "redefinida" };

export function AbaUsuarios({ onTotal }: { onTotal: (total: number) => void }) {
  const queryClient = useQueryClient();
  const consulta = useQuery(usuariosQuery());
  const [modal, setModal] = useState<FormUsuario | null>(null);
  const [inativosAberto, setInativosAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);
  const [novoExterno, setNovoExterno] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<SenhaGerada | null>(null);

  useEffect(() => {
    if (consulta.data) onTotal(consulta.data.length);
  }, [consulta.data, onTotal]);

  const aoTerminar = {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usuariosQuery().queryKey }),
    onError: (e: Error) => toast.error(e.message),
  };
  const autorizar = useMutation({ mutationFn: (u: FormUsuario) => autorizarUsuario({ data: u }), ...aoTerminar });
  const ativar = useMutation({
    mutationFn: (v: { profileId: string; ativo: boolean }) => definirAtivo({ data: v }),
    ...aoTerminar,
  });
  const remover = useMutation({ mutationFn: (email: string) => removerAutorizacao({ data: { email } }), ...aoTerminar });
  const criarExterno = useMutation({
    mutationFn: (dados: FormExterno) => criarAcessoExternoFn({ data: dados }),
    onSuccess: ({ senhaTemporaria }, dados) => {
      setNovoExterno(false);
      setSenhaGerada({ nome: dados.nome, email: dados.email.toLowerCase(), senha: senhaTemporaria, motivo: "criado" });
      void queryClient.invalidateQueries({ queryKey: usuariosQuery().queryKey });
    },
  });
  const redefinirSenha = useMutation({
    mutationFn: (u: UsuarioPainel) => redefinirSenhaExternoFn({ data: { email: u.email } }),
    onSuccess: ({ senhaTemporaria }, u) => {
      setSenhaGerada({ nome: u.nome, email: u.email, senha: senhaTemporaria, motivo: "redefinida" });
      void queryClient.invalidateQueries({ queryKey: usuariosQuery().queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const redefinirMfa = useMutation({
    mutationFn: (u: UsuarioPainel) => redefinirMfaExternoFn({ data: { email: u.email } }),
    onSuccess: ({ removidos }, u) =>
      toast.success(
        removidos > 0
          ? `MFA de ${u.nome} redefinido. Ele cadastra o autenticador de novo no próximo login.`
          : `${u.nome} ainda não tinha autenticador cadastrado.`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  function confirmar() {
    if (!confirmacao) return;
    const { tipo, usuario: u } = confirmacao;
    setConfirmacao(null);
    if (tipo === "remover") {
      remover.mutate(u.email);
    } else if (tipo === "mfa") {
      redefinirMfa.mutate(u);
    } else {
      autorizar.mutate({ nome: u.nome, email: u.email, perfil: u.perfil === "analista" ? "auditor" : "analista" });
    }
  }

  return (
    <>
      <Filtros>
        <Button variant="success" size="sm" onClick={() => setModal({ nome: "", email: "", perfil: "auditor" })}>
          <Plus strokeWidth={2.5} /> Autorizar usuário
        </Button>
        <Button size="sm" onClick={() => setNovoExterno(true)}>
          <UserPlus /> Novo acesso externo
        </Button>
        <Button variant="warning" size="sm" onClick={() => setInativosAberto(true)}>
          <Clock /> Inativos
        </Button>
        <Button size="sm" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
          <RefreshCw /> Atualizar
        </Button>
      </Filtros>

      <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-[13px] text-secondary-foreground">
        Colaboradores entram com a conta Microsoft da Bernhoeft: autorize o e-mail e o perfil, e a pessoa entra no
        primeiro login. Quem logar sem autorização aparece aqui como “Não autorizado”. Auditores externos (e-mail
        pessoal) entram com e-mail e senha: use “Novo acesso externo”, que gera uma senha temporária para você
        repassar; a pessoa é obrigada a trocá-la no primeiro acesso.
      </p>

      {consulta.isError ? (
        <Estado>{textoErro(consulta.error)}</Estado>
      ) : consulta.isPending ? (
        <Estado carregando />
      ) : consulta.data.length === 0 ? (
        <Estado>Nenhum usuário.</Estado>
      ) : (
        <Tabela
          cabecalhos={[{ t: "Nome" }, { t: "E-mail" }, { t: "Perfil" }, { t: "Status" }, { t: "Último acesso" }, { t: "Ações" }]}
        >
          {consulta.data.map((u) => (
            <tr key={u.email}>
              <td className="font-semibold">{u.nome}</td>
              <td className="text-xs text-muted-foreground">{u.email}</td>
              <td>
                <div className="flex flex-wrap items-center gap-1">
                  {u.perfil ? (
                    <Badge variant={u.perfil === "analista" ? "info" : "success"}>{u.perfil}</Badge>
                  ) : (
                    "—"
                  )}
                  {u.tipo_acesso === "senha" && <Badge variant="neutral">Externo</Badge>}
                </div>
              </td>
              <td>
                <StatusUsuario usuario={u} />
              </td>
              <td className="text-xs text-muted-foreground">
                {u.ultimo_acesso ? fmtDataBR(u.ultimo_acesso) : "Nunca"}
              </td>
              <td>
                <div className="flex flex-wrap gap-1.5">
                  {u.tipo_acesso === "senha" ? (
                    // Externo: sempre auditor e com senha própria. Sem trocar perfil nem
                    // remover o pré-cadastro; para cortar o acesso, desative.
                    <>
                      {u.profileId && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={ativar.isPending}
                          onClick={() => ativar.mutate({ profileId: u.profileId as string, ativo: !u.ativo })}
                        >
                          {u.ativo ? "Desativar" : "Ativar"}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={redefinirSenha.isPending}
                        onClick={() => redefinirSenha.mutate(u)}
                      >
                        <KeyRound /> Redefinir senha
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={redefinirMfa.isPending}
                        onClick={() => setConfirmacao({ tipo: "mfa", usuario: u })}
                      >
                        <ShieldOff /> Redefinir MFA
                      </Button>
                    </>
                  ) : !u.autorizado ? (
                    <Button
                      variant="success"
                      size="xs"
                      onClick={() => setModal({ nome: u.nome, email: u.email, perfil: "auditor" })}
                    >
                      Autorizar
                    </Button>
                  ) : (
                    <>
                      {u.profileId && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={ativar.isPending}
                          onClick={() => ativar.mutate({ profileId: u.profileId as string, ativo: !u.ativo })}
                        >
                          {u.ativo ? "Desativar" : "Ativar"}
                        </Button>
                      )}
                      <Button variant="secondary" size="xs" onClick={() => setConfirmacao({ tipo: "perfil", usuario: u })}>
                        {u.perfil === "analista" ? "→ Auditor" : "→ Analista"}
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        className="text-destructive"
                        onClick={() => setConfirmacao({ tipo: "remover", usuario: u })}
                      >
                        Remover acesso
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <ModalUsuario
        inicial={modal}
        salvando={autorizar.isPending}
        onFechar={() => setModal(null)}
        onSalvar={(u) => autorizar.mutate(u, { onSuccess: () => setModal(null) })}
      />
      <ModalInativos aberto={inativosAberto} onFechar={() => setInativosAberto(false)} />
      <ModalNovoExterno
        aberto={novoExterno}
        salvando={criarExterno.isPending}
        erro={criarExterno.isError ? criarExterno.error.message : null}
        onFechar={() => {
          setNovoExterno(false);
          criarExterno.reset();
        }}
        onSalvar={(dados) => criarExterno.mutate(dados)}
      />
      <ModalSenhaTemporaria dados={senhaGerada} onFechar={() => setSenhaGerada(null)} />

      <AlertDialog open={confirmacao !== null} onOpenChange={(aberto) => !aberto && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "remover"
                ? "Remover acesso"
                : confirmacao?.tipo === "mfa"
                  ? "Redefinir MFA"
                  : "Trocar perfil"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "remover"
                ? `Remover o acesso de ${confirmacao.usuario.nome}? A conta fica desativada até ser autorizada de novo.`
                : confirmacao?.tipo === "mfa"
                  ? `Remover o autenticador de ${confirmacao.usuario.nome}? Use só depois de confirmar a identidade da pessoa (por exemplo, por telefone). No próximo login ela cadastra um autenticador novo.`
                  : confirmacao &&
                  `Trocar ${confirmacao.usuario.nome} de ${confirmacao.usuario.perfil} para ${
                    confirmacao.usuario.perfil === "analista" ? "auditor" : "analista"
                  }?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusUsuario({ usuario: u }: { usuario: UsuarioPainel }) {
  if (!u.autorizado) return <Badge variant="destructive">Não autorizado</Badge>;
  if (!u.profileId) return <Badge variant="neutral">Aguardando 1º acesso</Badge>;
  if (!u.ativo) return <Badge variant="destructive">Inativo</Badge>;
  if (u.deve_trocar_senha) return <Badge variant="warning">Senha provisória</Badge>;
  if (u.senha_vencida) return <Badge variant="warning">Senha vencida</Badge>;
  return <Badge variant="success">Ativo</Badge>;
}

function ModalNovoExterno({
  aberto,
  salvando,
  erro,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  salvando: boolean;
  erro: string | null;
  onFechar: () => void;
  onSalvar: (dados: FormExterno) => void;
}) {
  const form = useForm<FormExterno>({
    resolver: zodResolver(formExternoSchema),
    defaultValues: { nome: "", email: "" },
  });

  useEffect(() => {
    if (aberto) form.reset({ nome: "", email: "" });
  }, [aberto, form]);

  const erros = form.formState.errors;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base text-primary">Novo acesso externo</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Cria a conta nominal de um auditor externo, com perfil de auditor. O sistema gera uma senha temporária que
          você repassa à pessoa; ela precisará trocá-la no primeiro acesso.
        </p>
        <form id="form-externo" className="space-y-3.5" onSubmit={form.handleSubmit(onSalvar)} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="ext-nome">Nome completo</Label>
            <Input id="ext-nome" aria-invalid={Boolean(erros.nome)} {...form.register("nome")} />
            {erros.nome && <p className="text-xs text-destructive">{erros.nome.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-email">E-mail (o que a pessoa usará para entrar)</Label>
            <Input
              id="ext-email"
              type="email"
              placeholder="pessoa@email.com"
              aria-invalid={Boolean(erros.email)}
              {...form.register("email")}
            />
            {erros.email && <p className="text-xs text-destructive">{erros.email.message}</p>}
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" form="form-externo" disabled={salvando}>
            {salvando ? "Criando…" : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mostra a senha temporária uma única vez; não há como recuperá-la depois (só redefinir). */
function ModalSenhaTemporaria({ dados, onFechar }: { dados: SenhaGerada | null; onFechar: () => void }) {
  const [copiada, setCopiada] = useState(false);

  useEffect(() => {
    setCopiada(false);
  }, [dados]);

  function copiar() {
    if (!dados) return;
    void navigator.clipboard.writeText(dados.senha).then(() => setCopiada(true));
  }

  return (
    <Dialog open={dados !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base text-primary">
            {dados?.motivo === "redefinida" ? "Senha redefinida" : "Acesso externo criado"}
          </DialogTitle>
        </DialogHeader>
        {dados && (
          <div className="space-y-3 text-[13px]">
            <p>
              <strong>{dados.nome}</strong> ({dados.email}) entra com e-mail e senha em “Acesso externo”, na tela de
              login.
            </p>
            <div>
              <Label className="mb-1.5 block">Senha temporária</Label>
              <div className="flex items-center gap-2">
                <code
                  data-testid="senha-temporaria"
                  className="flex-1 select-all rounded-md border bg-muted px-3 py-2 font-mono text-base tracking-wider"
                >
                  {dados.senha}
                </code>
                <Button variant="outline" size="sm" onClick={copiar}>
                  {copiada ? <Check /> : <Copy />} {copiada ? "Copiada" : "Copiar"}
                </Button>
              </div>
            </div>
            <p role="alert" className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-warning">
              Copie agora: esta senha <strong>não será mostrada de novo</strong>. Repasse por um canal seguro. No
              primeiro acesso, a pessoa será obrigada a escolher uma senha só dela.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onFechar}>Já copiei, fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalUsuario({
  inicial,
  salvando,
  onFechar,
  onSalvar,
}: {
  inicial: FormUsuario | null;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (u: FormUsuario) => void;
}) {
  const form = useForm<FormUsuario>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome: "", email: "", perfil: "auditor" },
  });

  useEffect(() => {
    if (inicial) form.reset(inicial);
  }, [inicial, form]);

  const erros = form.formState.errors;

  return (
    <Dialog open={inicial !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base text-primary">Autorizar usuário</DialogTitle>
        </DialogHeader>
        <form id="form-usuario" className="space-y-3.5" onSubmit={form.handleSubmit(onSalvar)} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="u-nome">Nome completo</Label>
            <Input id="u-nome" placeholder="Nome do usuário" aria-invalid={Boolean(erros.nome)} {...form.register("nome")} />
            {erros.nome && <p className="text-xs text-destructive">{erros.nome.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">E-mail Microsoft</Label>
            <Input
              id="u-email"
              type="email"
              placeholder="nome@bernhoeft.com.br"
              aria-invalid={Boolean(erros.email)}
              {...form.register("email")}
            />
            {erros.email && <p className="text-xs text-destructive">{erros.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-perfil">Perfil</Label>
            <select id="u-perfil" className={`${campoCls} w-full`} {...form.register("perfil")}>
              <option value="auditor">Auditor — acessa a revisão de campo</option>
              <option value="analista">Analista — acessa o painel e a gestão</option>
            </select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" form="form-usuario" disabled={salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalInativos({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [dias, setDias] = useState("90");
  const busca = useMutation({ mutationFn: (n: number) => listarInativos({ data: { dias: n } }) });
  const { reset } = busca;

  // Limpa o resultado anterior a cada abertura.
  useEffect(() => {
    if (aberto) reset();
  }, [aberto, reset]);

  function buscar() {
    const n = Number.parseInt(dias, 10);
    if (!Number.isNaN(n) && n >= 0) busca.mutate(n);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-[480px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base text-primary">Usuários inativos</DialogTitle>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="dias-inativos">Sem acesso há quantos dias?</Label>
            <Input
              id="dias-inativos"
              type="number"
              min={0}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
            />
          </div>
          <Button onClick={buscar} disabled={busca.isPending}>Buscar</Button>
        </div>
        {busca.isError && <p className="text-[13px] text-destructive">{busca.error.message}</p>}
        {busca.data &&
          (busca.data.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhum usuário sem acesso há {dias} dias ou mais.</p>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {busca.data.map((u) => (
                <li key={u.id}>
                  • <strong>{u.nome}</strong> ({u.perfil ?? "sem perfil"}) — {u.dias_inativo} dias — Último acesso:{" "}
                  {u.ultimo_acesso ? fmtDataBR(u.ultimo_acesso) : "Nunca acessou"}
                </li>
              ))}
            </ul>
          ))}
      </DialogContent>
    </Dialog>
  );
}
