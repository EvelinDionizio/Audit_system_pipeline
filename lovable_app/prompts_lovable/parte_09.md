Parte 9 de 11 — frontend. Crie os 3 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 9 recebida" com a lista de arquivos.

### `src/components/analista/AbaUsuarios.tsx`

````tsx
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
````
### `src/components/analista/AbaConfiguracoes.tsx`

````tsx
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { exigir } from "@/lib/api";
import type { ConfigItem } from "@/lib/types";
import { Estado } from "@/components/Estado";
import { BotaoAcao, BotaoAtualizar, Filtros, selectCls, Tabela } from "./ui";

type Rascunho = Omit<ConfigItem, "id">;
const VAZIO: Rascunho = { checklist_id: "", item_nome: "", validacao_tipo: "sugestao", habilitado: true, exige_imagem: false };

export function AbaConfiguracoes() {
  const [itens, setItens] = useState<ConfigItem[] | null>(null);
  const [erro, setErro] = useState(false);
  const [editando, setEditando] = useState<Rascunho | null>(null);

  const carregar = useCallback(async () => {
    setItens(null);
    setErro(false);
    try {
      setItens(exigir(await supabase.from("config_itens").select("*").order("checklist_id").order("item_nome")) as ConfigItem[]);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <>
      <Filtros>
        <BotaoAcao cor="verde" onClick={() => setEditando({ ...VAZIO })}>
          <Plus className="h-[13px] w-[13px]" strokeWidth={2.5} /> Nova regra
        </BotaoAcao>
        <BotaoAtualizar onClick={carregar} />
      </Filtros>

      <div className="mb-4 rounded-[10px] bg-bh-azul-lt px-4 py-3 text-[13px] text-bh-azul-md">
        Configure quais itens do checklist devem ser validados pela IA e como — como <strong>Obrigatório</strong> (correção exigida)
        ou <strong>Sugestão</strong> (apenas alerta). Itens desabilitados são ignorados pelo pipeline.
        Itens que exigem imagem são sinalizados na revisão quando estão sem anexos.
        O ID pode ser o do modelo de checklist (vale para todas as aplicações) ou o número de uma aplicação específica.
      </div>

      {erro ? (
        <Estado>Erro ao carregar.</Estado>
      ) : itens === null ? (
        <Estado carregando />
      ) : itens.length === 0 ? (
        <Estado>
          Nenhuma regra configurada ainda.<br />
          <span className="text-xs">Clique em "Nova regra" para configurar como a IA deve tratar cada item.</span>
        </Estado>
      ) : (
        <Tabela cabecalhos={[{ t: "Checklist ID" }, { t: "Item" }, { t: "Validação IA" }, { t: "Status" }, { t: "Imagem" }, { t: "Ação" }]}>
          {itens.map((it) => (
            <tr key={it.id}>
              <td className="text-xs text-bh-cinza">{it.checklist_id}</td>
              <td className="font-medium">{it.item_nome}</td>
              <td>
                {it.validacao_tipo === "obrigatorio"
                  ? <span className="rounded-[10px] bg-bh-vermelho-lt px-2 py-0.5 text-[11px] font-bold text-bh-vermelho">Obrigatório</span>
                  : <span className="rounded-[10px] bg-bh-amarelo-lt px-2 py-0.5 text-[11px] font-bold text-bh-amarelo">Sugestão</span>}
              </td>
              <td className={`text-[13px] font-semibold ${it.habilitado ? "text-bh-verde" : "text-bh-vermelho"}`}>{it.habilitado ? "Ativo" : "Inativo"}</td>
              <td className="text-center text-[13px]">{it.exige_imagem ? "📷 Sim" : "—"}</td>
              <td>
                <button type="button" onClick={() => setEditando({ ...it })}
                  className="rounded-[5px] border border-bh-borda bg-bh-cinza-lt px-2 py-[3px] text-[11px]">Editar</button>
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <ModalConfig rascunho={editando} onFechar={() => setEditando(null)} onSalvo={carregar} />
    </>
  );
}

function ModalConfig({ rascunho, onFechar, onSalvo }: { rascunho: Rascunho | null; onFechar: () => void; onSalvo: () => void }) {
  const { usuario } = useAuth();
  const [form, setForm] = useState<Rascunho>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (rascunho) { setForm(rascunho); setErro(null); }
  }, [rascunho]);

  async function salvar() {
    const checklist_id = form.checklist_id.trim();
    const item_nome = form.item_nome.trim();
    if (!checklist_id || !item_nome) return setErro("Preencha o ID do checklist e o nome do item.");
    const { error } = await supabase.from("config_itens").upsert(
      {
        checklist_id, item_nome,
        habilitado: form.habilitado,
        validacao_tipo: form.validacao_tipo,
        exige_imagem: form.exige_imagem,
        criado_por: usuario?.id,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "checklist_id,item_nome" },
    );
    if (error) return setErro(error.message);
    onFechar();
    onSalvo();
  }

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={rascunho !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle className="text-base text-bh-azul">Configurar regra de item</DialogTitle></DialogHeader>
        <div className="space-y-3.5">
          <div><Label className="mb-1.5 block text-xs font-semibold">ID do Checklist ou nº da aplicação</Label>
            <Input value={form.checklist_id} onChange={(e) => set("checklist_id", e.target.value)} placeholder="Ex: 619378 (modelo) ou 211829902 (aplicação)" /></div>
          <div><Label className="mb-1.5 block text-xs font-semibold">Nome do item (como aparece no checklist)</Label>
            <Input value={form.item_nome} onChange={(e) => set("item_nome", e.target.value)} placeholder="Ex: A empresa possui alvará e cartão CNPJ?" /></div>
          <div><Label className="mb-1.5 block text-xs font-semibold">Tipo de validação da IA</Label>
            <select className={`${selectCls} w-full`} value={form.validacao_tipo} onChange={(e) => set("validacao_tipo", e.target.value as Rascunho["validacao_tipo"])}>
              <option value="sugestao">Sugestão — apenas alerta o auditor</option>
              <option value="obrigatorio">Obrigatório — correção exigida antes do envio</option>
            </select></div>
          <div><Label className="mb-1.5 block text-xs font-semibold">Status</Label>
            <select className={`${selectCls} w-full`} value={form.habilitado ? "1" : "0"} onChange={(e) => set("habilitado", e.target.value === "1")}>
              <option value="1">Habilitado — IA processa este item</option>
              <option value="0">Desabilitado — IA ignora este item</option>
            </select></div>
          <div><Label className="mb-1.5 block text-xs font-semibold">Exige validação por imagem</Label>
            <select className={`${selectCls} w-full`} value={form.exige_imagem ? "1" : "0"} onChange={(e) => set("exige_imagem", e.target.value === "1")}>
              <option value="0">Não</option>
              <option value="1">Sim</option>
            </select></div>
          {erro && <p className="text-[13px] text-bh-vermelho">{erro}</p>}
        </div>
        <div className="mt-2 flex justify-end gap-2.5">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar}>Salvar regra</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
````
### `src/components/analista/AbaTokens.tsx`

````tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Estado } from "@/components/Estado";
import { BotaoAtualizar, Filtros, KpiCard, KpiGrid, selectCls, Tabela } from "./ui";

// Cotação fixa usada no original para a estimativa em reais
const USD_BRL = 6;

interface Resumo {
  total_chamadas: number | null;
  total_tokens: number | null;
  custo_total_usd: number | null;
  auditorias_processadas: number | null;
}
interface PorDia { dia: string; tokens: number | null; custo_usd: number | null; chamadas: number | null }

export function AbaTokens() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<{ resumo: Resumo; porDia: PorDia[] } | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setDados(null);
    setErro(false);
    const [r1, r2] = await Promise.all([
      supabase.rpc("resumo_uso_tokens", { dias }),
      supabase.rpc("uso_tokens_por_dia", { dias }),
    ]);
    if (r1.error || r2.error) return setErro(true);
    const resumo = (Array.isArray(r1.data) ? r1.data[0] : r1.data) ?? {};
    setDados({ resumo: resumo as Resumo, porDia: (r2.data ?? []) as PorDia[] });
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const r = dados?.resumo;
  const totalTokens = Number(r?.total_tokens) || 0;
  const custoUSD = Number(r?.custo_total_usd) || 0;

  return (
    <>
      <Filtros>
        <select className={selectCls} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <BotaoAtualizar onClick={carregar} />
      </Filtros>

      {erro ? (
        <Estado>Erro ao carregar.</Estado>
      ) : !dados ? (
        <Estado carregando />
      ) : (
        <>
          <KpiGrid>
            <KpiCard pequeno label="Total de tokens" valor={totalTokens.toLocaleString("pt-BR")} sub={`últimos ${dias} dias`} />
            <KpiCard pequeno label="Custo estimado" valor={`USD ${custoUSD.toFixed(4)}`} sub={`~R$ ${(custoUSD * USD_BRL).toFixed(2)}`} cor="text-bh-verde" />
            <KpiCard pequeno label="Auditorias com IA" valor={Number(r?.auditorias_processadas) || 0} sub="revisões processadas" />
            <KpiCard pequeno label="Chamadas à API" valor={Number(r?.total_chamadas) || 0} sub="total de requisições" />
          </KpiGrid>

          {dados.porDia.length === 0 ? (
            <Estado>
              Nenhum uso registrado neste período.<br />
              <span className="text-xs">O registro começa após a primeira revisão com a API ativa.</span>
            </Estado>
          ) : (
            <Tabela cabecalhos={[{ t: "Dia" }, { t: "Tokens", alinhar: "right" }, { t: "Chamadas", alinhar: "right" }, { t: "Custo", alinhar: "right" }]}>
              {dados.porDia.map((d) => (
                <tr key={d.dia}>
                  <td>{d.dia}</td>
                  <td className="text-right">{(Number(d.tokens) || 0).toLocaleString("pt-BR")}</td>
                  <td className="text-right">{d.chamadas || 0}</td>
                  <td className="text-right font-semibold text-bh-verde">USD {(Number(d.custo_usd) || 0).toFixed(4)}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}
    </>
  );
}
````
