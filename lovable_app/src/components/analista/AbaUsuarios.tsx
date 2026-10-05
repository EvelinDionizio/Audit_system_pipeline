import { useCallback, useEffect, useState } from "react";
import { Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { exigir, invocar } from "@/lib/api";
import { fmtDataBR } from "@/lib/format";
import { validarForcaSenha } from "@/lib/senha";
import type { Perfil, Usuario, UsuarioInativo } from "@/lib/types";
import { Estado } from "@/components/Estado";
import { BotaoAcao, BotaoAtualizar, Filtros, selectCls, Tabela } from "./ui";

type Confirmacao = { tipo: "perfil" | "excluir"; usuario: Usuario } | null;

export function AbaUsuarios({ onTotal }: { onTotal: (n: number) => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState(false);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalInativos, setModalInativos] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);

  const carregar = useCallback(async () => {
    setUsuarios(null);
    setErro(false);
    try {
      const rows = exigir(
        await supabase
          .from("profiles")
          .select("id, nome, email, ativo, ultimo_acesso, senha_alterada_em, user_roles(role)")
          .order("nome"),
      ) as (Omit<Usuario, "perfil"> & { user_roles: { role: Perfil } | { role: Perfil }[] | null })[];
      const lista = rows.map(({ user_roles, ...u }) => ({
        ...u,
        perfil: (Array.isArray(user_roles) ? user_roles[0]?.role : user_roles?.role) ?? "auditor",
      }));
      setUsuarios(lista);
      onTotal(lista.length);
    } catch {
      setErro(true);
    }
  }, [onTotal]);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(corpo: Record<string, unknown>, msgErro: string) {
    try {
      await invocar("admin-usuarios", corpo);
      carregar();
    } catch (e) {
      toast.error((e as Error).message || msgErro);
    }
  }

  async function confirmar() {
    if (!confirmacao) return;
    const { tipo, usuario: u } = confirmacao;
    setConfirmacao(null);
    if (tipo === "perfil") {
      await acao({ acao: "perfil", uid: u.id, perfil: u.perfil === "analista" ? "auditor" : "analista" }, "Erro ao alterar perfil.");
    } else {
      await acao({ acao: "excluir", uid: u.id }, "Erro ao excluir usuário.");
    }
  }

  const btnMini = "rounded-[5px] border px-[7px] py-[3px] text-[11px]";

  return (
    <>
      <Filtros>
        <BotaoAcao cor="verde" onClick={() => setModalNovo(true)}>
          <Plus className="h-[13px] w-[13px]" strokeWidth={2.5} /> Novo usuário
        </BotaoAcao>
        <BotaoAcao cor="amarelo" onClick={() => setModalInativos(true)} title="Ver usuários inativos">
          <Clock className="h-[13px] w-[13px]" /> Inativos
        </BotaoAcao>
        <BotaoAtualizar onClick={carregar} />
      </Filtros>

      {erro ? (
        <Estado>Erro.</Estado>
      ) : usuarios === null ? (
        <Estado carregando />
      ) : usuarios.length === 0 ? (
        <Estado>Nenhum usuário.</Estado>
      ) : (
        <Tabela cabecalhos={[{ t: "Nome" }, { t: "E-mail" }, { t: "Perfil" }, { t: "Status" }, { t: "Último acesso" }, { t: "Ações" }]}>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.nome}</td>
              <td className="text-xs text-bh-cinza">{u.email}</td>
              <td>
                <span className={`rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${u.perfil === "analista" ? "bg-bh-azul-lt text-bh-azul" : "bg-bh-verde-lt text-bh-verde"}`}>
                  {u.perfil}
                </span>
              </td>
              <td className={`text-[13px] font-semibold ${u.ativo ? "text-bh-verde" : "text-bh-vermelho"}`}>{u.ativo ? "Ativo" : "Inativo"}</td>
              <td className="text-xs text-bh-cinza">{u.ultimo_acesso ? fmtDataBR(u.ultimo_acesso) : "Nunca"}</td>
              <td>
                <div className="flex flex-wrap gap-[5px]">
                  <button type="button" className={`${btnMini} border-bh-borda bg-bh-cinza-lt text-bh-texto`}
                    onClick={() => acao({ acao: "atualizar", uid: u.id, ativo: !u.ativo }, "Erro ao alterar status.")}>
                    {u.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button type="button" className={`${btnMini} border-bh-azul-lt bg-bh-azul-lt text-bh-azul-md`}
                    onClick={() => setConfirmacao({ tipo: "perfil", usuario: u })}>
                    {u.perfil === "analista" ? "→ Auditor" : "→ Analista"}
                  </button>
                  <button type="button" className={`${btnMini} border-red-200 bg-bh-vermelho-lt text-bh-vermelho`}
                    onClick={() => setConfirmacao({ tipo: "excluir", usuario: u })}>
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <ModalNovoUsuario aberto={modalNovo} onFechar={() => setModalNovo(false)} onCriado={carregar} />
      <ModalInativos aberto={modalInativos} onFechar={() => setModalInativos(false)} />

      <AlertDialog open={confirmacao !== null} onOpenChange={(v) => !v && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacao?.tipo === "excluir" ? "Excluir usuário" : "Trocar perfil"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "excluir"
                ? `Excluir permanentemente ${confirmacao.usuario.nome}? Esta ação não pode ser desfeita.`
                : confirmacao &&
                  `Trocar ${confirmacao.usuario.nome} de ${confirmacao.usuario.perfil} para ${confirmacao.usuario.perfil === "analista" ? "auditor" : "analista"}?`}
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

function ModalNovoUsuario({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("auditor");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) { setNome(""); setEmail(""); setSenha(""); setPerfil("auditor"); setErro(null); }
  }, [aberto]);

  async function salvar() {
    if (!nome.trim() || !email.trim() || !senha) return setErro("Preencha todos os campos.");
    const erroSenha = validarForcaSenha(senha);
    if (erroSenha) return setErro(erroSenha);
    setSalvando(true);
    try {
      await invocar("admin-usuarios", { acao: "criar", nome: nome.trim(), email: email.trim(), senha, perfil });
      onFechar();
      onCriado();
    } catch (e) {
      setErro((e as Error).message || "Erro.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle className="text-base text-bh-azul">Novo usuário</DialogTitle></DialogHeader>
        <div className="space-y-3.5">
          <div><Label className="mb-1.5 block text-xs font-semibold">Nome completo</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do usuário" /></div>
          <div><Label className="mb-1.5 block text-xs font-semibold">E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@bernhoeft.com.br" /></div>
          <div><Label className="mb-1.5 block text-xs font-semibold">Senha</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mín. 8, com maiúscula, minúscula e número" /></div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Perfil</Label>
            <select className={`${selectCls} w-full`} value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
              <option value="auditor">Auditor — acessa revisão de campo</option>
              <option value="analista">Analista — acessa painel e gestão</option>
            </select>
          </div>
          {erro && <p className="text-[13px] text-bh-vermelho">{erro}</p>}
        </div>
        <div className="mt-2 flex justify-end gap-2.5">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Criar usuário</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Substitui o prompt()/alert() do original — e usa a consulta que faltava no backend (/api/usuarios/inativos). */
function ModalInativos({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [dias, setDias] = useState("90");
  const [lista, setLista] = useState<UsuarioInativo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { if (aberto) { setLista(null); setErro(null); } }, [aberto]);

  async function buscar() {
    const n = parseInt(dias, 10);
    if (Number.isNaN(n)) return;
    setErro(null);
    const { data, error } = await supabase.rpc("listar_inativos", { dias: n });
    if (error) return setErro("Erro ao buscar inativos.");
    setLista((data ?? []) as UsuarioInativo[]);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-[480px] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base text-bh-azul">Usuários inativos</DialogTitle></DialogHeader>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="mb-1.5 block text-xs font-semibold">Inativos há mais de quantos dias?</Label>
            <Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
          </div>
          <Button onClick={buscar}>Buscar</Button>
        </div>
        {erro && <p className="text-[13px] text-bh-vermelho">{erro}</p>}
        {lista !== null && (lista.length === 0 ? (
          <p className="text-[13px] text-bh-cinza">Nenhum usuário inativo há mais de {dias} dias.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {lista.map((u) => (
              <li key={u.id}>
                • <strong>{u.nome}</strong> ({u.perfil}) — {u.dias_inativo} dias — Último acesso:{" "}
                {u.ultimo_acesso ? fmtDataBR(u.ultimo_acesso) : "Nunca acessou"}
              </li>
            ))}
          </ul>
        ))}
      </DialogContent>
    </Dialog>
  );
}
