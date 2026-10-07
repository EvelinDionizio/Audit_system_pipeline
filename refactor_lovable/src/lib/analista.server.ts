import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PayloadRevisao } from "@/lib/revisao.server";
import { senhaVencida } from "@/lib/senha";

/**
 * Leituras e escritas do Painel do Analista (substitui os endpoints
 * /api/auditorias, /api/score-auditores, /api/uso-tokens, /api/usuarios*
 * e /api/config-itens). Recebem o client que age como o usuário: o RLS
 * garante que só o analista enxerga e altera esses dados.
 */

type Db = SupabaseClient<Database>;
type Papel = Database["public"]["Enums"]["app_role"];

function falhar(contexto: string, error: { message: string } | null): asserts error is null {
  if (error) {
    throw new Error(`${contexto}: ${error.message}`);
  }
}


// ── Auditorias ───────────────────────────────────────────────────────────────

export type FiltroAuditorias = {
  status: number[];
  limite: number;
  de?: string | undefined;
  ate?: string | undefined;
};

/**
 * Mesmos filtros de GET /api/auditorias: status (aceitando registros sem
 * status), intervalo de data_inicio e quantidade, sobre o histórico gravado.
 */
export async function listarAuditorias(db: Db, filtro: FiltroAuditorias) {
  const { data, error } = await db
    .from("auditorias")
    .select(
      "id, evaluation_id, checklist, unidade, auditor_cf, data_inicio, status_cf, percentual_conformidade, nivel_conformidade, total_itens, total_nc, total_parciais, total_reprocessamentos, processado_em",
    )
    .order("data_inicio", { ascending: false, nullsFirst: false })
    .limit(500);
  falhar("Erro ao listar auditorias", error);

  return data
    .filter((a) => {
      if (filtro.status.length && a.status_cf !== null && !filtro.status.includes(a.status_cf)) return false;
      const dia = (a.data_inicio ?? "").slice(0, 10);
      if (filtro.de && dia && dia < filtro.de) return false;
      if (filtro.ate && dia && dia > filtro.ate) return false;
      return true;
    })
    .slice(0, filtro.limite);
}

export async function historicoReprocessamentos(db: Db, evaluationId: number) {
  const { data, error } = await db
    .from("reprocessamentos")
    .select("id, processado_em, percentual_conformidade, nivel_conformidade, total_nc, user_id")
    .eq("evaluation_id", evaluationId)
    .order("processado_em", { ascending: false });
  falhar("Erro ao buscar o histórico", error);

  const ids = [...new Set(data.flatMap((r) => (r.user_id ? [r.user_id] : [])))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const perfis = await db.from("profiles").select("id, nome").in("id", ids);
    falhar("Erro ao buscar nomes", perfis.error);
    for (const p of perfis.data) nomes.set(p.id, p.nome);
  }

  return data.map(({ user_id, ...r }) => ({
    ...r,
    usuario_nome: user_id ? (nomes.get(user_id) ?? null) : null,
  }));
}


/**
 * Revisões completas para a exportação Excel (substitui
 * load_payloads_from_output). Mantém a ordem dos ids pedidos e ignora
 * auditorias sem payload (processadas antes desta versão).
 */
export async function payloadsParaExportacao(db: Db, evaluationIds: number[]) {
  const { data, error } = await db
    .from("auditorias")
    .select("evaluation_id, payload")
    .in("evaluation_id", evaluationIds);
  falhar("Erro ao buscar as auditorias para exportação", error);

  const porId = new Map(data.map((a) => [a.evaluation_id, a.payload]));
  return evaluationIds.flatMap((id) => {
    const payload = porId.get(id);
    return payload ? [{ evaluation_id: id, payload: payload as unknown as PayloadRevisao }] : [];
  });
}


// ── Indicadores e tokens ─────────────────────────────────────────────────────

export async function scoreAuditores(db: Db) {
  const { data, error } = await db.rpc("score_auditores");
  falhar("Erro ao calcular indicadores", error);
  return data;
}

export async function usoTokens(db: Db, dias: number) {
  const [resumo, porDia] = await Promise.all([
    db.rpc("resumo_uso_tokens", { dias }),
    db.rpc("uso_tokens_por_dia", { dias }),
  ]);
  falhar("Erro ao carregar o resumo de tokens", resumo.error);
  falhar("Erro ao carregar o uso por dia", porDia.error);
  return { resumo: resumo.data[0] ?? null, porDia: porDia.data };
}


// ── Usuários ─────────────────────────────────────────────────────────────────

export type UsuarioPainel = {
  email: string;
  nome: string;
  /** Papel definido no pré-cadastro (null = logou sem ser autorizado). */
  perfil: Papel | null;
  autorizado: boolean;
  /** null = autorizado, mas ainda não fez o primeiro login. */
  profileId: string | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  /** sso = Microsoft; senha = externo (e-mail e senha). */
  tipo_acesso: "sso" | "senha";
  /** Externo que ainda não trocou a senha provisória. */
  deve_trocar_senha: boolean;
  /** Externo com a senha própria vencida (mais de 90 dias). */
  senha_vencida: boolean;
};

/** Junta pré-cadastros (usuarios_autorizados) e quem já logou (profiles). */
export async function listarUsuarios(db: Db): Promise<UsuarioPainel[]> {
  const [autorizados, perfis] = await Promise.all([
    db.from("usuarios_autorizados").select("email, nome, perfil, tipo_acesso"),
    db.from("profiles").select("id, nome, email, ativo, ultimo_acesso, tipo_acesso, deve_trocar_senha, senha_alterada_em"),
  ]);
  falhar("Erro ao listar autorizações", autorizados.error);
  falhar("Erro ao listar perfis", perfis.error);

  const perfilPorEmail = new Map(perfis.data.map((p) => [p.email, p]));
  const lista: UsuarioPainel[] = autorizados.data.map((a) => {
    const p = perfilPorEmail.get(a.email);
    return {
      email: a.email,
      nome: a.nome,
      perfil: a.perfil,
      autorizado: true,
      profileId: p?.id ?? null,
      ativo: p?.ativo ?? false,
      ultimo_acesso: p?.ultimo_acesso ?? null,
      tipo_acesso: a.tipo_acesso,
      deve_trocar_senha: p?.deve_trocar_senha ?? false,
      senha_vencida: p ? senhaVencida(p) : false,
    };
  });

  const emailsAutorizados = new Set(autorizados.data.map((a) => a.email));
  for (const p of perfis.data) {
    if (!emailsAutorizados.has(p.email)) {
      lista.push({
        email: p.email,
        nome: p.nome,
        perfil: null,
        autorizado: false,
        profileId: p.id,
        ativo: p.ativo,
        ultimo_acesso: p.ultimo_acesso,
        tipo_acesso: p.tipo_acesso,
        deve_trocar_senha: p.deve_trocar_senha,
        senha_vencida: senhaVencida(p),
      });
    }
  }

  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Cria ou atualiza o pré-cadastro (substitui POST /api/usuarios e PATCH
 * /api/usuarios/{id}/perfil). O trigger aplica o papel e ativa o perfil.
 */
export async function autorizarUsuario(
  db: Db,
  criadoPor: string,
  usuario: { email: string; nome: string; perfil: Papel },
) {
  const { error } = await db.from("usuarios_autorizados").upsert(
    { email: usuario.email.toLowerCase(), nome: usuario.nome, perfil: usuario.perfil, criado_por: criadoPor },
    { onConflict: "email" },
  );
  falhar("Erro ao salvar o usuário", error);
}

/** Ativa/desativa quem já logou (substitui PATCH /api/usuarios/{id}). */
export async function definirAtivo(db: Db, profileId: string, ativo: boolean) {
  const { error } = await db.from("profiles").update({ ativo }).eq("id", profileId);
  falhar("Erro ao alterar o status", error);
}

/** Remove o pré-cadastro e desativa o perfil (substitui DELETE /api/usuarios/{id}). */
export async function removerAutorizacao(db: Db, email: string) {
  const { error } = await db.from("usuarios_autorizados").delete().eq("email", email.toLowerCase());
  falhar("Erro ao remover o acesso", error);
}

export async function listarInativos(db: Db, dias: number) {
  const { data, error } = await db.rpc("listar_inativos", { dias });
  falhar("Erro ao buscar inativos", error);
  return data;
}


// ── Configuração de itens ────────────────────────────────────────────────────

export type RegraItem = {
  checklist_id: string;
  item_nome: string;
  habilitado: boolean;
  validacao_tipo: "obrigatorio" | "sugestao";
  exige_imagem: boolean;
};

export async function listarConfigItens(db: Db) {
  const { data, error } = await db
    .from("config_itens")
    .select("id, checklist_id, item_nome, habilitado, validacao_tipo, exige_imagem")
    .order("checklist_id")
    .order("item_nome");
  falhar("Erro ao listar regras", error);
  return data;
}

export async function salvarConfigItem(db: Db, regra: RegraItem) {
  const { error } = await db.from("config_itens").upsert(regra, { onConflict: "checklist_id,item_nome" });
  falhar("Erro ao salvar a regra", error);
}
