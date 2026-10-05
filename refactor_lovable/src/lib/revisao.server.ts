import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  type AuditoriaChecklistFacil,
  buscarAuditoriaEstruturada,
} from "@/lib/checklist-facil.server";
import { type SugestaoItem, gerarParecer } from "@/lib/parecer.server";

/** Fluxo de POST /api/revisar: busca → parecer com IA → grava no banco. */

type Db = SupabaseClient<Database>;

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

  const idsSugestoes = await persistir(admin, evaluationId, userId, auditoria, resultado.itens);

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
        sugestao_id: item.item_id === null ? null : (idsSugestoes.get(String(item.item_id)) ?? null),
      })),
      parecer: resultado.parecer,
    },
  };
}

/**
 * Grava auditoria, histórico e sugestões. Igual ao Python, falha aqui não
 * impede de mostrar o resultado: só fica sem feedback por item.
 */
async function persistir(
  admin: Db,
  evaluationId: number,
  userId: string,
  auditoria: AuditoriaChecklistFacil,
  itens: SugestaoItem[],
): Promise<Map<string, number>> {
  try {
    const { data: auditoriaId, error } = await admin.rpc("registrar_auditoria", {
      p_evaluation_id: evaluationId,
      p_user_id: userId,
      p_cabecalho: auditoria.cabecalho as unknown as Json,
      p_resumo: auditoria.resumo as unknown as Json,
      p_itens: itens as unknown as Json,
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

    return new Map(
      sugestoes.flatMap((s) => (s.item_id === null ? [] : [[String(s.item_id), s.id] as const])),
    );
  } catch (e) {
    console.warn(
      `[Revisão] Erro ao gravar a auditoria ${evaluationId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return new Map();
  }
}
