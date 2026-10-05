Parte 2 de 11 — backend (edge functions). Crie os 7 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 2 recebida" com a lista de arquivos.

### `supabase/functions/_shared/http.ts`

````ts
// Utilitários HTTP comuns às edge functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Erro com status HTTP — o `detail` segue o formato de erro da API FastAPI original. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Envolve o handler com CORS, tratamento de HttpError e log de erros inesperados. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ detail: e.message }, e.status);
      console.error("[edge] erro inesperado:", e);
      return json({ detail: "Erro interno do servidor." }, 500);
    }
  });
}

export async function lerCorpo<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Corpo da requisição inválido.");
  }
}

export function env(nome: string, padrao?: string): string {
  const v = Deno.env.get(nome);
  if (v === undefined || v === "") {
    if (padrao !== undefined) return padrao;
    throw new Error(`Variável de ambiente ${nome} não definida.`);
  }
  return v;
}
````
### `supabase/functions/_shared/senha.ts`

````ts
// Política de senha corporativa — porta de validar_forca_senha() e dias_ate_expirar_senha().
// Mantenha em sincronia com src/lib/senha.ts (frontend).

export const VALIDADE_SENHA_DIAS = 90;

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(senha)) return "A senha deve conter pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(senha)) return "A senha deve conter pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(senha)) return "A senha deve conter pelo menos um número.";
  return null;
}

/** Dias até a senha expirar (negativo = expirada). Compara datas de calendário, como o original. */
export function diasAteExpirarSenha(alteradaEm: string | null, validade = VALIDADE_SENHA_DIAS): number {
  if (!alteradaEm) return 0;
  const alterada = new Date(alteradaEm);
  if (Number.isNaN(alterada.getTime())) return validade;
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const expira = dia(alterada) + validade * 86_400_000;
  return Math.round((expira - dia(new Date())) / 86_400_000);
}
````
### `supabase/functions/_shared/auth.ts`

````ts
// Autenticação/autorização das edge functions — substitui require_auth()/require_analista().
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, HttpError } from "./http.ts";
import { diasAteExpirarSenha } from "./senha.ts";

export type Perfil = "auditor" | "analista";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  senha_alterada_em: string;
}

/** Cliente com service role — ignora RLS. Usar só dentro das edge functions. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente anônimo — usado para reverificar a senha atual do usuário. */
export function anonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface Opcoes {
  analista?: boolean;
  /** A troca de senha precisa funcionar justamente quando a senha expirou. */
  permitirSenhaExpirada?: boolean;
}

export async function requireUser(req: Request, opcoes: Opcoes = {}): Promise<Usuario> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Não autenticado.");

  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Não autenticado.");

  const { data: perfil } = await admin
    .from("profiles")
    .select("id, nome, email, ativo, senha_alterada_em, user_roles(role)")
    .eq("id", data.user.id)
    .maybeSingle();

  // O original não checava `ativo` na validação de sessão — um usuário desativado
  // mantinha acesso até a sessão expirar. Aqui o bloqueio é imediato.
  if (!perfil || !perfil.ativo) throw new HttpError(401, "Não autenticado.");

  const roles = perfil.user_roles as { role: Perfil } | { role: Perfil }[] | null;
  const role = (Array.isArray(roles) ? roles[0]?.role : roles?.role) ?? "auditor";

  if (opcoes.analista && role !== "analista") {
    throw new HttpError(403, "Acesso restrito a analistas.");
  }
  if (!opcoes.permitirSenhaExpirada && diasAteExpirarSenha(perfil.senha_alterada_em) < 0) {
    throw new HttpError(403, "Sua senha expirou. Redefina-a para continuar.");
  }

  return {
    id: perfil.id,
    nome: perfil.nome,
    email: perfil.email,
    perfil: role,
    senha_alterada_em: perfil.senha_alterada_em,
  };
}
````
### `supabase/functions/_shared/extracao.ts`

````ts
// Estruturação do payload de auditoria — porta fiel de services/enrichment_service.py.

export const SCORES_NAO_CONFORME = new Set([1, 4]); // Não atingiu
export const SCORES_PARCIAL = new Set([2]); // Atingiu parcialmente
export const SCORES_CONFORME = new Set([3, 5]); // Atingiu / Atingiu totalmente
export const SCORES_NAO_APLICAVEL = new Set([6]); // Não se aplica

const PESO = { "Mandatório": 3.0, "Importantes": 2.0, "Desejáveis": 1.0 } as const;

const SCORE_LABELS: Record<number, string> = {
  1: "Não atingiu",
  2: "Atingiu parcialmente",
  3: "Atingiu",
  4: "Não atingiu",
  5: "Atingiu totalmente",
  6: "Não se aplica",
};

const PALAVRAS_NAO_CONFORME = [
  "não conforme", "nao conforme", "nc", "reprovado",
  "não atende", "nao atende", "não possui", "nao possui",
  "ausente", "inexistente", "irregular", "pendente",
];
const PALAVRAS_PARCIAL = [
  "parcial", "parciallment", "incompleto", "em parte",
  "parcialmente", "insuficiente", "em andamento",
];
const PALAVRAS_CONFORME = [
  "conforme", "ok", "sim", "atende", "possui", "regular",
  "adequado", "existe", "apresentado", "formalizado",
];

export type Criticidade = keyof typeof PESO;

export interface ContextoRag {
  texto: string;
  fonte: string;
  pagina: number;
  score: number;
}

export interface ItemAuditoria {
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
  contexto_rag?: ContextoRag[];
  /** Regra da aba Configurações que casou com o item (null = sem regra). */
  regra?: RegraItem | null;
  parecer?: string | null;
  parecer_modo?: "api" | "mock";
  tem_erro_texto?: boolean;
}

export interface RegraItem {
  habilitado: boolean;
  validacao_tipo: "obrigatorio" | "sugestao";
  exige_imagem: boolean;
}

export interface Cabecalho {
  id: number | null;
  /** ID do modelo de checklist no Checklist Fácil (usado para casar regras de config_itens). */
  checklist_id: number | null;
  checklist_nome: string | null;
  unidade_nome: string | null;
  auditor_nome: string | null;
  departamento: string[];
  status: number | null;
  pontuacao_total: number | null;
  plataforma: number | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  comentario_final: string;
}

export interface Resumo {
  total_itens_relevantes: number;
  total_nao_conformes: number;
  total_parciais: number;
  total_conformes: number;
  total_nao_aplicaveis: number;
  percentual_conformidade: number | null;
  nivel_conformidade: "excelente" | "bom" | "regular" | "critico" | "sem_dados";
  requer_rag: boolean;
  total_com_contexto_rag?: number;
  total_com_parecer?: number;
}

export interface PayloadAuditoria {
  cabecalho: Cabecalho;
  itens: ItemAuditoria[];
  resumo: Resumo;
}

/** Substring simples, como `p in t` no Python ("nc" casa dentro de outras palavras — comportamento original preservado). */
function detectarConformidadeTexto(texto: string): [boolean, boolean, boolean] {
  const t = texto.toLowerCase().trim();
  if (!t) return [false, false, false];
  const nc = PALAVRAS_NAO_CONFORME.some((p) => t.includes(p));
  const parcial = PALAVRAS_PARCIAL.some((p) => t.includes(p)) && !nc;
  const conforme = PALAVRAS_CONFORME.some((p) => t.includes(p)) && !nc && !parcial;
  return [nc, parcial, conforme];
}

export function criticidade(pergunta: string): Criticidade {
  if (pergunta.includes("(Mandatório)")) return "Mandatório";
  if (pergunta.includes("(Importantes)")) return "Importantes";
  return "Desejáveis";
}

// deno-lint-ignore no-explicit-any
type Raw = any;

function extrairCabecalho(raw: Raw): Cabecalho {
  return {
    id: raw.id ?? null,
    checklist_id: raw.checklist?.id ?? null,
    checklist_nome: raw.checklist?.name ?? null,
    unidade_nome: raw.unit?.name ?? null,
    auditor_nome: raw.user?.name ?? null,
    departamento: (raw.departments ?? []).map((d: Raw) => d?.name),
    status: raw.status ?? null,
    pontuacao_total: raw.score ?? null,
    plataforma: raw.platform ?? null,
    data_inicio: raw.startedAt ?? null,
    data_conclusao: raw.concludedAt ?? null,
    comentario_final: raw.finalComment || "",
  };
}

function extrairItens(raw: Raw): ItemAuditoria[] {
  const itens: ItemAuditoria[] = [];
  for (const categoria of raw.categories ?? []) {
    const catNome: string = categoria.name ?? "";
    for (const item of categoria.items ?? []) {
      const answer = item.answer ?? {};
      const comentario: string = (item.comment ?? "").trim();
      const respTexto: string = (answer.text ?? "").trim();
      const score: number | null = answer.evaluative ?? null;

      if (score === null && !comentario && !respTexto) continue;

      const pergunta: string = item.name ?? "";
      const respLabel = score !== null ? SCORE_LABELS[score] ?? null : null;

      const ncScore = score !== null && SCORES_NAO_CONFORME.has(score);
      const parScore = score !== null && SCORES_PARCIAL.has(score);
      const okScore = score !== null && SCORES_CONFORME.has(score);

      let [ncTexto, parTexto, okTexto] = [false, false, false];
      const textoAnalise = respTexto || comentario || "";
      if (score === null && textoAnalise) [ncTexto, parTexto, okTexto] = detectarConformidadeTexto(textoAnalise);

      const crit = criticidade(pergunta);
      itens.push({
        id: item.id ?? null,
        categoria: catNome,
        pergunta,
        criticidade: crit,
        peso: PESO[crit],
        tipo_resposta: score === null ? "texto" : "avaliativo",
        resposta_codigo: score,
        resposta_texto: respTexto || respLabel || null,
        comentario: comentario || null,
        nao_conforme: ncScore || ncTexto,
        parcial: parScore || parTexto,
        conforme: okScore || okTexto,
        nao_aplicavel: score !== null && SCORES_NAO_APLICAVEL.has(score),
        total_anexos: (item.attachments ?? []).length,
      });
    }
  }
  return itens;
}

export function montarResumo(itens: ItemAuditoria[]): Resumo {
  const nc = itens.filter((i) => i.nao_conforme).length;
  const parciais = itens.filter((i) => i.parcial).length;

  // Score ponderado — itens de texto livre também entram no cálculo
  const avaliados = itens.filter(
    (i) => !i.nao_aplicavel && (i.resposta_codigo !== null || i.nao_conforme || i.parcial || i.conforme),
  );
  let percentual: number | null = null;
  if (avaliados.length) {
    const somaPesos = avaliados.reduce((s, i) => s + i.peso, 0);
    const somaPontos = avaliados.reduce((s, i) => s + i.peso * (i.conforme ? 1 : i.parcial ? 0.5 : 0), 0);
    percentual = somaPesos > 0 ? Math.round((somaPontos / somaPesos) * 1000) / 10 : null;
  }

  const nivel: Resumo["nivel_conformidade"] =
    percentual === null ? "sem_dados"
    : percentual >= 90 ? "excelente"
    : percentual >= 75 ? "bom"
    : percentual >= 60 ? "regular"
    : "critico";

  return {
    total_itens_relevantes: itens.length,
    total_nao_conformes: nc,
    total_parciais: parciais,
    total_conformes: itens.filter((i) => i.conforme).length,
    total_nao_aplicaveis: itens.filter((i) => i.nao_aplicavel).length,
    percentual_conformidade: percentual,
    nivel_conformidade: nivel,
    requer_rag: nc > 0 || parciais > 0,
  };
}

export function extrairPayloadAuditoria(raw: Raw): PayloadAuditoria {
  const itens = extrairItens(raw);
  return { cabecalho: extrairCabecalho(raw), itens, resumo: montarResumo(itens) };
}
````
### `supabase/functions/_shared/checklistfacil.ts`

````ts
// Cliente da API Checklist Fácil — porta de api/client.py, audit_service.py,
// filter_service.py e polling_service.py.
import { env, HttpError } from "./http.ts";
import { extrairPayloadAuditoria, type PayloadAuditoria } from "./extracao.ts";

class ChecklistFacilError extends Error {
  constructor(public status: number, public corpo: string) {
    super(`Erro na requisição: ${status} - ${corpo}`);
  }
}

// deno-lint-ignore no-explicit-any
type Json = any;

async function cfGet(endpoint: string, params: Record<string, string | number> = {}, useIntegration = false): Promise<Json> {
  const base = (useIntegration ? env("CHECKLIST_FACIL_INTEGRATION_URL") : env("CHECKLIST_FACIL_BASE_URL")).replace(/\/+$/, "");
  const url = new URL(`${base}/${endpoint.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  console.log(`[API] GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env("CHECKLIST_FACIL_API_TOKEN")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Language": "pt-br",
    },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`[API] Status: ${resp.status}`);

  if (resp.status === 404) return { data: [] };
  if (!resp.ok) throw new ChecklistFacilError(resp.status, await resp.text());
  return await resp.json();
}

// ── Camada 1: listagem + filtro (lote) ─────────────────────────────────────

/** Status Checklist Fácil: 1=Não Iniciado 2=Em Andamento 3=Em Análise 4=Reprovado 5=Reaberto 6=Concluído */
export const STATUS_EM_ANALISE = 3;

export async function listarAuditorias(status = STATUS_EM_ANALISE, limit = 100, page = 1): Promise<Json[]> {
  const data = await cfGet("v1/evaluations", { status, limit, page });
  if (Array.isArray(data)) return data;
  return data?.data ?? data?.evaluations ?? data?.items ?? [];
}

/** Mantém as auditorias iniciadas nos últimos `dias` (startedAt → updatedAt → createdAt). */
export function filtrarRecentes(auditorias: Json[], dias: number): Json[] {
  const corte = Date.now() - dias * 86_400_000;
  return auditorias.filter((a) => {
    const t = Date.parse(a.startedAt || a.updatedAt || a.createdAt || "");
    if (Number.isNaN(t)) {
      console.log(`[FilterService] Auditoria id=${a.evaluationId} sem data válida — ignorada.`);
      return false;
    }
    return t >= corte;
  });
}

// ── Camada 2: detalhe de uma avaliação ─────────────────────────────────────

/**
 * Busca a avaliação na API de Integração (v2) e estrutura o payload.
 * Lança HttpError(400) com mensagem amigável, como fetch_and_structure().
 */
export async function buscarEEstruturar(evaluationId: number): Promise<PayloadAuditoria> {
  let raw: Json;
  try {
    raw = await cfGet(`v2/evaluations/${evaluationId}`, {}, true);
  } catch (e) {
    if (e instanceof ChecklistFacilError) {
      if (e.status === 401) throw new HttpError(400, "Token inválido ou expirado. Verifique a configuração.");
      if (e.status === 403) throw new HttpError(400, "Sem permissão para acessar esta avaliação.");
      throw new HttpError(400, `Erro ao buscar avaliação: ${e.message}`);
    }
    console.error(`Erro ao buscar avaliação ${evaluationId}:`, e);
    throw new HttpError(500, "Erro ao buscar avaliação na API do Checklist Fácil.");
  }

  if (raw && !Array.isArray(raw.data) && typeof raw.data === "object" && raw.data !== null) raw = raw.data;
  if (!raw || (Array.isArray(raw.data) && raw.data.length === 0 && !raw.id)) {
    throw new HttpError(400, `Avaliação #${evaluationId} não encontrada.`);
  }

  const payload = extrairPayloadAuditoria(raw);
  if (!payload.itens.length) {
    throw new HttpError(
      400,
      `Avaliação #${evaluationId} não possui itens respondidos ainda. ` +
        "Responda pelo menos um item no app antes de solicitar revisão.",
    );
  }
  return payload;
}
````
### `supabase/functions/_shared/rag.ts`

````ts
// Consulta RAG — porta de query_item()/query_items_batch() do rag_service.py.
// ChromaDB + TF-IDF foi substituído por full-text search do Postgres (função buscar_normas).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./http.ts";
import type { ContextoRag, ItemAuditoria } from "./extracao.ts";

function textoConsulta(item: ItemAuditoria): string {
  return [item.categoria, item.pergunta, item.comentario, item.resposta_texto].filter(Boolean).join(" | ");
}

export async function totalChunks(admin: SupabaseClient): Promise<number> {
  const { count } = await admin.from("normas_chunks").select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function consultarItem(admin: SupabaseClient, item: ItemAuditoria, topK: number): Promise<ContextoRag[]> {
  const { data, error } = await admin.rpc("buscar_normas", { consulta: textoConsulta(item), top_k: topK });
  if (error) {
    console.error("[RAGService] erro na busca:", error.message);
    return [];
  }
  return (data ?? []).map((r: ContextoRag) => ({
    texto: r.texto,
    fonte: r.fonte,
    pagina: r.pagina,
    score: Math.round(r.score * 10_000) / 10_000,
  }));
}

/** Enriquece itens com contexto normativo (apenas não conformes e parciais). */
export async function consultarItensLote(admin: SupabaseClient, itens: ItemAuditoria[]): Promise<ItemAuditoria[]> {
  if ((await totalChunks(admin)) === 0) {
    console.log("[ParecerService] Base normativa vazia — RAG desativado.");
    return itens.map((i) => ({ ...i, contexto_rag: [] }));
  }
  const topK = Number(env("RAG_TOP_K", "3"));
  return await Promise.all(
    itens.map(async (i) =>
      (i.nao_conforme || i.parcial) && i.regra?.habilitado !== false
        ? { ...i, contexto_rag: await consultarItem(admin, i, topK) }
        : { ...i, contexto_rag: [] }
    ),
  );
}
````
### `supabase/functions/_shared/regras.ts`

````ts
// Aplicação das regras da aba Configurações (tabela config_itens).
// No sistema original as regras eram salvas mas nunca lidas pelo pipeline.
//
// Casamento: config_itens.checklist_id pode ser o ID do modelo de checklist OU o
// número da aplicação (as regras já cadastradas usam o número da aplicação), e
// item_nome é comparado com a pergunta ignorando maiúsculas, acentos e espaços extras.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Cabecalho, ItemAuditoria, RegraItem } from "./extracao.ts";

export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function aplicarRegras(
  admin: SupabaseClient,
  cab: Cabecalho,
  itens: ItemAuditoria[],
): Promise<ItemAuditoria[]> {
  const ids = [cab.id, cab.checklist_id].filter((v) => v !== null && v !== undefined).map(String);
  if (!ids.length) return itens.map((i) => ({ ...i, regra: null }));

  const { data, error } = await admin
    .from("config_itens")
    .select("item_nome, habilitado, validacao_tipo, exige_imagem, checklist_id")
    .in("checklist_id", ids);
  if (error) {
    console.warn("[Regras] erro ao ler config_itens:", error.message);
    return itens.map((i) => ({ ...i, regra: null }));
  }

  // Regra da aplicação específica tem precedência sobre a do modelo de checklist
  const porNome = new Map<string, RegraItem>();
  const ordenadas = [...(data ?? [])].sort((a, b) => Number(a.checklist_id === String(cab.id)) - Number(b.checklist_id === String(cab.id)));
  for (const r of ordenadas) {
    porNome.set(normalizarNome(r.item_nome), {
      habilitado: r.habilitado,
      validacao_tipo: r.validacao_tipo,
      exige_imagem: r.exige_imagem,
    });
  }
  return itens.map((i) => ({ ...i, regra: porNome.get(normalizarNome(i.pergunta)) ?? null }));
}
````
