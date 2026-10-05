import type { CabecalhoAuditoria, ItemAuditoria } from "@/lib/parecer.server";

/**
 * Integração com o Checklist Fácil (substitui polling_service + enrichment_service).
 *
 * PENDENTE — Parte 3b: falta definir qual API devolve o detalhe da avaliação
 * (Integration `v2/evaluations/{id}` estava com 404; Analytics responde a
 * listagem). Enquanto isso, esta função falha com uma mensagem clara e o
 * restante do fluxo de revisão já está ligado.
 */

export type ResumoAuditoria = {
  total_itens_relevantes: number;
  total_nao_conformes: number;
  total_parciais: number;
  total_conformes: number;
  percentual_conformidade: number | null;
  nivel_conformidade: string;
};

export type AuditoriaChecklistFacil = {
  cabecalho: CabecalhoAuditoria & {
    data_inicio?: string | null;
    status?: number | null;
  };
  itens: ItemAuditoria[];
  resumo: ResumoAuditoria;
};

export async function buscarAuditoriaEstruturada(
  evaluationId: number,
): Promise<AuditoriaChecklistFacil> {
  throw new Error(
    `A busca da avaliação #${evaluationId} no Checklist Fácil ainda não foi portada (Parte 3b).`,
  );
}
