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
