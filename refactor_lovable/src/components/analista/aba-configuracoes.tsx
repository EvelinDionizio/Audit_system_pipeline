import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
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
import { supabase } from "@/integrations/supabase/client";
import { configItensQuery, regraItemSchema, salvarConfigItem } from "@/lib/analista.functions";
import { MODO_DEMO } from "@/lib/auth-client";
import { fmtDataHoraBR } from "@/lib/format";
import { indexarNorma, listarNormas, removerNorma } from "@/lib/normas.functions";
import { Filtros, SecTitulo, Tabela, campoCls, textoErro } from "./ui";

type Regra = z.infer<typeof regraItemSchema>;
const REGRA_VAZIA: Regra = {
  checklist_id: "",
  item_nome: "",
  validacao_tipo: "sugestao",
  habilitado: true,
  exige_imagem: false,
};

export function AbaConfiguracoes() {
  return (
    <>
      <RegrasDeItens />
      <NormasIndexadas />
    </>
  );
}


// ── Regras de itens (substitui /api/config-itens) ────────────────────────────

function RegrasDeItens() {
  const queryClient = useQueryClient();
  const consulta = useQuery(configItensQuery());
  const [editando, setEditando] = useState<Regra | null>(null);
  const salvar = useMutation({
    mutationFn: (regra: Regra) => salvarConfigItem({ data: regra }),
    onSuccess: () => {
      setEditando(null);
      void queryClient.invalidateQueries({ queryKey: configItensQuery().queryKey });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Filtros>
        <Button variant="success" size="sm" onClick={() => setEditando({ ...REGRA_VAZIA })}>
          <Plus strokeWidth={2.5} /> Nova regra
        </Button>
        <Button size="sm" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
          <RefreshCw /> Atualizar
        </Button>
      </Filtros>

      <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-[13px] text-secondary-foreground">
        Configure como a IA deve tratar cada item do checklist: <strong>Obrigatório</strong> (correção exigida) ou{" "}
        <strong>Sugestão</strong> (apenas alerta), se o item é processado e se exige evidência por imagem. O ID pode ser
        o do modelo de checklist (vale para todas as aplicações) ou o número de uma aplicação específica.
      </p>

      {consulta.isError ? (
        <Estado>{textoErro(consulta.error)}</Estado>
      ) : consulta.isPending ? (
        <Estado carregando />
      ) : consulta.data.length === 0 ? (
        <Estado>
          Nenhuma regra configurada ainda.
          <br />
          <span className="text-xs">Clique em “Nova regra” para configurar como a IA deve tratar cada item.</span>
        </Estado>
      ) : (
        <Tabela
          cabecalhos={[
            { t: "Checklist ID" },
            { t: "Item" },
            { t: "Validação IA" },
            { t: "Status" },
            { t: "Imagem", alinhar: "center" },
            { t: "Ação" },
          ]}
        >
          {consulta.data.map((it) => (
            <tr key={it.id}>
              <td className="text-xs text-muted-foreground">{it.checklist_id}</td>
              <td className="font-medium">{it.item_nome}</td>
              <td>
                {it.validacao_tipo === "obrigatorio" ? (
                  <Badge variant="destructive">Obrigatório</Badge>
                ) : (
                  <Badge variant="warning">Sugestão</Badge>
                )}
              </td>
              <td className={it.habilitado ? "font-semibold text-success" : "font-semibold text-destructive"}>
                {it.habilitado ? "Ativo" : "Inativo"}
              </td>
              <td className="text-center">{it.exige_imagem ? "📷 Sim" : "—"}</td>
              <td>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setEditando({
                      checklist_id: it.checklist_id,
                      item_nome: it.item_nome,
                      habilitado: it.habilitado,
                      validacao_tipo: it.validacao_tipo === "obrigatorio" ? "obrigatorio" : "sugestao",
                      exige_imagem: it.exige_imagem,
                    })
                  }
                >
                  Editar
                </Button>
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <ModalRegra
        inicial={editando}
        salvando={salvar.isPending}
        onFechar={() => setEditando(null)}
        onSalvar={(r) => salvar.mutate(r)}
      />
    </>
  );
}

function ModalRegra({
  inicial,
  salvando,
  onFechar,
  onSalvar,
}: {
  inicial: Regra | null;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (r: Regra) => void;
}) {
  const form = useForm<Regra>({ resolver: zodResolver(regraItemSchema), defaultValues: REGRA_VAZIA });

  useEffect(() => {
    if (inicial) form.reset(inicial);
  }, [inicial, form]);

  const erros = form.formState.errors;
  // Selects de sim/não guardam boolean no formulário.
  const booleano = { setValueAs: (v: string | boolean) => v === true || v === "true" };

  return (
    <Dialog open={inicial !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base text-primary">Configurar regra de item</DialogTitle>
        </DialogHeader>
        <form id="form-regra" className="space-y-3.5" onSubmit={form.handleSubmit(onSalvar)} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="r-checklist">ID do checklist ou nº da aplicação</Label>
            <Input
              id="r-checklist"
              placeholder="Ex.: 619378 (modelo) ou 211829902 (aplicação)"
              aria-invalid={Boolean(erros.checklist_id)}
              {...form.register("checklist_id")}
            />
            {erros.checklist_id && <p className="text-xs text-destructive">{erros.checklist_id.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-item">Nome do item (como aparece no checklist)</Label>
            <Input
              id="r-item"
              placeholder="Ex.: A empresa possui alvará e cartão CNPJ?"
              aria-invalid={Boolean(erros.item_nome)}
              {...form.register("item_nome")}
            />
            {erros.item_nome && <p className="text-xs text-destructive">{erros.item_nome.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-tipo">Tipo de validação da IA</Label>
            <select id="r-tipo" className={`${campoCls} w-full`} {...form.register("validacao_tipo")}>
              <option value="sugestao">Sugestão — apenas alerta o auditor</option>
              <option value="obrigatorio">Obrigatório — correção exigida antes do envio</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-habilitado">Status</Label>
            <select id="r-habilitado" className={`${campoCls} w-full`} {...form.register("habilitado", booleano)}>
              <option value="true">Habilitado — IA processa este item</option>
              <option value="false">Desabilitado — IA ignora este item</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-imagem">Exige validação por imagem</Label>
            <select id="r-imagem" className={`${campoCls} w-full`} {...form.register("exige_imagem", booleano)}>
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" form="form-regra" disabled={salvando}>Salvar regra</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ── Normas do RAG (substitui index_norms.py) ─────────────────────────────────

function NormasIndexadas() {
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: ["analista", "normas"], queryFn: () => listarNormas() });
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const atualizarLista = () => queryClient.invalidateQueries({ queryKey: ["analista", "normas"] });

  async function enviar(arquivos: FileList) {
    const falhas: string[] = [];
    const lista = [...arquivos];
    for (const [i, arquivo] of lista.entries()) {
      setProgresso(`Indexando ${i + 1}/${lista.length}: ${arquivo.name}`);
      try {
        const { error } = await supabase.storage
          .from("normas")
          .upload(arquivo.name, arquivo, { upsert: true, contentType: "application/pdf" });
        if (error) throw new Error(error.message);
        await indexarNorma({ data: { caminho: arquivo.name } });
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setProgresso(null);
    if (arquivoRef.current) arquivoRef.current.value = "";
    void atualizarLista();
    if (falhas.length) {
      toast.warning(`${lista.length - falhas.length} indexada(s), ${falhas.length} com erro.`, {
        description: falhas.join("\n"),
      });
    } else {
      toast.success(`${lista.length} norma(s) indexada(s).`);
    }
  }

  const remover = useMutation({
    mutationFn: (fonte: string) => removerNorma({ data: { fonte } }),
    onSuccess: () => void atualizarLista(),
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <SecTitulo direita={consulta.data ? `${consulta.data.length} norma(s)` : undefined}>
        Normas para fundamentação (RAG)
      </SecTitulo>
      <Filtros>
        <input
          ref={arquivoRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && void enviar(e.target.files)}
        />
        {MODO_DEMO ? (
          // O envio usa o Storage do Supabase, que não existe na demonstração.
          <p className="text-[13px] text-muted-foreground">
            Na demonstração, as normas são indexadas pelo terminal: <code>bun run demo:normas</code>.
          </p>
        ) : (
          <Button variant="success" size="sm" disabled={progresso !== null} onClick={() => arquivoRef.current?.click()}>
            <FileUp /> {progresso ?? "Enviar PDFs"}
          </Button>
        )}
      </Filtros>

      {consulta.isError ? (
        <Estado>{textoErro(consulta.error)}</Estado>
      ) : consulta.isPending ? (
        <Estado carregando />
      ) : consulta.data.length === 0 ? (
        <Estado>
          Nenhuma norma indexada.
          <br />
          <span className="text-xs">Envie os PDFs das NRs para a IA citar os trechos nos pareceres.</span>
        </Estado>
      ) : (
        <Tabela
          cabecalhos={[
            { t: "Arquivo" },
            { t: "Páginas", alinhar: "right" },
            { t: "Trechos", alinhar: "right" },
            { t: "Indexada em" },
            { t: "Ação" },
          ]}
        >
          {consulta.data.map((n) => (
            <tr key={n.fonte}>
              <td className="font-medium">{n.fonte}</td>
              <td className="text-right">{n.paginas}</td>
              <td className="text-right">{n.total_chunks}</td>
              <td className="text-xs text-muted-foreground">{fmtDataHoraBR(n.indexado_em)}</td>
              <td>
                <Button variant="outline" size="xs" className="text-destructive" onClick={() => setRemovendo(n.fonte)}>
                  Remover
                </Button>
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <AlertDialog open={removendo !== null} onOpenChange={(aberto) => !aberto && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover norma</AlertDialogTitle>
            <AlertDialogDescription>
              Remover {removendo} e todos os seus trechos? A IA deixa de citá-la nos próximos pareceres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removendo) remover.mutate(removendo);
                setRemovendo(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
