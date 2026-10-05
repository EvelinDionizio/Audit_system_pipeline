Parte 3 de 11 — backend (edge functions). Crie os 3 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 3 recebida" com a lista de arquivos.

### `supabase/functions/_shared/parecer.ts`

````ts
// Geração de pareceres técnicos com Claude — porta de services/parecer_service.py.
//
// Modos:
//   REAL: ANTHROPIC_API_KEY definida            → chama a API do Claude
//   MOCK: sem chave ou PARECER_MOCK=true        → parecer simulado para testes
import Anthropic from "npm:@anthropic-ai/sdk";
import { env } from "./http.ts";
import { criticidade as criticidadeDaPergunta, type Cabecalho, type ItemAuditoria } from "./extracao.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const PARECER_MOCK = (Deno.env.get("PARECER_MOCK") ?? "false").toLowerCase() === "true";
const MODELO_CLAUDE = env("MODELO_CLAUDE", "claude-sonnet-4-6");
const MAX_TOKENS_PARECER = Number(env("MAX_TOKENS_PARECER", "600"));
const MAX_TOKENS_PARECER_GERAL = Number(env("MAX_TOKENS_PARECER_GERAL", "800"));
// Chamadas por item rodam em paralelo (o original era sequencial) para caber no
// limite de tempo de uma edge function. O SDK já refaz 429/5xx com backoff.
const CONCORRENCIA = Number(env("PARECER_CONCORRENCIA", "5"));
const MAX_TENTATIVAS = Number(env("API_MAX_TENTATIVAS", "3"));

export const USE_MOCK = PARECER_MOCK || !ANTHROPIC_API_KEY;

// USD por 1M tokens [input, output]. Modelos fora da tabela usam o preço do Sonnet 4.6 (valor fixo do original).
const PRECOS: Record<string, [number, number]> = {
  "claude-sonnet-4-6": [3, 15],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-haiku-4-5": [1, 5],
};

// ── System prompt (texto idêntico ao original) ────────────────────────────
const SYSTEM_PROMPT = `Você é auditor técnico sênior da Bernhoeft Auditoria, especialista em segurança do trabalho, meio ambiente e conformidade regulatória brasileira.

Ao receber dados de um item auditado, gere uma resposta estruturada com EXATAMENTE 5 seções numeradas:

1. Constatação: 1-2 frases descrevendo objetivamente o que foi identificado na auditoria.
2. Fundamentação normativa: OBRIGATÓRIO citar a norma com número e artigo/item exato (ex: "NR-1, item 1.7.1" ou "CLT, art. 158"). Jamais omita esta seção. Se os trechos fornecidos não forem suficientes, cite a norma mais aplicável ao contexto.
3. Recomendação: ações corretivas para o AUDITOR executar (ex: "Solicitar documentação", "Registrar evidência"). NÃO use "o auditor deve" — use imperativo direto.
4. Texto para o campo: Texto pronto para o auditor COPIAR E COLAR no checklist. Deve estar em primeira pessoa do plural ("Verificamos", "Constatamos", "Foi identificado"). Corrigir erros ortográficos da observação original. Para itens Não Conforme ou Parcialmente Conforme, incluir no final um plano de ação resumido: "PLANO DE AÇÃO: [empresa] deverá [ação] até [prazo sugerido]."
5. Criticidade: Alta, Média ou Baixa — uma frase de justificativa.

Regras obrigatórias:
- Máximo 300 palavras no total
- Seção 4 NUNCA menciona "o auditor" — é escrita como se fosse o próprio auditor registrando
- Português técnico e formal
- A seção Fundamentação normativa NUNCA pode ficar sem ao menos uma norma citada`;

export interface RegistroTokens {
  evaluation_id: number;
  usuario_id: string;
  modelo: string;
  tipo_chamada: string;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  custo_usd: number;
}

/** Contexto de uma execução: acumula o consumo de tokens para gravar no fim. */
export interface ContextoExecucao {
  evaluationId: number;
  usuarioId: string;
  tokens: RegistroTokens[];
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  _client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: MAX_TENTATIVAS });
  return _client;
}

function registrarUso(ctx: ContextoExecucao, tipo: string, usage: Anthropic.Usage) {
  const [pIn, pOut] = PRECOS[MODELO_CLAUDE] ?? PRECOS["claude-sonnet-4-6"];
  const criacaoCache = usage.cache_creation_input_tokens ?? 0;
  const leituraCache = usage.cache_read_input_tokens ?? 0;
  const tokensInput = usage.input_tokens + criacaoCache + leituraCache;
  const custoInput = (usage.input_tokens + criacaoCache * 1.25 + leituraCache * 0.1) / 1_000_000 * pIn;
  const custoOutput = usage.output_tokens / 1_000_000 * pOut;
  ctx.tokens.push({
    evaluation_id: ctx.evaluationId,
    usuario_id: ctx.usuarioId,
    modelo: MODELO_CLAUDE,
    tipo_chamada: tipo,
    tokens_input: tokensInput,
    tokens_output: usage.output_tokens,
    tokens_total: tokensInput + usage.output_tokens,
    custo_usd: Math.round((custoInput + custoOutput) * 1e6) / 1e6,
  });
  console.log(`[Tokens] ${tipo} — input=${tokensInput} output=${usage.output_tokens}`);
}

function textoDaResposta(msg: Anthropic.Message): string {
  if (msg.stop_reason === "max_tokens") console.warn("[ParecerService] resposta truncada por max_tokens");
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ── Prompt por item (texto idêntico ao original) ──────────────────────────
function montarPrompt(item: ItemAuditoria, cab: Cabecalho): string {
  const comentario = item.comentario || item.resposta_texto || "Sem comentário.";
  const conformidade = item.nao_conforme ? "Não Conforme" : "Parcialmente Conforme";
  const rag = item.contexto_rag ?? [];
  const contextoNormativo = rag.length
    ? rag.slice(0, 3).map((c) => `[${c.fonte}, p.${c.pagina}] ${c.texto}`).join("\n")
    : "Nenhum trecho normativo recuperado.";

  return `AUDITORIA: ${cab.checklist_nome ?? "N/A"} | ${cab.unidade_nome ?? "N/A"}
CATEGORIA: ${item.categoria || "N/A"}
ITEM: ${item.pergunta || "N/A"}
RESULTADO: ${conformidade}
OBSERVAÇÃO DO AUDITOR: ${comentario}

TRECHOS NORMATIVOS:
${contextoNormativo}

Elabore o parecer técnico conciso conforme instruções.`;
}

async function chamarClaude(prompt: string, ctx: ContextoExecucao): Promise<string> {
  try {
    const msg = await client().messages.create({
      model: MODELO_CLAUDE,
      max_tokens: MAX_TOKENS_PARECER,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    registrarUso(ctx, "parecer_item", msg.usage);
    return textoDaResposta(msg);
  } catch (e) {
    const detalhe = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.message}`.trim() : String(e);
    console.error("[ParecerService] ERRO na chamada à API:", detalhe);
    return `[ERRO NA GERAÇÃO DO PARECER: ${detalhe}]`;
  }
}

function gerarMock(item: ItemAuditoria): string {
  const conformidade = item.nao_conforme ? "Não Conforme" : "Parcialmente Conforme";
  const fontes = (item.contexto_rag ?? []).map((c) => c.fonte);
  const fontesStr = fontes.length ? fontes.join(", ") : "nenhuma fonte recuperada";
  return (
    `[PARECER SIMULADO — modo mock ativo]\n\n` +
    `**Constatação:** Durante a auditoria de campo, foi identificada situação classificada como ` +
    `${conformidade} no item '${item.pergunta || "N/A"}' (categoria: ${item.categoria || "N/A"}). ` +
    `Observação registrada pelo auditor: ${item.comentario || "Sem comentário."}\n\n` +
    `**Fundamentação normativa:** Com base nos trechos normativos recuperados (${fontesStr}), ` +
    `a situação evidenciada contraria as disposições regulamentares aplicáveis. ` +
    `[Fundamentação completa será gerada pela API do Claude]\n\n` +
    `**Recomendação:** Adotar as medidas corretivas necessárias para adequação à(s) norma(s) ` +
    `identificada(s), com definição de prazo e responsável pela implementação.\n\n` +
    `**Criticidade:** Média — [Classificação definitiva será gerada pela API do Claude]`
  );
}

async function gerarParecerItem(item: ItemAuditoria, cab: Cabecalho, ctx: ContextoExecucao): Promise<ItemAuditoria> {
  if (!(item.nao_conforme || item.parcial)) return { ...item, parecer: null };
  if (USE_MOCK) return { ...item, parecer: gerarMock(item), parecer_modo: "mock" };
  return { ...item, parecer: await chamarClaude(montarPrompt(item, cab), ctx), parecer_modo: "api" };
}

// ── Detecção de erro ortográfico (porta de _tem_erro_ortografico) ─────────
const W = "[\\p{L}\\p{N}_]";
const PADROES_ERRO = [
  new RegExp(`(?<!${W})parcialm[^e]`, "u"), // "parcialm" sem "ente"
  new RegExp(`(?<!${W})nao\\s+conform[^e\\s]`, "u"), // "nao conform" incompleto
  /llm/u, // duplo-l antes de consoante (parciallmentr)
  new RegExp(`${W}[aeiou]{4,}`, "u"), // sequência excessiva de vogais
];

export function temErroOrtografico(item: ItemAuditoria): boolean {
  const texto = [item.comentario ?? "", item.resposta_texto ?? ""].filter(Boolean).join(" ").toLowerCase().trim();
  if (texto.length < 3) return false;
  if (PADROES_ERRO.some((p) => p.test(texto))) return true;
  return texto.split(/\s+/).some((palavra) => {
    const limpa = palavra.replace(/[^a-záéíóúãõâêîôûàèìòùç]/g, "");
    return limpa.length > 4 && /[bcdfghjklmnpqrstvwxyz]{4,}/.test(limpa);
  });
}

// ── Extração de seções do parecer ─────────────────────────────────────────
// Correções em relação ao original: (a) o título da seção não vaza mais para o
// conteúdo ("Recomendação ..." / "Texto para o Campo ..."); (b) a Recomendação
// para na seção "Texto para o campo" (antes capturava as duas seções juntas).
function ehTitulo(linha: string): boolean {
  return linha.includes("**") || linha.startsWith("#") || /^\d+\./.test(linha);
}

function extrairSecao(parecer: string | null | undefined, inicio: RegExp, paradas: string[]): string | null {
  if (!parecer) return null;
  const resultado: string[] = [];
  let capturando = false;
  for (const bruta of parecer.split("\n")) {
    const l = bruta.trim();
    const lower = l.toLowerCase();
    if (!capturando && inicio.test(lower) && ehTitulo(l)) {
      const resto = l
        .replace(/\*\*/g, "")
        .replace(/^#+\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .replace(inicio, "")
        .replace(/^[\s.:\-–—]+/, "")
        .trim();
      if (resto) resultado.push(resto);
      capturando = true;
      continue;
    }
    if (capturando) {
      if (l && ehTitulo(l) && paradas.some((p) => lower.includes(p))) break;
      if (l && !/^-{3,}$/.test(l)) resultado.push(l);
    }
  }
  return resultado.join(" ").trim() || null;
}

const RE_CONSTATACAO = /constata[çc](ão|ao|ões|oes)/i;
const RE_RECOMENDACAO = /recomenda[çc](ão|ao|ões|oes)/i;
const RE_TEXTO_CAMPO = /texto para (o )?campo/i;

export const extrairConstatacao = (p?: string | null) =>
  extrairSecao(p, RE_CONSTATACAO, ["fundamenta", "recomenda", "texto para", "criticidade"]);
export const extrairRecomendacao = (p?: string | null) =>
  extrairSecao(p, RE_RECOMENDACAO, ["texto para", "criticidade", "constatação", "constatacao", "fundamenta"]);
export const extrairTextoCampo = (p?: string | null) =>
  extrairSecao(p, RE_TEXTO_CAMPO, ["criticidade", "constatação", "constatacao", "fundamenta", "recomenda"]);

// ── Parecer geral consolidado ──────────────────────────────────────────────
async function gerarParecerGeral(cab: Cabecalho, itens: ItemAuditoria[], ctx: ContextoExecucao): Promise<string> {
  const checklist = cab.checklist_nome ?? "N/A";
  const unidade = cab.unidade_nome ?? "N/A";
  const auditor = cab.auditor_nome ?? "N/A";
  const nc = itens.filter((i) => i.nao_conforme);
  const parciais = itens.filter((i) => i.parcial);

  if (USE_MOCK) {
    return (
      `[PARECER GERAL SIMULADO — modo mock ativo]\n\n` +
      `Auditoria: ${checklist}\nUnidade: ${unidade}\nAuditor: ${auditor}\n\n` +
      `Foram identificados ${nc.length} item(ns) não conforme(s) ` +
      `e ${parciais.length} item(ns) parcialmente conforme(s).\n\n` +
      `[Parecer técnico completo será gerado pela API do Claude]`
    );
  }

  if (!nc.length && !parciais.length) {
    return (
      `A auditoria da unidade ${unidade} (${checklist}) não apresentou ` +
      `não conformidades ou itens parciais nos itens respondidos. ` +
      `Os registros encontram-se em conformidade com os requisitos avaliados.`
    );
  }

  const individuais = [...nc, ...parciais]
    .filter((i) => i.parecer)
    .map((i) => `• ${i.categoria} — ${i.pergunta.slice(0, 80)}:\n  ${i.parecer!.slice(0, 300)}...`);

  const prompt = `Você é um auditor técnico sênior da Bernhoeft Auditoria.

Com base nos pareceres individuais abaixo, elabore um parecer técnico executivo consolidado
em português formal para a seguinte auditoria:

- Checklist: ${checklist}
- Unidade auditada: ${unidade}
- Auditor responsável: ${auditor}
- Não conformidades: ${nc.length}
- Itens parciais: ${parciais.length}

PARECERES INDIVIDUAIS:
${individuais.slice(0, 5).join("\n")}

Elabore um parecer executivo com:
1. Síntese das principais não conformidades identificadas
2. Riscos associados e urgência de correção
3. Recomendações prioritárias
4. Conclusão geral

Máximo de 3 parágrafos. Português formal e técnico.`;

  try {
    const msg = await client().messages.create({
      model: MODELO_CLAUDE,
      max_tokens: MAX_TOKENS_PARECER_GERAL,
      messages: [{ role: "user", content: prompt }],
    });
    // O original não registrava os tokens desta chamada.
    registrarUso(ctx, "parecer_geral", msg.usage);
    return textoDaResposta(msg);
  } catch (e) {
    console.error("[ParecerService] Erro no parecer geral:", e);
    return (
      `Auditoria ${checklist} — ${unidade}.\n` +
      `Identificados ${nc.length} não conformidade(s) e ${parciais.length} item(ns) parcial(is). ` +
      `Consulte os pareceres individuais para detalhamento.`
    );
  }
}

async function mapearComLimite<T, R>(itens: T[], limite: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(itens.length);
  let proximo = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i]);
    }
  });
  await Promise.all(workers);
  return saida;
}

// ── Interface principal (porta de gerar_parecer) ──────────────────────────
export interface ItemFrontend {
  item_id: number | null;
  categoria: string;
  pergunta: string;
  criticidade: string;
  obrigatorio: boolean;
  resposta_original: string;
  sugestao: string | null;
  texto_campo: string | null;
  justificativa: string | null;
  /** Preenchido por /revisar após gravar em `sugestoes` — usado nos botões Aceitar/Ignorar. */
  sugestao_id: number | null;
  /** Tipo definido por regra da aba Configurações (null = sem regra, vale a criticidade). */
  regra_tipo: "obrigatorio" | "sugestao" | null;
  ia_desabilitada: boolean;
  exige_imagem: boolean;
  total_anexos: number;
}

export async function gerarParecer(cab: Cabecalho, itensComRag: ItemAuditoria[], ctx: ContextoExecucao) {
  console.log(`[ParecerService] Auditoria ${cab.id} — modo: ${USE_MOCK ? "MOCK" : `API (${MODELO_CLAUDE})`}`);

  // Parecer por item: não conformes, parciais e itens com erro ortográfico
  const itensProcessados = await mapearComLimite(itensComRag, CONCORRENCIA, async (item) => {
    // Regra "Desabilitado — IA ignora este item"
    if (item.regra?.habilitado === false) return { ...item, parecer: null, tem_erro_texto: false };
    const temErro = temErroOrtografico(item);
    if (item.nao_conforme || item.parcial || temErro) {
      return { ...(await gerarParecerItem(item, cab, ctx)), tem_erro_texto: temErro };
    }
    return { ...item, parecer: null, tem_erro_texto: false };
  });

  const itensFrontend: ItemFrontend[] = itensProcessados.map((item) => {
    const parecer = item.parecer ?? "";
    const recomendacao = parecer ? extrairRecomendacao(parecer) ?? parecer : null;
    const pergunta = item.pergunta ?? "";
    // Na tela, só mostra criticidade quando o marcador está explícito na pergunta
    const crit = /\((Mandatório|Importantes|Desejáveis)\)/.test(pergunta) ? criticidadeDaPergunta(pergunta) : "";
    const temErro = !!item.tem_erro_texto;
    // Com regra configurada, o tipo da regra decide; sem regra, vale a criticidade (comportamento original)
    const obrigatorio = item.regra
      ? item.regra.validacao_tipo === "obrigatorio" && (!!recomendacao || temErro)
      : (crit === "Mandatório" && !!recomendacao) || temErro;
    return {
      item_id: item.id,
      categoria: item.categoria ?? "",
      pergunta,
      criticidade: crit,
      obrigatorio,
      sugestao_id: null,
      regra_tipo: item.regra?.validacao_tipo ?? null,
      ia_desabilitada: item.regra?.habilitado === false,
      exige_imagem: !!item.regra?.exige_imagem,
      total_anexos: item.total_anexos,
      resposta_original: item.comentario || item.resposta_texto || "",
      sugestao: recomendacao,
      texto_campo: parecer ? extrairTextoCampo(parecer) : null,
      justificativa: parecer ? extrairConstatacao(parecer) : null,
    };
  });

  const parecerGeral = await gerarParecerGeral(cab, itensProcessados, ctx);
  return { itensProcessados, itensFrontend, parecerGeral };
}
````
### `supabase/functions/revisar/index.ts`

````ts
// POST /revisar — porta de POST /api/revisar (review_api.py).
// Corpo: { "evaluation_id": 123456789 }
import { adminClient, requireUser } from "../_shared/auth.ts";
import { buscarEEstruturar } from "../_shared/checklistfacil.ts";
import { HttpError, json, lerCorpo, serve } from "../_shared/http.ts";
import { type ContextoExecucao, gerarParecer } from "../_shared/parecer.ts";
import { consultarItensLote } from "../_shared/rag.ts";
import { aplicarRegras } from "../_shared/regras.ts";

serve(async (req) => {
  const user = await requireUser(req);
  const { evaluation_id } = await lerCorpo<{ evaluation_id: number }>(req);
  const evaluationId = Number(evaluation_id);
  if (!Number.isInteger(evaluationId) || evaluationId <= 0) throw new HttpError(400, "Número inválido.");

  console.log(`Revisão por ${user.nome} (id=${user.id}): evaluation_id=${evaluationId}`);

  const payload = await buscarEEstruturar(evaluationId);
  const { cabecalho, resumo } = payload;
  const admin = adminClient();
  const ctx: ContextoExecucao = { evaluationId, usuarioId: user.id, tokens: [] };

  let resultado: Awaited<ReturnType<typeof gerarParecer>>;
  try {
    const itensComRegras = await aplicarRegras(admin, cabecalho, payload.itens);
    const itensComRag = await consultarItensLote(admin, itensComRegras);
    resultado = await gerarParecer(cabecalho, itensComRag, ctx);
  } catch (e) {
    console.error(`Erro IA avaliação ${evaluationId}:`, e);
    throw new HttpError(500, "Erro ao processar com IA.");
  }

  // Persistência — falhas não bloqueiam a resposta ao auditor (como no original)
  try {
    const payloadCompleto = {
      cabecalho,
      itens: resultado.itensProcessados,
      resumo: {
        ...resumo,
        total_com_contexto_rag: resultado.itensProcessados.filter((i) => i.contexto_rag?.length).length,
        total_com_parecer: resultado.itensProcessados.filter((i) => i.parecer).length,
      },
    };
    const { data: auditoriaId, error } = await admin.rpc("registrar_auditoria", {
      p_evaluation_id: evaluationId,
      p_usuario_id: user.id,
      p_cabecalho: cabecalho,
      p_resumo: resumo,
      p_payload: payloadCompleto,
      p_parecer_geral: resultado.parecerGeral,
    });
    if (error) throw error;

    const sugestoes = resultado.itensFrontend.map((i) => ({
      auditoria_id: auditoriaId,
      item_id: i.item_id,
      categoria: i.categoria,
      pergunta: i.pergunta,
      criticidade: i.criticidade,
      resposta_original: i.resposta_original,
      sugestao_ia: i.sugestao,
      tipo: i.obrigatorio ? "obrigatorio" : "sugestao",
    }));
    if (sugestoes.length) {
      const { data: gravadas, error: e2 } = await admin.from("sugestoes").insert(sugestoes).select("id");
      if (e2) throw e2;
      // IDs voltam na ordem de inserção — ligam cada item aos botões Aceitar/Ignorar
      (gravadas ?? []).forEach((g: { id: number }, idx: number) => {
        const item = resultado.itensFrontend[idx];
        if (item?.sugestao) item.sugestao_id = g.id;
      });
    }
  } catch (e) {
    console.warn(`Erro ao persistir auditoria ${evaluationId}:`, e);
  }

  if (ctx.tokens.length) {
    const { error } = await admin.from("uso_tokens").insert(ctx.tokens);
    if (error) console.warn("[Tokens] Erro ao registrar:", error.message);
  }

  return json({
    evaluation_id: evaluationId,
    checklist: cabecalho.checklist_nome ?? "",
    unidade: cabecalho.unidade_nome ?? "",
    auditor: cabecalho.auditor_nome ?? "",
    data_inicio: cabecalho.data_inicio ?? "",
    resumo: {
      status: cabecalho.status,
      respondidos: resumo.total_itens_relevantes,
      nao_conformes: resumo.total_nao_conformes,
      parciais: resumo.total_parciais,
      conformes: resumo.total_conformes,
      percentual_conformidade: resumo.percentual_conformidade,
      nivel_conformidade: resumo.nivel_conformidade,
    },
    sugestoes: { itens: resultado.itensFrontend, parecer: resultado.parecerGeral },
  });
});
````
### `supabase/functions/listar-pendentes/index.ts`

````ts
// POST /listar-pendentes — Camada 1 do pipeline em lote (main.py):
// busca auditorias "Em Análise" na API Analytics e mantém as dos últimos N dias.
// Corpo (opcional): { "dias": 90, "limit": 100 }
// O processamento de cada ID é feito chamando /revisar, a partir do Painel do Analista.
import { requireUser } from "../_shared/auth.ts";
import { filtrarRecentes, listarAuditorias, STATUS_EM_ANALISE } from "../_shared/checklistfacil.ts";
import { HttpError, json, serve } from "../_shared/http.ts";

serve(async (req) => {
  await requireUser(req, { analista: true });
  const corpo = await req.json().catch(() => ({}));
  const dias = Number(corpo.dias ?? 90);
  const limit = Math.min(Number(corpo.limit ?? 100), 100);

  let auditorias;
  try {
    auditorias = await listarAuditorias(STATUS_EM_ANALISE, limit, 1);
  } catch (e) {
    console.error("[AuditService] erro:", e);
    throw new HttpError(502, "Erro ao listar auditorias na API do Checklist Fácil.");
  }
  const recentes = filtrarRecentes(auditorias, dias);
  const ids = recentes.map((a) => Number(a.evaluationId ?? a.id)).filter((id) => Number.isInteger(id) && id > 0);

  return json({ total_recebido: auditorias.length, total_filtrado: ids.length, ids });
});
````
