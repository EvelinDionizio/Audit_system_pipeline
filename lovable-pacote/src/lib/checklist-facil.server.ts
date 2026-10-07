import { type Criticidade, criticidadeDaPergunta } from "@/lib/criticidade";
import type { ItemAuditoria } from "@/lib/parecer.server";

/**
 * Integração com o Checklist Fácil (substitui api/client.py,
 * polling_service.py e enrichment_service.py).
 *
 * Busca o detalhe de uma avaliação na API de Integração
 * (`v2/evaluations/{id}`) e estrutura categorias → itens → resposta/comentário
 * no formato que o parecer e o painel esperam, com as mesmas regras de
 * conformidade, pesos e níveis do código Python.
 *
 * Secrets (lidos só dentro das funções, regra do runtime edge):
 *   CHECKLIST_FACIL_API_TOKEN, CHECKLIST_FACIL_INTEGRATION_URL.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type CabecalhoChecklistFacil = {
  id: number | null;
  checklist_nome: string | null;
  unidade_nome: string | null;
  auditor_nome: string | null;
  departamento: string[];
  status: number | null;
  pontuacao_total: number | null;
  plataforma: string | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  comentario_final: string;
};

export type { Criticidade };

export type ItemChecklistFacil = ItemAuditoria & {
  criticidade: Criticidade;
  peso: number;
  tipo_resposta: "texto" | "avaliativo";
  resposta_codigo: number | null;
  nao_conforme: boolean;
  parcial: boolean;
  conforme: boolean;
  nao_aplicavel: boolean;
  total_anexos: number;
};

export type ResumoAuditoria = {
  total_itens_relevantes: number;
  total_nao_conformes: number;
  total_parciais: number;
  total_conformes: number;
  total_nao_aplicaveis: number;
  percentual_conformidade: number | null;
  nivel_conformidade: "excelente" | "bom" | "regular" | "critico" | "sem_dados";
  requer_rag: boolean;
};

export type AuditoriaChecklistFacil = {
  cabecalho: CabecalhoChecklistFacil;
  itens: ItemChecklistFacil[];
  resumo: ResumoAuditoria;
};

// ── Regras (as mesmas do enrichment_service.py) ──────────────────────────────

// Códigos de resposta conforme a documentação do Checklist Fácil.
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

// Pesos por criticidade, lida do nome do item.
const PESO: Record<Criticidade, number> = { Mandatório: 3, Importantes: 2, Desejáveis: 1 };

// Palavras que indicam a situação em respostas de texto livre (sem carinhas).
const PALAVRAS_NAO_CONFORME = [
  "não conforme",
  "nao conforme",
  "nc",
  "reprovado",
  "não atende",
  "nao atende",
  "não possui",
  "nao possui",
  "ausente",
  "inexistente",
  "irregular",
  "pendente",
  "inadequad",
  "desatualizad",
  "incorret",
];
const PALAVRAS_PARCIAL = [
  "parcial",
  "parciallment",
  "incompleto",
  "em parte",
  "parcialmente",
  "insuficiente",
  "em andamento",
];
const PALAVRAS_CONFORME = [
  "conforme",
  "ok",
  "sim",
  "atende",
  "possui",
  "regular",
  "adequado",
  "existe",
  "apresentado",
  "formalizado",
];

// Palavras curtas (nc, ok, sim) só valem como palavra inteira. No Python eram
// busca de trecho, e "nc" marcava como não conforme qualquer texto com essas
// letras (ex.: "Financeiro", "concluído"). As demais seguem como no Python.
const MAX_PALAVRA_CURTA = 3;
const SEPARADOR = String.raw`[^\p{L}\p{N}]`;

function contemPalavra(texto: string, palavra: string): boolean {
  if (palavra.length > MAX_PALAVRA_CURTA) return texto.includes(palavra);
  return new RegExp(`(?:^|${SEPARADOR})${palavra}(?:$|${SEPARADOR})`, "u").test(texto);
}

const contem = (texto: string, palavras: string[]) => palavras.some((p) => contemPalavra(texto, p));

// Negação até 3 palavras antes de uma palavra de conformidade inverte o sentido:
// "não existe plano", "documento não apresentado", "sem extintor adequado".
const NEGACOES = new Set([
  "não",
  "nao",
  "sem",
  "nenhum",
  "nenhuma",
  "nunca",
  "jamais",
  "falta",
  "faltam",
  "ausência",
  "ausencia",
]);
const JANELA_NEGACAO = 3;

/**
 * Palavras de conformidade só valem no começo da palavra do texto ("inadequado"
 * e "irregular" não contam como "adequado" e "regular"), e uma negação por perto
 * as torna não conformidade. Devolve o que foi afirmado e o que foi negado.
 */
function lerPalavrasDeConformidade(texto: string): { afirmado: boolean; negado: boolean } {
  const palavras = texto.split(new RegExp(`${SEPARADOR}+`, "u")).filter(Boolean);
  let afirmado = false;
  let negado = false;

  palavras.forEach((palavra, i) => {
    const bate = PALAVRAS_CONFORME.some((p) =>
      p.length > MAX_PALAVRA_CURTA ? palavra.startsWith(p) : palavra === p,
    );
    if (!bate) return;
    const antes = palavras.slice(Math.max(0, i - JANELA_NEGACAO), i);
    if (antes.some((a) => NEGACOES.has(a))) negado = true;
    else afirmado = true;
  });

  return { afirmado, negado };
}

function detectarConformidadeTexto(texto: string) {
  const t = texto.toLowerCase().trim();
  if (!t) return { naoConforme: false, parcial: false, conforme: false };
  const { afirmado, negado } = lerPalavrasDeConformidade(t);
  const naoConforme = contem(t, PALAVRAS_NAO_CONFORME) || negado;
  const parcial = contem(t, PALAVRAS_PARCIAL) && !naoConforme;
  const conforme = afirmado && !naoConforme && !parcial;
  return { naoConforme, parcial, conforme };
}

// ── Leitura tolerante do JSON da API ─────────────────────────────────────────

type Objeto = Record<string, unknown>;

const obj = (v: unknown): Objeto => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ── Estruturação (extract_audit_payload) ─────────────────────────────────────

function extrairCabecalho(raw: Objeto): CabecalhoChecklistFacil {
  return {
    id: numero(raw["id"]),
    checklist_nome: texto(obj(raw["checklist"])["name"]),
    unidade_nome: texto(obj(raw["unit"])["name"]),
    auditor_nome: texto(obj(raw["user"])["name"]),
    departamento: lista(raw["departments"]).flatMap((d) => texto(obj(d)["name"]) ?? []),
    status: numero(raw["status"]),
    pontuacao_total: numero(raw["score"]),
    plataforma: texto(raw["platform"]),
    data_inicio: texto(raw["startedAt"]),
    data_conclusao: texto(raw["concludedAt"]),
    comentario_final: texto(raw["finalComment"]) ?? "",
  };
}

function extrairItens(raw: Objeto): ItemChecklistFacil[] {
  const itens: ItemChecklistFacil[] = [];

  for (const categoria of lista(raw["categories"]).map(obj)) {
    const nomeCategoria = texto(categoria["name"]) ?? "";

    for (const item of lista(categoria["items"]).map(obj)) {
      const resposta = obj(item["answer"]);
      const comentario = (texto(item["comment"]) ?? "").trim();
      const respostaTexto = (texto(resposta["text"]) ?? "").trim();
      const score = numero(resposta["evaluative"]);

      // Inclui itens com nota avaliativa OU texto.
      if (score === null && !comentario && !respostaTexto) continue;

      const pergunta = texto(item["name"]) ?? "";
      const rotulo = score !== null ? (SCORE_LABELS[score] ?? null) : null;

      // Conformidade pela nota (carinhas); sem nota, pelo texto livre.
      const doTexto =
        score === null && (respostaTexto || comentario)
          ? detectarConformidadeTexto(respostaTexto || comentario)
          : { naoConforme: false, parcial: false, conforme: false };

      const criticidade = criticidadeDaPergunta(pergunta);
      const idItem = item["id"];

      itens.push({
        id: typeof idItem === "number" || typeof idItem === "string" ? idItem : null,
        categoria: nomeCategoria,
        pergunta,
        criticidade,
        peso: PESO[criticidade],
        tipo_resposta: score === null ? "texto" : "avaliativo",
        resposta_codigo: score,
        resposta_texto: respostaTexto || rotulo || null,
        comentario: comentario || null,
        nao_conforme: (score !== null && SCORES_NAO_CONFORME.has(score)) || doTexto.naoConforme,
        parcial: (score !== null && SCORES_PARCIAL.has(score)) || doTexto.parcial,
        conforme: (score !== null && SCORES_CONFORME.has(score)) || doTexto.conforme,
        nao_aplicavel: score !== null && SCORES_NAO_APLICAVEL.has(score),
        total_anexos: lista(item["attachments"]).length,
      });
    }
  }

  return itens;
}

function nivelDoPercentual(pct: number | null): ResumoAuditoria["nivel_conformidade"] {
  if (pct === null) return "sem_dados";
  if (pct >= 90) return "excelente";
  if (pct >= 75) return "bom";
  if (pct >= 60) return "regular";
  return "critico";
}

function montarResumo(itens: ItemChecklistFacil[]): ResumoAuditoria {
  const naoConformes = itens.filter((i) => i.nao_conforme).length;
  const parciais = itens.filter((i) => i.parcial).length;

  // Score ponderado: itens de texto livre também entram no cálculo. Só conta
  // quem foi classificado: um código de resposta desconhecido não vira "zero ponto".
  const avaliados = itens.filter((i) => !i.nao_aplicavel && (i.nao_conforme || i.parcial || i.conforme));
  const somaPesos = avaliados.reduce((s, i) => s + i.peso, 0);
  const somaPontos = avaliados.reduce((s, i) => s + i.peso * (i.conforme ? 1 : i.parcial ? 0.5 : 0), 0);
  const percentual = somaPesos > 0 ? Math.round((somaPontos / somaPesos) * 1000) / 10 : null;

  return {
    total_itens_relevantes: itens.length,
    total_nao_conformes: naoConformes,
    total_parciais: parciais,
    total_conformes: itens.filter((i) => i.conforme).length,
    total_nao_aplicaveis: itens.filter((i) => i.nao_aplicavel).length,
    percentual_conformidade: percentual,
    nivel_conformidade: nivelDoPercentual(percentual),
    requer_rag: naoConformes > 0 || parciais > 0,
  };
}

/** Estrutura a resposta crua da API (extract_audit_payload). Exportada para testes. */
export function estruturarAvaliacao(bruto: unknown): AuditoriaChecklistFacil {
  const raw = obj(bruto);
  const itens = extrairItens(raw);
  return { cabecalho: extrairCabecalho(raw), itens, resumo: montarResumo(itens) };
}

// ── Chamada à API ────────────────────────────────────────────────────────────

/**
 * Busca a avaliação e devolve o payload estruturado (fetch_and_structure).
 * Os erros têm mensagem amigável: aparecem direto na tela de revisão.
 */
export async function buscarAuditoriaEstruturada(evaluationId: number): Promise<AuditoriaChecklistFacil> {
  const base = process.env["CHECKLIST_FACIL_INTEGRATION_URL"]?.replace(/\/+$/, "");
  const token = process.env["CHECKLIST_FACIL_API_TOKEN"];
  if (!base || !token) {
    throw new Error(
      "A integração com o Checklist Fácil não está configurada: defina os secrets CHECKLIST_FACIL_INTEGRATION_URL e CHECKLIST_FACIL_API_TOKEN.",
    );
  }

  const url = `${base}/v2/evaluations/${evaluationId}`;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": "pt-br",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const motivo = e instanceof Error && e.name === "TimeoutError" ? "tempo esgotado" : "falha de conexão";
    throw new Error(`Não foi possível consultar o Checklist Fácil (${motivo}). Tente novamente.`);
  }

  if (resposta.status === 401) {
    throw new Error("Token do Checklist Fácil inválido ou expirado. Verifique o secret CHECKLIST_FACIL_API_TOKEN.");
  }
  if (resposta.status === 403) {
    throw new Error("O token do Checklist Fácil não tem permissão para acessar esta avaliação.");
  }
  if (resposta.status === 404) {
    // No Python o 404 virava {"data": []} e a mensagem acabava enganosa.
    throw new Error(`Avaliação #${evaluationId} não encontrada no Checklist Fácil. Confira o número da aplicação.`);
  }
  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => "")).slice(0, 200);
    throw new Error(`Erro ao buscar a avaliação no Checklist Fácil (HTTP ${resposta.status}). ${detalhe}`.trim());
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw new Error(`O Checklist Fácil devolveu uma resposta inválida para a avaliação #${evaluationId}.`);
  }

  // Pode vir como {"data": {...}} ou direto como {...}.
  const dados = obj(corpo)["data"];
  const ehObjeto = dados !== null && typeof dados === "object" && !Array.isArray(dados);
  const auditoria = estruturarAvaliacao(ehObjeto ? dados : corpo);

  if (auditoria.itens.length === 0) {
    throw new Error(
      `A avaliação #${evaluationId} não possui itens respondidos ainda. Responda pelo menos um item no app antes de solicitar a revisão.`,
    );
  }

  return auditoria;
}
