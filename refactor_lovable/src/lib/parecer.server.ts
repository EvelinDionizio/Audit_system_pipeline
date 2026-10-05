import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  type ConfigClaude,
  chamarClaude,
  criarClienteClaude,
  lerConfigClaude,
  mapComLimite,
  registrarUso,
} from "@/lib/claude.server";
import { type TrechoNorma, buscarNormas } from "@/lib/normas.server";

/**
 * Geração dos pareceres técnicos (substitui parecer_service.py).
 *
 * Diferença principal: o Python pedia texto livre com 5 seções e depois
 * recortava cada seção com heurísticas (_extrair_recomendacao etc.). Aqui o
 * Claude responde em JSON validado por schema (structured outputs), então
 * cada seção já chega no seu campo.
 */

type Db = SupabaseClient<Database>;


// ── Entrada (payload montado a partir do Checklist Fácil) ────────────────────

export type CabecalhoAuditoria = {
  checklist_nome?: string | null;
  unidade_nome?: string | null;
  auditor_nome?: string | null;
};

export type ItemAuditoria = {
  id?: number | string | null;
  categoria?: string | null;
  pergunta?: string | null;
  comentario?: string | null;
  resposta_texto?: string | null;
  nao_conforme?: boolean;
  parcial?: boolean;
};

export type PayloadAuditoria = {
  cabecalho: CabecalhoAuditoria;
  itens: ItemAuditoria[];
};


// ── Saída ────────────────────────────────────────────────────────────────────

const parecerItemSchema = z.object({
  constatacao: z.string(),
  fundamentacao: z.string(),
  recomendacao: z.string(),
  texto_campo: z.string(),
  criticidade: z.enum(["Alta", "Média", "Baixa"]),
  justificativa_criticidade: z.string(),
});

export type ParecerItem = z.infer<typeof parecerItemSchema>;

// Mesmo formato do zod acima, em JSON Schema (exigência da API: todos os
// campos em required e additionalProperties false).
const PARECER_ITEM_JSON_SCHEMA = {
  type: "object",
  properties: {
    constatacao: { type: "string" },
    fundamentacao: { type: "string" },
    recomendacao: { type: "string" },
    texto_campo: { type: "string" },
    criticidade: { type: "string", enum: ["Alta", "Média", "Baixa"] },
    justificativa_criticidade: { type: "string" },
  },
  required: [
    "constatacao",
    "fundamentacao",
    "recomendacao",
    "texto_campo",
    "criticidade",
    "justificativa_criticidade",
  ],
  additionalProperties: false,
};

export type CriticidadeChecklist = "Mandatório" | "Importantes" | "Desejáveis" | "";

/** Formato que a tela de revisão e registrar_auditoria() esperam (igual ao Python). */
export type SugestaoItem = {
  item_id: number | string | null;
  categoria: string;
  pergunta: string;
  criticidade: CriticidadeChecklist;
  obrigatorio: boolean;
  resposta_original: string;
  /** Recomendação ao auditor. */
  sugestao: string | null;
  /** Texto pronto para colar no checklist. */
  texto_campo: string | null;
  /** Constatação. */
  justificativa: string | null;
  parecer: ParecerItem | null;
  /** Preenchido quando a geração deste item falhou; os demais seguem normalmente. */
  erro: string | null;
};

export type ResultadoParecer = {
  itens: SugestaoItem[];
  parecer: string;
};


// ── Prompts ──────────────────────────────────────────────────────────────────

// Estável entre chamadas (nada variável aqui), para o cache de prompt valer.
const SYSTEM_PROMPT = `Você é auditor técnico sênior da Bernhoeft Auditoria, especialista em segurança do trabalho, meio ambiente e conformidade regulatória brasileira.

Ao receber os dados de um item auditado, preencha os campos do parecer:

- constatacao: 1-2 frases descrevendo objetivamente o que foi identificado na auditoria.
- fundamentacao: cite a norma com número e artigo/item exato (ex.: "NR-1, item 1.7.1" ou "CLT, art. 158"). Nunca deixe sem ao menos uma norma citada. Se os trechos fornecidos não forem suficientes, cite a norma mais aplicável ao contexto.
- recomendacao: ações corretivas para o AUDITOR executar (ex.: "Solicitar documentação", "Registrar evidência"), no imperativo direto. Não use "o auditor deve".
- texto_campo: texto pronto para o auditor copiar e colar no checklist, em primeira pessoa do plural ("Verificamos", "Constatamos", "Foi identificado"). Corrija os erros ortográficos da observação original. Nunca mencione "o auditor". Para itens Não Conforme ou Parcialmente Conforme, termine com um plano de ação resumido: "PLANO DE AÇÃO: [empresa] deverá [ação] até [prazo sugerido]."
- criticidade: Alta, Média ou Baixa.
- justificativa_criticidade: uma frase justificando a criticidade.

Regras: no máximo 300 palavras no total, em português técnico e formal.`;

function rotuloResultado(item: ItemAuditoria): string {
  if (item.nao_conforme) return "Não Conforme";
  if (item.parcial) return "Parcialmente Conforme";
  // No Python, itens só com erro de digitação saíam rotulados como "Parcialmente Conforme".
  return "Conforme (revisão do texto registrado)";
}

function montarPrompt(item: ItemAuditoria, cabecalho: CabecalhoAuditoria, trechos: TrechoNorma[]): string {
  const contextoNormativo = trechos.length
    ? trechos.map((t) => `[${t.fonte}, p.${t.pagina}] ${t.texto}`).join("\n")
    : "Nenhum trecho normativo recuperado.";

  return `AUDITORIA: ${cabecalho.checklist_nome ?? "N/A"} | ${cabecalho.unidade_nome ?? "N/A"}
CATEGORIA: ${item.categoria ?? "N/A"}
ITEM: ${item.pergunta ?? "N/A"}
RESULTADO: ${rotuloResultado(item)}
OBSERVAÇÃO DO AUDITOR: ${item.comentario || item.resposta_texto || "Sem comentário."}

TRECHOS NORMATIVOS:
${contextoNormativo}

Elabore o parecer técnico conciso conforme as instruções.`;
}

/** Texto usado na busca de normas (igual a _build_query_text). */
function consultaDoItem(item: ItemAuditoria): string {
  return [item.categoria, item.pergunta, item.comentario, item.resposta_texto]
    .filter((parte): parte is string => Boolean(parte))
    .join(" | ");
}


// ── Regras de negócio portadas do Python ─────────────────────────────────────

/** Heurística de erro de digitação no texto do auditor (_tem_erro_ortografico). */
export function temErroOrtografico(item: ItemAuditoria): boolean {
  const texto = [item.comentario, item.resposta_texto]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
  if (texto.length < 3) return false;

  const padroes = [
    /\bparcialm[^e]/u, // "parcialm" sem "ente"
    /\bnao\s+conform[^e\s]/u, // "nao conform" incompleto
    /llm/u, // duplo-l antes de "m" (parciallmentr)
    /[\p{L}\d_][aeiou]{4,}/u, // sequência excessiva de vogais
  ];
  if (padroes.some((padrao) => padrao.test(texto))) return true;

  // Sequências de consoantes impossíveis em português.
  return texto.split(/\s+/).some((palavra) => {
    const limpa = palavra.replace(/[^a-záéíóúãõâêîôûàèìòùç]/g, "");
    return limpa.length > 4 && /[bcdfghjklmnpqrstvwxyz]{4,}/.test(limpa);
  });
}

/** Criticidade do checklist, lida do nome da pergunta. */
function criticidadeDaPergunta(pergunta: string): CriticidadeChecklist {
  if (pergunta.includes("(Mandatório)")) return "Mandatório";
  if (pergunta.includes("(Importantes)")) return "Importantes";
  if (pergunta.includes("(Desejáveis)")) return "Desejáveis";
  return "";
}

function precisaParecer(item: ItemAuditoria): boolean {
  return Boolean(item.nao_conforme || item.parcial) || temErroOrtografico(item);
}


// ── Mock (PARECER_MOCK=true ou sem ANTHROPIC_API_KEY) ────────────────────────

function parecerSimulado(item: ItemAuditoria, trechos: TrechoNorma[]): ParecerItem {
  const fontes = trechos.length ? trechos.map((t) => t.fonte).join(", ") : "nenhuma fonte recuperada";
  return {
    constatacao: `[SIMULADO] Item '${item.pergunta ?? "N/A"}' (categoria: ${item.categoria ?? "N/A"}) classificado como ${rotuloResultado(item)}.`,
    fundamentacao: `[SIMULADO] Fontes recuperadas: ${fontes}.`,
    recomendacao: "[SIMULADO] Adotar as medidas corretivas necessárias, com prazo e responsável definidos.",
    texto_campo: "[SIMULADO] Texto para o campo será gerado pela API do Claude.",
    criticidade: "Média",
    justificativa_criticidade: "[SIMULADO] Classificação definitiva será gerada pela API do Claude.",
  };
}


// ── Geração ──────────────────────────────────────────────────────────────────

type Contexto = {
  /** Client como o usuário (RLS): usado na busca de normas. */
  db: Db;
  /** Client service_role: usado para gravar uso_tokens. */
  admin: Db;
  userId: string;
  evaluationId: number | null;
};

async function gerarParecerItem(
  item: ItemAuditoria,
  cabecalho: CabecalhoAuditoria,
  config: ConfigClaude,
  ctx: Contexto,
): Promise<{ parecer: ParecerItem | null; erro: string | null }> {
  try {
    // RAG só para não conformes e parciais, como no Python.
    const trechos =
      item.nao_conforme || item.parcial
        ? await buscarNormas(ctx.db, consultaDoItem(item), config.topK)
        : [];

    if (config.mock) {
      return { parecer: parecerSimulado(item, trechos), erro: null };
    }

    const { texto, uso } = await chamarClaude(criarClienteClaude(), config, {
      system: SYSTEM_PROMPT,
      prompt: montarPrompt(item, cabecalho, trechos),
      schema: PARECER_ITEM_JSON_SCHEMA,
    });
    await registrarUso(ctx.admin, {
      evaluationId: ctx.evaluationId,
      userId: ctx.userId,
      tipo: "parecer_item",
      uso,
    });

    const validado = parecerItemSchema.safeParse(JSON.parse(texto));
    if (!validado.success) {
      throw new Error("Resposta do modelo fora do formato esperado.");
    }
    return { parecer: validado.data, erro: null };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[Parecer] Item ${String(item.id)}: ${mensagem}`);
    return { parecer: null, erro: `Erro na geração do parecer: ${mensagem}` };
  }
}

async function gerarParecerGeral(
  cabecalho: CabecalhoAuditoria,
  itens: { item: ItemAuditoria; parecer: ParecerItem | null }[],
  config: ConfigClaude,
  ctx: Contexto,
): Promise<string> {
  const checklist = cabecalho.checklist_nome ?? "N/A";
  const unidade = cabecalho.unidade_nome ?? "N/A";
  const auditor = cabecalho.auditor_nome ?? "N/A";
  const naoConformes = itens.filter((i) => i.item.nao_conforme);
  const parciais = itens.filter((i) => i.item.parcial);

  if (config.mock) {
    return `[PARECER GERAL SIMULADO]\n\nAuditoria: ${checklist}\nUnidade: ${unidade}\nAuditor: ${auditor}\n\nForam identificados ${naoConformes.length} item(ns) não conforme(s) e ${parciais.length} item(ns) parcialmente conforme(s).`;
  }

  if (naoConformes.length === 0 && parciais.length === 0) {
    return `A auditoria da unidade ${unidade} (${checklist}) não apresentou não conformidades ou itens parciais nos itens respondidos. Os registros encontram-se em conformidade com os requisitos avaliados.`;
  }

  const resumos = [...naoConformes, ...parciais]
    .filter((i) => i.parecer)
    .map(
      (i) =>
        `• ${i.item.categoria ?? ""} — ${i.item.pergunta ?? ""}\n  Constatação: ${i.parecer?.constatacao}\n  Recomendação: ${i.parecer?.recomendacao}`,
    );

  const prompt = `Você é um auditor técnico sênior da Bernhoeft Auditoria.

Com base nos pareceres individuais abaixo, elabore um parecer técnico executivo consolidado, em português formal, para a seguinte auditoria:

- Checklist: ${checklist}
- Unidade auditada: ${unidade}
- Auditor responsável: ${auditor}
- Não conformidades: ${naoConformes.length}
- Itens parciais: ${parciais.length}

PARECERES INDIVIDUAIS:
${resumos.join("\n")}

O parecer executivo deve conter:
1. Síntese das principais não conformidades identificadas
2. Riscos associados e urgência de correção
3. Recomendações prioritárias
4. Conclusão geral

No máximo 3 parágrafos, em português formal e técnico.`;

  try {
    const { texto, uso } = await chamarClaude(criarClienteClaude(), config, { prompt });
    await registrarUso(ctx.admin, {
      evaluationId: ctx.evaluationId,
      userId: ctx.userId,
      tipo: "parecer_geral",
      uso,
    });
    return texto;
  } catch (e) {
    console.error(`[Parecer] Erro no parecer geral: ${e instanceof Error ? e.message : String(e)}`);
    return `Auditoria ${checklist} — ${unidade}.\nIdentificados ${naoConformes.length} não conformidade(s) e ${parciais.length} item(ns) parcial(is). Consulte os pareceres individuais para detalhamento.`;
  }
}

/**
 * Diagnóstico da integração com o Claude, sem banco: mesmo prompt, schema e
 * validação do parecer de item, mas sem busca de normas e sem gravar
 * uso_tokens. Usado só pela rota /api/public/teste-ia.
 */
export async function diagnosticarParecer(item: ItemAuditoria, cabecalho: CabecalhoAuditoria) {
  const config = lerConfigClaude();
  const inicio = Date.now();
  const { texto, uso } = await chamarClaude(criarClienteClaude(), config, {
    system: SYSTEM_PROMPT,
    prompt: montarPrompt(item, cabecalho, []),
    schema: PARECER_ITEM_JSON_SCHEMA,
  });
  const validado = parecerItemSchema.safeParse(JSON.parse(texto));
  return {
    config,
    tempoMs: Date.now() - inicio,
    uso,
    formatoValido: validado.success,
    parecer: validado.success ? validado.data : texto,
  };
}

/**
 * Interface principal (substitui gerar_parecer). Gera os pareceres dos itens
 * não conformes, parciais ou com erro de digitação, em paralelo limitado por
 * PARECER_CONCORRENCIA, e depois o parecer geral consolidado.
 */
export async function gerarParecer(payload: PayloadAuditoria, ctx: Contexto): Promise<ResultadoParecer> {
  const config = lerConfigClaude();
  const { cabecalho, itens } = payload;

  const gerados = await mapComLimite(itens, config.concorrencia, async (item) =>
    precisaParecer(item)
      ? { item, ...(await gerarParecerItem(item, cabecalho, config, ctx)) }
      : { item, parecer: null, erro: null },
  );

  const sugestoes: SugestaoItem[] = gerados.map(({ item, parecer, erro }) => {
    const criticidade = criticidadeDaPergunta(item.pergunta ?? "");
    return {
      item_id: item.id ?? null,
      categoria: item.categoria ?? "",
      pergunta: item.pergunta ?? "",
      criticidade,
      // Igual ao Python: Mandatório com recomendação, ou texto com erro de digitação.
      obrigatorio: (criticidade === "Mandatório" && Boolean(parecer?.recomendacao)) || temErroOrtografico(item),
      resposta_original: item.comentario || item.resposta_texto || "",
      sugestao: parecer?.recomendacao ?? null,
      texto_campo: parecer?.texto_campo ?? null,
      justificativa: parecer?.constatacao ?? null,
      parecer,
      erro,
    };
  });

  const parecerGeral = await gerarParecerGeral(cabecalho, gerados, config, ctx);

  return { itens: sugestoes, parecer: parecerGeral };
}
