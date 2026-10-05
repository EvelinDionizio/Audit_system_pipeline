import type { CabecalhoAuditoria, ItemAuditoria } from "@/lib/parecer.server";

/**
 * Integração com o Checklist Fácil (substitui api/client.py, polling_service
 * e enrichment_service). O detalhe da avaliação vem da API de Integração,
 * `GET v2/evaluations/{id}`; a estrutura é a mesma que o Python lia.
 *
 * A API limita a 1 requisição por janela (cabeçalho X-RateLimit-Limit: 1) e
 * responde 429 com Retry-After. Esperamos e tentamos de novo, até
 * API_MAX_TENTATIVAS vezes (padrão 3), cada espera limitada a API_ESPERA_429
 * segundos (padrão 60).
 */

// Códigos da resposta avaliativa, conforme a documentação do Checklist Fácil.
const SCORES_NAO_CONFORME = new Set([1, 4]); // Não atingiu
const SCORES_PARCIAL = new Set([2]); // Atingiu parcialmente
const SCORES_CONFORME = new Set([3, 5]); // Atingiu / Atingiu totalmente
const SCORES_NAO_APLICAVEL = new Set([6]); // Não se aplica

const SCORE_LABELS: Record<number, string> = {
  1: "Não atingiu",
  2: "Atingiu parcialmente",
  3: "Atingiu",
  4: "Não atingiu",
  5: "Atingiu totalmente",
  6: "Não se aplica",
};

const PESOS = { Mandatório: 3, Importantes: 2, Desejáveis: 1 } as const;
type Criticidade = keyof typeof PESOS;

// Palavras de respostas em texto livre. No Python a busca era por substring,
// então "nc" casava com "incêndio" e "ok" com "token". Aqui a palavra precisa
// começar no início de uma palavra do texto (e as curtas, terminar também),
// mantendo prefixos como "parcial" → "parcialmente".
const PALAVRAS_NAO_CONFORME = [
  "não conforme", "nao conforme", "nc", "reprovado", "não atende", "nao atende",
  "não possui", "nao possui", "ausente", "inexistente", "irregular", "pendente",
];
const PALAVRAS_PARCIAL = [
  "parcial", "parciallment", "incompleto", "em parte", "parcialmente", "insuficiente", "em andamento",
];
const PALAVRAS_CONFORME = [
  "conforme", "ok", "sim", "atende", "possui", "regular", "adequado", "existe", "apresentado", "formalizado",
];
const PALAVRAS_INTEIRAS = new Set(["nc", "ok", "sim"]);

function contemPalavra(texto: string, palavras: string[]): boolean {
  return palavras.some((p) => {
    const fim = PALAVRAS_INTEIRAS.has(p) ? "(?![\\p{L}\\d])" : "";
    return new RegExp(`(?<![\\p{L}\\d])${p}${fim}`, "u").test(texto);
  });
}

function conformidadeDoTexto(texto: string) {
  const t = texto.toLowerCase().trim();
  if (!t) return { naoConforme: false, parcial: false, conforme: false };
  const naoConforme = contemPalavra(t, PALAVRAS_NAO_CONFORME);
  const parcial = !naoConforme && contemPalavra(t, PALAVRAS_PARCIAL);
  const conforme = !naoConforme && !parcial && contemPalavra(t, PALAVRAS_CONFORME);
  return { naoConforme, parcial, conforme };
}


// ── Tipos ────────────────────────────────────────────────────────────────────

export type ResumoAuditoria = {
  total_itens_relevantes: number;
  total_nao_conformes: number;
  total_parciais: number;
  total_conformes: number;
  total_nao_aplicaveis: number;
  percentual_conformidade: number | null;
  nivel_conformidade: string;
  requer_rag: boolean;
};

export type CabecalhoChecklistFacil = CabecalhoAuditoria & {
  id: number;
  departamento: string[];
  status: number | null;
  pontuacao_total: number | null;
  plataforma: number | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  comentario_final: string;
};

export type ItemChecklistFacil = ItemAuditoria & {
  id: number | null;
  categoria: string;
  pergunta: string;
  criticidade: Criticidade;
  peso: number;
  tipo_resposta: "texto" | "avaliativo";
  resposta_codigo: number | null;
  resposta_texto: string | null;
  comentario: string | null;
  nao_conforme: boolean;
  parcial: boolean;
  conforme: boolean;
  nao_aplicavel: boolean;
  total_anexos: number;
};

export type AuditoriaChecklistFacil = {
  cabecalho: CabecalhoChecklistFacil;
  itens: ItemChecklistFacil[];
  resumo: ResumoAuditoria;
};

// Formato bruto da API (só os campos usados).
type Nome = { name?: string | null } | null | undefined;
type ItemBruto = {
  id?: number;
  name?: string;
  comment?: string | null;
  answer?: { evaluative?: number | null; text?: string | null } | null;
  attachments?: unknown[] | null;
};
type AvaliacaoBruta = {
  id?: number;
  status?: number | null;
  score?: number | null;
  platform?: number | null;
  startedAt?: string | null;
  concludedAt?: string | null;
  finalComment?: string | null;
  checklist?: Nome;
  unit?: Nome;
  user?: Nome;
  departments?: { name?: string | null }[] | null;
  categories?: { name?: string | null; items?: ItemBruto[] | null }[] | null;
};


// ── HTTP ─────────────────────────────────────────────────────────────────────

function inteiroDoEnv(nome: string, padrao: number): number {
  const valor = Number.parseInt(process.env[nome] ?? "", 10);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

async function buscarDetalhe(evaluationId: number): Promise<AvaliacaoBruta> {
  const base = process.env["CHECKLIST_FACIL_INTEGRATION_URL"]?.replace(/\/+$/, "");
  const token = process.env["CHECKLIST_FACIL_API_TOKEN"];
  if (!base || !token) {
    throw new Error("CHECKLIST_FACIL_INTEGRATION_URL e CHECKLIST_FACIL_API_TOKEN não estão configurados.");
  }

  const tentativas = inteiroDoEnv("API_MAX_TENTATIVAS", 3);
  const esperaMaxima = inteiroDoEnv("API_ESPERA_429", 60);

  for (let tentativa = 1; ; tentativa++) {
    let resposta: Response;
    try {
      resposta = await fetch(`${base}/v2/evaluations/${evaluationId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "pt-br",
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("Não foi possível conectar ao Checklist Fácil. Tente novamente.");
    }

    if (resposta.status === 429 && tentativa < tentativas) {
      const pedido = Number.parseInt(resposta.headers.get("retry-after") ?? "", 10);
      const segundos = Math.min(Number.isFinite(pedido) && pedido > 0 ? pedido : esperaMaxima, esperaMaxima);
      console.warn(`[ChecklistFácil] 429, aguardando ${segundos}s (tentativa ${tentativa}/${tentativas}).`);
      await new Promise((r) => setTimeout(r, segundos * 1000));
      continue;
    }

    switch (resposta.status) {
      case 200: {
        const corpo = (await resposta.json()) as AvaliacaoBruta | { data?: AvaliacaoBruta };
        // Pode vir como { data: {...} } ou direto.
        return "data" in corpo && corpo.data && typeof corpo.data === "object" ? corpo.data : (corpo as AvaliacaoBruta);
      }
      case 401:
        throw new Error("Token do Checklist Fácil inválido ou expirado (CHECKLIST_FACIL_API_TOKEN).");
      case 403:
        throw new Error("Sem permissão para acessar esta avaliação no Checklist Fácil.");
      case 404:
        throw new Error(`Avaliação #${evaluationId} não encontrada no Checklist Fácil.`);
      case 429:
        throw new Error("O Checklist Fácil está limitando as consultas. Aguarde um minuto e tente de novo.");
      default:
        throw new Error(`Erro do Checklist Fácil ao buscar a avaliação (HTTP ${resposta.status}).`);
    }
  }
}


// ── Estruturação (igual a extract_audit_payload) ─────────────────────────────

function criticidade(pergunta: string): Criticidade {
  if (pergunta.includes("(Mandatório)")) return "Mandatório";
  if (pergunta.includes("(Importantes)")) return "Importantes";
  return "Desejáveis";
}

function extrairCabecalho(bruto: AvaliacaoBruta, evaluationId: number): CabecalhoChecklistFacil {
  return {
    id: bruto.id ?? evaluationId,
    checklist_nome: bruto.checklist?.name ?? null,
    unidade_nome: bruto.unit?.name ?? null,
    auditor_nome: bruto.user?.name ?? null,
    departamento: (bruto.departments ?? []).flatMap((d) => (d.name ? [d.name] : [])),
    status: bruto.status ?? null,
    pontuacao_total: bruto.score ?? null,
    plataforma: bruto.platform ?? null,
    data_inicio: bruto.startedAt ?? null,
    data_conclusao: bruto.concludedAt ?? null,
    comentario_final: bruto.finalComment ?? "",
  };
}

function extrairItens(bruto: AvaliacaoBruta): ItemChecklistFacil[] {
  const itens: ItemChecklistFacil[] = [];
  for (const categoria of bruto.categories ?? []) {
    for (const item of categoria.items ?? []) {
      const comentario = (item.comment ?? "").trim();
      const respostaTexto = (item.answer?.text ?? "").trim();
      const score = item.answer?.evaluative ?? null;

      // Só itens respondidos: com nota avaliativa, texto ou comentário.
      if (score === null && !comentario && !respostaTexto) continue;

      const pergunta = item.name ?? "";
      const porTexto =
        score === null
          ? conformidadeDoTexto(respostaTexto || comentario)
          : { naoConforme: false, parcial: false, conforme: false };
      const crit = criticidade(pergunta);

      itens.push({
        id: item.id ?? null,
        categoria: categoria.name ?? "",
        pergunta,
        criticidade: crit,
        peso: PESOS[crit],
        tipo_resposta: score === null ? "texto" : "avaliativo",
        resposta_codigo: score,
        resposta_texto: respostaTexto || (score !== null ? SCORE_LABELS[score] : undefined) || null,
        comentario: comentario || null,
        nao_conforme: (score !== null && SCORES_NAO_CONFORME.has(score)) || porTexto.naoConforme,
        parcial: (score !== null && SCORES_PARCIAL.has(score)) || porTexto.parcial,
        conforme: (score !== null && SCORES_CONFORME.has(score)) || porTexto.conforme,
        nao_aplicavel: score !== null && SCORES_NAO_APLICAVEL.has(score),
        total_anexos: item.attachments?.length ?? 0,
      });
    }
  }
  return itens;
}

function montarResumo(itens: ItemChecklistFacil[]): ResumoAuditoria {
  const contar = (f: (i: ItemChecklistFacil) => boolean) => itens.filter(f).length;
  const naoConformes = contar((i) => i.nao_conforme);
  const parciais = contar((i) => i.parcial);

  // Score ponderado pela criticidade; texto livre classificado também entra.
  const avaliados = itens.filter(
    (i) => !i.nao_aplicavel && (i.resposta_codigo !== null || i.nao_conforme || i.parcial || i.conforme),
  );
  const somaPesos = avaliados.reduce((s, i) => s + i.peso, 0);
  const somaPontos = avaliados.reduce((s, i) => s + i.peso * (i.conforme ? 1 : i.parcial ? 0.5 : 0), 0);
  const percentual = somaPesos > 0 ? Math.round((somaPontos / somaPesos) * 1000) / 10 : null;

  const nivel =
    percentual === null ? "sem_dados"
    : percentual >= 90 ? "excelente"
    : percentual >= 75 ? "bom"
    : percentual >= 60 ? "regular"
    : "critico";

  return {
    total_itens_relevantes: itens.length,
    total_nao_conformes: naoConformes,
    total_parciais: parciais,
    total_conformes: contar((i) => i.conforme),
    total_nao_aplicaveis: contar((i) => i.nao_aplicavel),
    percentual_conformidade: percentual,
    nivel_conformidade: nivel,
    requer_rag: naoConformes > 0 || parciais > 0,
  };
}

/** Busca a avaliação e devolve cabeçalho, itens respondidos e resumo (fetch_and_structure). */
export async function buscarAuditoriaEstruturada(evaluationId: number): Promise<AuditoriaChecklistFacil> {
  const bruto = await buscarDetalhe(evaluationId);
  const itens = extrairItens(bruto);
  if (itens.length === 0) {
    throw new Error(
      `A avaliação #${evaluationId} ainda não tem itens respondidos. Responda pelo menos um item no app antes de solicitar a revisão.`,
    );
  }
  return { cabecalho: extrairCabecalho(bruto, evaluationId), itens, resumo: montarResumo(itens) };
}
