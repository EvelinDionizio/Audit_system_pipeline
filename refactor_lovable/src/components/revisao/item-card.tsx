import { useMutation } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { limparMarkdown } from "@/lib/format";
import { type SugestaoRevisao, registrarFeedback } from "@/lib/revisao.functions";
import { cn } from "@/lib/utils";

export type TipoItem = "nc" | "sugestao" | "ok";

function temSugestao(item: SugestaoRevisao): boolean {
  return Boolean(item.sugestao) && item.sugestao !== item.resposta_original;
}

/** Classificação do card (regra de htmlItem() do index.html original). */
export function classificarItem(item: SugestaoRevisao): TipoItem {
  const obrigatorio = item.obrigatorio || (item.criticidade === "Mandatório" && temSugestao(item));
  if (obrigatorio) return "nc";
  return temSugestao(item) || item.texto_campo ? "sugestao" : "ok";
}

const BORDA: Record<TipoItem, string> = {
  nc: "border-l-destructive",
  sugestao: "border-l-warning",
  ok: "border-l-success",
};

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 mt-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
      {children}
    </div>
  );
}

export function useCopiar() {
  const [copiado, setCopiado] = useState(false);
  function copiar(texto: string) {
    void navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }
  return { copiado, copiar };
}

export function ItemCard({ item }: { item: SugestaoRevisao }) {
  const tipo = classificarItem(item);
  const sugestao = temSugestao(item);
  const textoCampo = limparMarkdown(item.texto_campo);
  const { copiado, copiar } = useCopiar();
  const [feedback, setFeedback] = useState<boolean | null>(null);

  const enviarFeedback = useMutation({
    mutationFn: (aceita: boolean) => {
      if (item.sugestao_id === null) throw new Error("Sugestão sem registro no banco.");
      return registrarFeedback({ data: { sugestao_id: item.sugestao_id, aceita } });
    },
    onSuccess: (_resposta, aceita) => setFeedback(aceita),
    onError: (e) => toast.error(e.message || "Não foi possível registrar o feedback."),
  });

  return (
    <div className={cn("mt-2 overflow-hidden rounded-lg border border-l-4 bg-card shadow-sm", BORDA[tipo])}>
      <div className="flex items-start justify-between gap-2 border-b px-4 pb-2 pt-3">
        <div className="flex-1">
          {item.criticidade && (
            <Badge
              variant={
                item.criticidade === "Mandatório"
                  ? "destructive"
                  : item.criticidade === "Importantes"
                    ? "warning"
                    : "info"
              }
              className="mb-1 text-[10px]"
            >
              {item.criticidade}
            </Badge>
          )}
          <div className="text-[13px] font-medium leading-snug">{item.pergunta}</div>
        </div>
        {tipo === "nc" && <Badge variant="destructive">⚠ Obrigatório</Badge>}
        {tipo === "sugestao" && <Badge variant="warning">💡 Sugestão</Badge>}
      </div>

      <div className="px-4 pb-3.5 pt-3 text-[13px] leading-normal">
        {item.erro && (
          <div role="alert" className="mb-2.5 rounded-md bg-destructive-soft px-2.5 py-1.5 text-[11px] font-semibold text-destructive">
            {item.erro}
          </div>
        )}

        {item.resposta_original && (
          <>
            <Rotulo>Resposta original</Rotulo>
            <div className="whitespace-pre-wrap rounded-md bg-muted px-2.5 py-2 text-muted-foreground">
              {item.resposta_original}
            </div>
          </>
        )}

        {sugestao && (
          <>
            <Rotulo>{tipo === "nc" ? "⚠ Correção obrigatória" : "💡 Recomendação da IA"}</Rotulo>
            <div
              className={cn(
                "rounded-md border px-2.5 py-2",
                tipo === "nc" ? "border-destructive/30 bg-destructive-soft" : "border-success/30 bg-success-soft",
              )}
            >
              {limparMarkdown(item.sugestao)}
            </div>
          </>
        )}

        {textoCampo && (
          <>
            <Rotulo>
              📋 Texto sugerido para o campo
              <Button variant="outline" size="xs" onClick={() => copiar(textoCampo)}>
                {copiado ? <Check /> : <Copy />}
                {copiado ? "Copiado!" : "Copiar"}
              </Button>
            </Rotulo>
            <div className="rounded-md border border-info-border bg-info-soft px-2.5 py-2 italic">{textoCampo}</div>
          </>
        )}

        {sugestao && item.sugestao_id !== null && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              A sugestão foi útil?
            </span>
            <Button
              size="xs"
              variant={feedback === true ? "success" : "outline"}
              disabled={enviarFeedback.isPending}
              onClick={() => enviarFeedback.mutate(true)}
            >
              ✓ Aceitar
            </Button>
            <Button
              size="xs"
              variant={feedback === false ? "secondary" : "outline"}
              disabled={enviarFeedback.isPending}
              onClick={() => enviarFeedback.mutate(false)}
            >
              ✗ Ignorar
            </Button>
          </div>
        )}

        {!sugestao && !textoCampo && !item.erro && (
          <div className="mt-1.5 flex items-center gap-1.5 text-success">
            <Check className="size-3.5" strokeWidth={2.5} /> Resposta adequada
          </div>
        )}

        {item.parecer?.fundamentacao && (
          <>
            <Rotulo>Fundamentação normativa</Rotulo>
            <div className="rounded-md bg-muted px-2.5 py-2 text-muted-foreground">
              {item.parecer.fundamentacao}
            </div>
          </>
        )}

        {item.justificativa && (
          <>
            <Rotulo>Constatação</Rotulo>
            <div className="rounded-md bg-muted px-2.5 py-2 text-muted-foreground">
              {limparMarkdown(item.justificativa)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
