import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Acesso à API do Claude (substitui _chamar_claude e registrar_uso_tokens).
 * Env lido só dentro das funções, conforme a regra do runtime edge.
 */

type Esforco = "low" | "medium" | "high";

export type ConfigClaude = {
  modelo: string;
  esforco: Esforco;
  /** PARECER_MOCK=true ou sem ANTHROPIC_API_KEY: gera pareceres simulados. */
  mock: boolean;
  concorrencia: number;
  topK: number;
};

// USD por 1M tokens. Cache: escrita custa 1,25x o input, leitura 0,1x.
const PRECOS: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Modelos que aceitam o fallback automático do servidor quando recusam um pedido.
const MODELOS_COM_FALLBACK = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
]);

function inteiroDoEnv(nome: string, padrao: number): number {
  const valor = Number.parseInt(process.env[nome] ?? "", 10);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

export function lerConfigClaude(): ConfigClaude {
  const esforco = process.env["PARECER_ESFORCO"];
  return {
    modelo: process.env["MODELO_CLAUDE"] || "claude-opus-5-5",
    esforco: esforco === "low" || esforco === "high" ? esforco : "medium",
    mock: process.env["PARECER_MOCK"] === "true" || !process.env["ANTHROPIC_API_KEY"],
    concorrencia: inteiroDoEnv("PARECER_CONCORRENCIA", 4),
    topK: inteiroDoEnv("RAG_TOP_K", 3),
  };
}

export function criarClienteClaude(): Anthropic {
  return new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
}

export type UsoClaude = {
  /** Modelo que de fato respondeu (pode ser o de fallback). */
  modelo: string;
  tokensInput: number;
  tokensOutput: number;
  custoUsd: number | null;
};

export type RespostaClaude = { texto: string; uso: UsoClaude };

/**
 * Uma chamada ao Claude. Com `schema`, a resposta vem como JSON garantido
 * pelo schema (structured outputs) e `texto` é esse JSON.
 */
export async function chamarClaude(
  client: Anthropic,
  config: ConfigClaude,
  pedido: { system?: string; prompt: string; schema?: Record<string, unknown> },
): Promise<RespostaClaude> {
  const resposta = await client.beta.messages.create({
    model: config.modelo,
    max_tokens: 16000,
    ...(pedido.system
      ? { system: [{ type: "text" as const, text: pedido.system, cache_control: { type: "ephemeral" as const } }] }
      : {}),
    messages: [{ role: "user", content: pedido.prompt }],
    output_config: {
      effort: config.esforco,
      ...(pedido.schema ? { format: { type: "json_schema" as const, schema: pedido.schema } } : {}),
    },
    ...(MODELOS_COM_FALLBACK.has(config.modelo)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });

  if (resposta.stop_reason === "refusal") {
    throw new Error("O modelo recusou gerar este parecer.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new Error("A resposta do modelo foi cortada pelo limite de tokens.");
  }

  const texto = resposta.content
    .flatMap((bloco) => (bloco.type === "text" ? [bloco.text] : []))
    .join("")
    .trim();

  const u = resposta.usage;
  const cacheEscrita = u.cache_creation_input_tokens ?? 0;
  const cacheLeitura = u.cache_read_input_tokens ?? 0;
  const preco = PRECOS[resposta.model];
  const custoUsd = preco
    ? ((u.input_tokens + cacheEscrita * 1.25 + cacheLeitura * 0.1) * preco.input +
        u.output_tokens * preco.output) /
      1_000_000
    : null;

  return {
    texto,
    uso: {
      modelo: resposta.model,
      tokensInput: u.input_tokens + cacheEscrita + cacheLeitura,
      tokensOutput: u.output_tokens,
      custoUsd: custoUsd === null ? null : Math.round(custoUsd * 1_000_000) / 1_000_000,
    },
  };
}

/**
 * Grava o consumo em uso_tokens (service_role). Falha aqui não derruba a
 * revisão, igual ao Python: só registra no log.
 */
export async function registrarUso(
  admin: SupabaseClient<Database>,
  registro: { evaluationId: number | null; userId: string; tipo: string; uso: UsoClaude },
): Promise<void> {
  const { error } = await admin.from("uso_tokens").insert({
    evaluation_id: registro.evaluationId,
    user_id: registro.userId,
    modelo: registro.uso.modelo,
    tipo_chamada: registro.tipo,
    tokens_input: registro.uso.tokensInput,
    tokens_output: registro.uso.tokensOutput,
    custo_usd: registro.uso.custoUsd,
  });
  if (error) {
    console.error(`[Tokens] Erro ao registrar uso: ${error.message}`);
  }
}

/** Executa `fn` em paralelo, com no máximo `limite` chamadas simultâneas. */
export async function mapComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array<R>(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await fn(itens[indice] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}
