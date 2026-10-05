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
