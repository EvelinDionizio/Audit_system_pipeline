Parte 7 de 11 — frontend. Crie os 3 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 7 recebida" com a lista de arquivos.

### `src/components/revisao/ItemCard.tsx`

````tsx
import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ItemSugestao } from "@/lib/types";
import { limparMarkdown } from "@/lib/format";

export type TipoItem = "nc" | "sugestao" | "ok";

/**
 * Classificação do card — regra de htmlItem() do index.html original.
 * Com regra da aba Configurações, o tipo da regra decide (o backend já calculou `obrigatorio`).
 */
export function classificarItem(item: ItemSugestao): TipoItem {
  if (item.ia_desabilitada) return "ok";
  const temSugestao = !!item.sugestao && item.sugestao !== item.resposta_original;
  const isObrigatorio = item.regra_tipo
    ? item.obrigatorio === true
    : item.obrigatorio === true || (item.criticidade === "Mandatório" && temSugestao);
  return isObrigatorio ? "nc" : temSugestao || item.texto_campo ? "sugestao" : "ok";
}

const BORDA: Record<TipoItem, string> = {
  nc: "border-l-4 border-l-bh-vermelho",
  sugestao: "border-l-4 border-l-bh-amarelo",
  ok: "border-l-4 border-l-bh-verde",
};

const CRIT_BADGE: Record<string, string> = {
  "Mandatório": "bg-bh-vermelho-lt text-bh-vermelho",
  "Importantes": "bg-bh-amarelo-lt text-bh-amarelo",
};

function LabelMini({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mb-1 mt-2.5 text-[10px] font-bold uppercase tracking-wide text-bh-cinza first:mt-0 ${className}`}>{children}</div>;
}

export function ItemCard({ item }: { item: ItemSugestao }) {
  const tipo = classificarItem(item);
  const temSugestao = !!item.sugestao && item.sugestao !== item.resposta_original;
  const textoLimpo = limparMarkdown(item.texto_campo);
  const [copiado, setCopiado] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const semAnexo = item.exige_imagem && item.total_anexos === 0;

  async function registrarFeedback(aceita: boolean) {
    if (!item.sugestao_id) return;
    const { error } = await supabase.rpc("registrar_feedback_sugestao", { p_sugestao_id: item.sugestao_id, p_aceita: aceita });
    if (error) return toast.error("Não foi possível registrar o feedback.");
    setFeedback(aceita);
  }

  function copiarTexto() {
    navigator.clipboard.writeText(textoLimpo).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className={`mt-2 overflow-hidden rounded-[10px] border border-bh-borda bg-white shadow-sm ${BORDA[tipo]}`}>
      <div className="flex items-start justify-between gap-2 border-b border-bh-borda px-4 pb-2 pt-3">
        <div className="flex-1">
          <div className="mb-[3px]">
            {item.criticidade && (
              <span className={`rounded-xl px-[7px] py-0.5 text-[10px] font-semibold ${CRIT_BADGE[item.criticidade] ?? "bg-bh-azul-lt text-bh-azul-md"}`}>
                {item.criticidade}
              </span>
            )}
          </div>
          <div className="text-[13px] font-medium leading-snug text-bh-texto">{item.pergunta}</div>
        </div>
        {tipo === "nc" && <span className="shrink-0 whitespace-nowrap rounded px-2 py-[3px] text-[10px] font-bold bg-bh-vermelho-lt text-bh-vermelho">⚠ Obrigatório</span>}
        {tipo === "sugestao" && <span className="shrink-0 whitespace-nowrap rounded px-2 py-[3px] text-[10px] font-bold bg-bh-amarelo-lt text-bh-amarelo">💡 Sugestão</span>}
      </div>

      <div className="px-4 pb-3.5 pt-3">
        {item.ia_desabilitada && (
          <div className="mb-2.5 rounded-md bg-bh-cinza-lt px-2.5 py-1.5 text-[11px] text-bh-cinza">⏸ IA desabilitada para este item (aba Configurações)</div>
        )}
        {semAnexo && (
          <div className="mb-2.5 rounded-md border border-red-200 bg-bh-vermelho-lt px-2.5 py-1.5 text-[11px] font-semibold text-bh-vermelho">📷 Este item exige evidência fotográfica e não tem anexos</div>
        )}
        {item.resposta_original && (
          <>
            <LabelMini>Resposta original</LabelMini>
            <div className="whitespace-pre-wrap rounded-md bg-bh-cinza-lt px-2.5 py-2 text-[13px] leading-normal text-bh-cinza">{item.resposta_original}</div>
          </>
        )}

        {temSugestao && (
          <>
            <LabelMini>{tipo === "nc" ? "⚠ Correção obrigatória" : "💡 Recomendação da IA"}</LabelMini>
            <div className={`rounded-md border px-2.5 py-2 text-[13px] leading-normal text-bh-texto ${tipo === "nc" ? "border-red-200 bg-bh-vermelho-lt" : "border-green-200 bg-bh-verde-lt"}`}>
              {limparMarkdown(item.sugestao)}
            </div>
          </>
        )}

        {textoLimpo && (
          <>
            <LabelMini className="mt-2.5">
              📋 Texto sugerido para o campo
              <button
                type="button"
                onClick={copiarTexto}
                className={`ml-2 rounded border border-bh-borda bg-bh-cinza-lt px-[7px] py-0.5 text-[10px] ${copiado ? "text-bh-verde" : "text-bh-cinza"}`}
              >
                {copiado ? "Copiado!" : "Copiar"}
              </button>
            </LabelMini>
            <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[13px] italic leading-normal text-bh-texto">{textoLimpo}</div>
          </>
        )}

        {item.sugestao_id && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-bh-cinza">A sugestão foi útil?</span>
            <button
              type="button"
              onClick={() => registrarFeedback(true)}
              className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${feedback === true ? "border-bh-verde bg-bh-verde text-white" : "border-green-200 bg-bh-verde-lt text-bh-verde"}`}
            >
              ✓ Aceitar
            </button>
            <button
              type="button"
              onClick={() => registrarFeedback(false)}
              className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${feedback === false ? "border-bh-cinza bg-bh-cinza text-white" : "border-bh-borda bg-bh-cinza-lt text-bh-cinza"}`}
            >
              ✗ Ignorar
            </button>
          </div>
        )}

        {!temSugestao && !textoLimpo && !item.ia_desabilitada && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-bh-verde">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Resposta adequada
          </div>
        )}

        {item.justificativa && (
          <>
            <LabelMini>Fundamentação</LabelMini>
            <div className="rounded-md bg-bh-cinza-lt px-2.5 py-2 text-[13px] leading-normal text-bh-cinza">{limparMarkdown(item.justificativa)}</div>
          </>
        )}
      </div>
    </div>
  );
}
````
### `src/components/revisao/ResultadoRevisao.tsx`

````tsx
import { useMemo, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import type { ItemSugestao, ResultadoRevisao as Resultado } from "@/lib/types";
import { fmtPct, limparMarkdown, NIVEL_CLASSES } from "@/lib/format";
import { classificarItem, ItemCard, type TipoItem } from "./ItemCard";

type Filtro = "todos" | TipoItem;

const FILTRO_ATIVO: Record<Filtro, string> = {
  todos: "bg-bh-azul border-bh-azul text-white",
  nc: "bg-bh-vermelho border-bh-vermelho text-white",
  sugestao: "bg-bh-amarelo border-bh-amarelo text-white",
  ok: "bg-bh-verde border-bh-verde text-white",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${className}`}>{children}</span>;
}

export function ResultadoRevisao({ data }: { data: Resultado }) {
  const r = data.resumo;
  const itens = data.sugestoes?.itens ?? [];
  const parecer = data.sugestoes?.parecer ?? "";
  const nivel = r.nivel_conformidade ?? "sem_dados";
  const emAndamento = r.status === 2;

  const categorias = useMemo(() => {
    const mapa = new Map<string, ItemSugestao[]>();
    for (const item of itens) {
      const cat = item.categoria || "Geral";
      mapa.set(cat, [...(mapa.get(cat) ?? []), item]);
    }
    return [...mapa.entries()];
  }, [itens]);

  const [filtro, setFiltro] = useState<Filtro>("todos");
  // Acordeões com NC ou sugestão começam abertos
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(categorias.filter(([, its]) => its.some((i) => i.sugestao)).map(([c]) => c)),
  );
  const [copiado, setCopiado] = useState(false);

  // Contagens pela mesma classificação dos cards (no original eram calculadas por outra regra e podiam divergir do filtro)
  const totalNC = itens.filter((i) => classificarItem(i) === "nc").length;
  const totalSug = itens.filter((i) => classificarItem(i) === "sugestao").length;
  const totalOk = itens.filter((i) => classificarItem(i) === "ok").length;

  function aplicarFiltro(f: Filtro) {
    setFiltro(f);
    if (f !== "todos") {
      setAbertos((prev) => {
        const novo = new Set(prev);
        categorias.forEach(([cat, its]) => its.some((i) => classificarItem(i) === f) && novo.add(cat));
        return novo;
      });
    }
  }

  function alternar(cat: string) {
    setAbertos((prev) => {
      const novo = new Set(prev);
      novo.has(cat) ? novo.delete(cat) : novo.add(cat);
      return novo;
    });
  }

  function copiarParecer() {
    navigator.clipboard.writeText(limparMarkdown(parecer)).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const btnFiltro = (f: Filtro, rotulo: string) => (
    <button
      type="button"
      onClick={() => aplicarFiltro(f)}
      className={`rounded-full border-[1.5px] px-3 py-[5px] text-xs font-semibold transition ${
        filtro === f ? FILTRO_ATIVO[f] : "border-bh-borda bg-white text-bh-cinza hover:border-bh-azul-md hover:text-bh-azul-md"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div>
      {/* Score */}
      <div className="mb-4 flex items-center gap-5 rounded-[10px] border border-bh-borda bg-white px-5 py-4 max-[480px]:flex-col max-[480px]:text-center">
        <div className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-full border-4 text-xl font-bold ${NIVEL_CLASSES[nivel].borda} ${NIVEL_CLASSES[nivel].texto}`}>
          <span>{fmtPct(r.percentual_conformidade)}</span>
          <small className="mt-px text-[10px] font-medium">score</small>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-bh-azul">{data.checklist || "Auditoria"}</h3>
          <div className="mt-0.5 text-[13px] text-bh-cinza">
            {data.unidade} ·{" "}
            <span className={`rounded-xl px-2 py-0.5 text-[11px] font-semibold ${emAndamento ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
              {emAndamento ? "Em Andamento" : "Em Análise"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 max-[480px]:justify-center">
            <Pill className="bg-bh-vermelho-lt text-bh-vermelho">✗ {r.nao_conformes || 0} NC</Pill>
            <Pill className="bg-bh-amarelo-lt text-bh-amarelo">~ {r.parciais || 0} Parciais</Pill>
            <Pill className="bg-bh-verde-lt text-bh-verde">✓ {r.conformes || 0} Conformes</Pill>
            <span className="self-center text-[11px] text-bh-cinza">ID #{data.evaluation_id}</span>
          </div>
        </div>
      </div>

      {itens.length > 0 && (
        <>
          <div className="mb-2.5 mt-5 text-[11px] font-bold uppercase tracking-wider text-bh-cinza">Sugestões por item</div>
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {btnFiltro("todos", `Todos (${itens.length})`)}
            {btnFiltro("nc", `⚠ Obrigatório (${totalNC})`)}
            {btnFiltro("sugestao", `💡 Sugestão (${totalSug})`)}
            {btnFiltro("ok", `✓ Adequados (${totalOk})`)}
          </div>

          {categorias.map(([cat, its]) => {
            const visiveis = its.filter((i) => filtro === "todos" || classificarItem(i) === filtro);
            if (!visiveis.length) return null;
            const countNC = its.filter((i) => classificarItem(i) === "nc").length;
            const countSug = its.filter((i) => classificarItem(i) === "sugestao").length;
            const aberto = abertos.has(cat);
            return (
              <div key={cat} className="mb-2 overflow-hidden rounded-[10px] border border-bh-borda bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => alternar(cat)}
                  className="flex w-full items-center justify-between gap-2.5 px-4 py-3 text-left transition hover:bg-bh-cinza-lt"
                >
                  <span className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-bh-azul">{cat}</span>
                  <span className="flex items-center gap-2">
                    {countNC > 0 && <Pill className="bg-bh-vermelho-lt px-[7px] py-0.5 text-[10px] text-bh-vermelho">{countNC} NC</Pill>}
                    {countSug > 0 && <Pill className="bg-bh-amarelo-lt px-[7px] py-0.5 text-[10px] text-bh-amarelo">{countSug} sugestão</Pill>}
                    <span className="text-[11px] text-bh-cinza">{its.length} item(s)</span>
                  </span>
                  <span className={`shrink-0 text-[11px] text-bh-cinza transition-transform ${aberto ? "rotate-180" : ""}`}>▼</span>
                </button>
                {aberto && (
                  <div className="px-2.5 pb-2.5">
                    {visiveis.map((item, idx) => <ItemCard key={`${item.item_id ?? "x"}-${idx}`} item={item} />)}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {parecer && (
        <div className="mb-4 mt-4 rounded-[10px] border border-bh-borda bg-white p-5 shadow-sm">
          <h3 className="mb-3 border-b border-bh-borda pb-2.5 text-sm font-semibold text-bh-azul">Parecer técnico</h3>
          <div className="whitespace-pre-wrap text-[13px] leading-[1.7] text-bh-texto">{limparMarkdown(parecer)}</div>
          <button
            type="button"
            onClick={copiarParecer}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-bh-borda bg-bh-cinza-lt px-3 py-[7px] text-xs font-medium text-bh-cinza transition hover:bg-gray-200"
          >
            <Copy className="h-3 w-3" /> {copiado ? "Copiado!" : "Copiar parecer"}
          </button>
        </div>
      )}
    </div>
  );
}
````
### `src/components/analista/ui.tsx`

````tsx
// Peças visuais compartilhadas pelas abas do Painel do Analista.
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { NIVEL_CLASSES, nivelDoScore } from "@/lib/format";
import type { Nivel } from "@/lib/types";

export const selectCls =
  "cursor-pointer rounded-[7px] border border-bh-borda bg-white px-[11px] py-[7px] text-[13px] text-bh-texto outline-none";

export function Filtros({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2">{children}</div>;
}

export function BotaoAcao({
  onClick, children, cor = "azul", disabled, title,
}: { onClick: () => void; children: ReactNode; cor?: "azul" | "verde" | "amarelo"; disabled?: boolean; title?: string }) {
  const cores = {
    azul: "bg-bh-azul hover:bg-bh-azul-md",
    verde: "bg-bh-verde hover:bg-emerald-700",
    amarelo: "bg-bh-amarelo hover:bg-amber-700",
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${cores[cor]}`}
    >
      {children}
    </button>
  );
}

export function BotaoAtualizar({ onClick }: { onClick: () => void }) {
  return (
    <BotaoAcao onClick={onClick}>
      <RefreshCw className="h-[13px] w-[13px]" strokeWidth={2.5} /> Atualizar
    </BotaoAcao>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">{children}</div>;
}

export function KpiCard({ label, valor, sub, cor = "text-bh-azul", pequeno }: {
  label: string; valor: ReactNode; sub: string; cor?: string; pequeno?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-bh-borda bg-white px-[18px] py-4 shadow-sm">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-bh-cinza">{label}</div>
      <div className={`${pequeno ? "text-[22px]" : "text-3xl"} font-bold leading-none ${cor}`}>{valor}</div>
      <div className="mt-1 text-xs text-bh-cinza">{sub}</div>
    </div>
  );
}

export function Tabela({ cabecalhos, children }: { cabecalhos: { t: string; alinhar?: "left" | "center" | "right" }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-bh-borda shadow-sm">
      <table className="w-full border-collapse bg-white text-[13px]">
        <thead>
          <tr>
            {cabecalhos.map((c) => (
              <th
                key={c.t}
                className="whitespace-nowrap bg-bh-azul px-3.5 py-[11px] text-[11px] font-bold uppercase tracking-wide text-white"
                style={{ textAlign: c.alinhar ?? "left" }}
              >
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child]:border-b-0 [&>tr]:border-b [&>tr]:border-bh-borda [&>tr:hover]:bg-slate-50 [&_td]:px-3.5 [&_td]:py-[11px] [&_td]:align-middle">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function ScoreBadge({ pct, nivel }: { pct: number | null | undefined; nivel?: Nivel | null }) {
  const n: Nivel = nivel ?? (pct === null || pct === undefined ? "sem_dados" : nivelDoScore(pct));
  return (
    <span className={`inline-flex min-w-12 items-center justify-center rounded-full px-[9px] py-[3px] text-xs font-bold ${NIVEL_CLASSES[n].badge}`}>
      {pct === null || pct === undefined ? "—" : `${Number(pct)}%`}
    </span>
  );
}

export function BarList({ dados, contagem }: { dados: [string, number][]; contagem: Record<string, number> }) {
  if (!dados.length) return <div className="text-[13px] text-bh-cinza">Sem dados</div>;
  return (
    <>
      {dados.map(([nome, pct]) => {
        const n = nivelDoScore(pct);
        return (
          <div key={nome} className="mb-2.5 flex items-center gap-2.5">
            <div className="w-[150px] shrink-0 max-md:w-[110px]">
              <div className="truncate text-xs font-medium text-bh-texto" title={nome}>{nome}</div>
              <div className="text-[11px] text-bh-cinza">{contagem[nome] ?? 0} auditoria(s)</div>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded bg-bh-cinza-lt">
              <div className={`h-full rounded transition-[width] duration-700 ${NIVEL_CLASSES[n].barra}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`w-10 shrink-0 text-right text-xs font-bold ${NIVEL_CLASSES[n].texto}`}>{pct}%</div>
          </div>
        );
      })}
    </>
  );
}

export function SecTitulo({ children, direita }: { children: ReactNode; direita?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-bh-cinza">
      <span>{children}</span>
      {direita && <span className="text-xs font-normal normal-case tracking-normal">{direita}</span>}
    </div>
  );
}
````
