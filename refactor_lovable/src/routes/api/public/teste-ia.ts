import { APIError } from "@anthropic-ai/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { tokenValido } from "@/lib/backup.server";
import { lerConfigClaude } from "@/lib/claude.server";
import { diagnosticarParecer } from "@/lib/parecer.server";

/**
 * Testa a integração com o Claude sem precisar do Supabase: gera o parecer de
 * um item de exemplo com o mesmo prompt e schema da revisão real (sem busca
 * de normas e sem gravar uso_tokens). Cada chamada consome créditos da API.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/public/teste-ia
 */

const CABECALHO = { checklist_nome: "Checklist de Segurança (teste)", unidade_nome: "Unidade Teste" };
const ITEM = {
  id: 0,
  categoria: "EPI",
  pergunta: "Os colaboradores utilizam os EPIs adequados à atividade? (Mandatório)",
  comentario: "dois colaboradores sem luva na area de corte, ficha de epi desatualizada",
  nao_conforme: true,
};

/** Traduz os erros mais comuns da API da Anthropic para algo acionável. */
function explicar(e: unknown): { status: number; detail: string } {
  if (e instanceof APIError) {
    const dicas: Record<number, string> = {
      400: "Pedido recusado pela API (ex.: créditos insuficientes ou parâmetro não suportado pelo modelo).",
      401: "ANTHROPIC_API_KEY inválida ou revogada.",
      403: "A chave não tem permissão para este modelo ou recurso.",
      404: "Modelo não encontrado: confira MODELO_CLAUDE.",
      429: "Limite de uso atingido (rate limit ou limite de gasto da organização).",
      529: "API da Anthropic sobrecarregada no momento: tente de novo em instantes.",
    };
    const status = e.status ?? 502;
    return { status: 502, detail: `${dicas[status] ?? "Erro da API da Anthropic."} (HTTP ${status}: ${e.message})` };
  }
  return { status: 500, detail: e instanceof Error ? e.message : String(e) };
}

export const Route = createFileRoute("/api/public/teste-ia")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!tokenValido(request, "CRON_SECRET")) {
          return Response.json({ detail: "Não autorizado." }, { status: 401 });
        }

        const config = lerConfigClaude();
        const resumoConfig = { modelo: config.modelo, esforco: config.esforco };
        if (config.mock) {
          return Response.json(
            {
              ok: false,
              ...resumoConfig,
              detail: process.env["ANTHROPIC_API_KEY"]
                ? "PARECER_MOCK=true: a IA está em modo simulado. Remova a variável para usar o Claude."
                : "ANTHROPIC_API_KEY não configurada: a IA está em modo simulado.",
            },
            { status: 503 },
          );
        }

        try {
          const r = await diagnosticarParecer(ITEM, CABECALHO);
          return Response.json({
            ok: r.formatoValido,
            ...resumoConfig,
            modelo_que_respondeu: r.uso.modelo,
            tempo_ms: r.tempoMs,
            tokens: { entrada: r.uso.tokensInput, saida: r.uso.tokensOutput },
            custo_usd: r.uso.custoUsd,
            formato_valido: r.formatoValido,
            item_de_teste: ITEM,
            parecer: r.parecer,
          });
        } catch (e) {
          const { status, detail } = explicar(e);
          return Response.json({ ok: false, ...resumoConfig, detail }, { status });
        }
      },
    },
  },
});
