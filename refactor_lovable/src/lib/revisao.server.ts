import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  type AuditoriaChecklistFacil,
  buscarAuditoriaEstruturada,
} from "@/lib/checklist-facil.server";
import {
  type ItemAuditoria,
  type ParecerItem,
  type SugestaoItem,
  gerarParecer,
} from "@/lib/parecer.server";

/** Fluxo de POST /api/revisar: busca → parecer com IA → grava no banco. */

type Db = SupabaseClient<Database>;

/**
 * Revisão completa guardada em auditorias.payload (equivale aos JSONs de
 * output/ do Python). Os itens mantêm todos os campos vindos do Checklist
 * Fácil (tipo_resposta, resposta_codigo…) mais o parecer gerado.
 */
export type PayloadRevisao = {
  cabecalho: AuditoriaChecklistFacil["cabecalho"];
  resumo: AuditoriaChecklistFacil["resumo"];
  itens: (ItemAuditoria & { parecer: ParecerItem | null; erro_parecer: string | null })[];
  parecer_geral: string;
  gerado_em: string;
};

export type SugestaoRevisao = SugestaoItem & {
  /** Id em public.sugestoes, para o feedback. null se a gravação falhou. */
  sugestao_id: number | null;
};

export type ResultadoRevisao = {
  evaluation_id: number;
  checklist: string;
  unidade: string;
  auditor: string;
  data_inicio: string;
  resumo: {
    status: number | null;
    respondidos: number;
    nao_conformes: number;
    parciais: number;
    conformes: number;
    percentual_conformidade: number | null;
    nivel_conformidade: string;
  };
  sugestoes: { itens: SugestaoRevisao[]; parecer: string };
  /** false quando a revisão foi gerada mas não pôde ser gravada no banco (não aparece no painel). */
  salvo: boolean;
  /** Motivo da falha de gravação, em linguagem clara (null se salvou). */
  erro_salvar: string | null;
};

export async function executarRevisao(
  db: Db,
  admin: Db,
  userId: string,
  evaluationId: number,
): Promise<ResultadoRevisao> {
  const ativo = await db.rpc("is_active_user", { _user_id: userId });
  if (ativo.error || !ativo.data) {
    throw new Error("Seu acesso ainda não foi liberado por um analista.");
  }

  const auditoria = await buscarAuditoriaEstruturada(evaluationId);
  const { cabecalho, resumo } = auditoria;

  const resultado = await gerarParecer(
    { cabecalho, itens: auditoria.itens },
    { db, admin, userId, evaluationId },
  );

  // gerarParecer devolve os itens na mesma ordem da entrada.
  const payload: PayloadRevisao = {
    cabecalho,
    resumo,
    itens: auditoria.itens.map((item, i) => ({
      ...item,
      parecer: resultado.itens[i]?.parecer ?? null,
      erro_parecer: resultado.itens[i]?.erro ?? null,
    })),
    parecer_geral: resultado.parecer,
    gerado_em: new Date().toISOString(),
  };

  const gravacao = await persistir(admin, evaluationId, userId, auditoria, resultado.itens, payload);

  return {
    evaluation_id: evaluationId,
    checklist: cabecalho.checklist_nome ?? "",
    unidade: cabecalho.unidade_nome ?? "",
    auditor: cabecalho.auditor_nome ?? "",
    data_inicio: cabecalho.data_inicio ?? "",
    resumo: {
      status: cabecalho.status ?? null,
      respondidos: resumo.total_itens_relevantes,
      nao_conformes: resumo.total_nao_conformes,
      parciais: resumo.total_parciais,
      conformes: resumo.total_conformes,
      percentual_conformidade: resumo.percentual_conformidade,
      nivel_conformidade: resumo.nivel_conformidade || "sem_dados",
    },
    sugestoes: {
      itens: resultado.itens.map((item) => ({
        ...item,
        sugestao_id: item.item_id === null ? null : (gravacao.ids.get(String(item.item_id)) ?? null),
      })),
      parecer: resultado.parecer,
    },
    salvo: gravacao.erro === null,
    erro_salvar: gravacao.erro,
  };
}

/** Traduz as falhas mais comuns de gravação para algo que dê para agir. */
function explicarFalhaDeGravacao(mensagem: string): string {
  const m = mensagem.toLowerCase();
  let explicacao: string | null = null;

  if (m.includes("could not find the function") || m.includes("pgrst202") || m.includes("schema cache")) {
    explicacao =
      "o banco não tem a função registrar_auditoria na versão esperada (com o parâmetro p_payload). Aplique as migrations pendentes.";
  } else if (m.includes("missing supabase environment") || m.includes("service_role_key")) {
    explicacao = "faltam os secrets do Supabase no servidor (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).";
  } else if (m.includes("permission denied") || m.includes("42501")) {
    explicacao = "o servidor não tem permissão para gravar no banco; confira se usa a chave service_role.";
  } else if (m.includes("foreign key") || m.includes("23503")) {
    explicacao = "o usuário logado não existe na tabela de usuários do banco.";
  } else if (m.includes("does not exist") || m.includes("42p01")) {
    explicacao = "uma tabela ou coluna esperada não existe no banco. Aplique as migrations pendentes.";
  }

  const tecnico = mensagem.slice(0, 220);
  return explicacao ? `${explicacao} (Detalhe: ${tecnico})` : tecnico;
}

/**
 * Grava auditoria, histórico e sugestões. Falha aqui não impede de mostrar o
 * resultado, mas agora é informada na tela (`salvo` / `erro_salvar`): antes
 * ficava só no log e o painel simplesmente aparecia vazio.
 */
async function persistir(
  admin: Db,
  evaluationId: number,
  userId: string,
  auditoria: AuditoriaChecklistFacil,
  itens: SugestaoItem[],
  payload: PayloadRevisao,
): Promise<{ ids: Map<string, number>; erro: string | null }> {
  try {
    const { data: auditoriaId, error } = await admin.rpc("registrar_auditoria", {
      p_evaluation_id: evaluationId,
      p_user_id: userId,
      p_cabecalho: auditoria.cabecalho as unknown as Json,
      p_resumo: auditoria.resumo as unknown as Json,
      p_itens: itens as unknown as Json,
      p_payload: payload as unknown as Json,
    });
    if (error) {
      throw new Error(error.message);
    }

    const { data: sugestoes, error: erroSugestoes } = await admin
      .from("sugestoes")
      .select("id, item_id")
      .eq("auditoria_id", auditoriaId)
      .is("substituida_em", null);
    if (erroSugestoes) {
      throw new Error(erroSugestoes.message);
    }

    return {
      ids: new Map(sugestoes.flatMap((s) => (s.item_id === null ? [] : [[String(s.item_id), s.id] as const]))),
      erro: null,
    };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.warn(`[Revisão] Erro ao gravar a auditoria ${evaluationId}: ${mensagem}`);
    return { ids: new Map(), erro: explicarFalhaDeGravacao(mensagem) };
  }
}
