export type Perfil = "auditor" | "analista";
export type Nivel = "excelente" | "bom" | "regular" | "critico" | "sem_dados";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  senha_alterada_em: string;
  ultimo_acesso?: string | null;
}

// ── Resposta de /revisar ────────────────────────────────────────────────────
export interface ItemSugestao {
  item_id: number | null;
  categoria: string;
  pergunta: string;
  criticidade: string;
  obrigatorio: boolean;
  resposta_original: string;
  sugestao: string | null;
  texto_campo: string | null;
  justificativa: string | null;
  sugestao_id: number | null;
  regra_tipo: "obrigatorio" | "sugestao" | null;
  ia_desabilitada: boolean;
  exige_imagem: boolean;
  total_anexos: number;
}

export interface ResultadoRevisao {
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
    nivel_conformidade: Nivel;
  };
  sugestoes: { itens: ItemSugestao[]; parecer: string };
}

// ── Tabelas ────────────────────────────────────────────────────────────────
export interface AuditoriaRow {
  id: number;
  evaluation_id: number;
  checklist: string | null;
  unidade: string | null;
  auditor_cf: string | null;
  data_inicio: string | null;
  status_cf: number | null;
  percentual_conformidade: number | null;
  nivel_conformidade: Nivel | null;
  total_itens: number;
  total_nc: number;
  total_parciais: number;
  total_reprocessamentos: number;
  processado_em: string;
}

export interface ReprocessamentoRow {
  id: number;
  processado_em: string;
  percentual_conformidade: number | null;
  nivel_conformidade: Nivel | null;
  total_nc: number;
  profiles: { nome: string } | null;
}

export interface ScoreAuditor {
  auditor: string;
  total_auditorias: number;
  media_score: number | null;
  total_nc: number;
  total_sugestoes: number;
  sugestoes_aceitas: number;
  sugestoes_ignoradas: number;
  taxa_aceitacao: number | null;
}

export interface ConfigItem {
  id: number;
  checklist_id: string;
  item_nome: string;
  habilitado: boolean;
  validacao_tipo: "obrigatorio" | "sugestao";
  exige_imagem: boolean;
}

export interface UsuarioInativo {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  ultimo_acesso: string | null;
  dias_inativo: number;
}

// ── Payload completo (coluna auditorias.payload) — usado no Excel ─────────
export interface PayloadItem {
  id: number | null;
  categoria: string;
  pergunta: string;
  tipo_resposta: "texto" | "avaliativo";
  resposta_codigo: number | null;
  resposta_texto: string | null;
  comentario: string | null;
  nao_conforme: boolean;
  parcial: boolean;
  parecer?: string | null;
}

export interface Payload {
  cabecalho: {
    id: number;
    checklist_nome: string | null;
    unidade_nome: string | null;
    auditor_nome: string | null;
    departamento: string[];
    data_inicio: string | null;
    data_conclusao: string | null;
  };
  itens: PayloadItem[];
  resumo: {
    total_itens_relevantes: number;
    total_nao_conformes: number;
    total_parciais: number;
    requer_rag: boolean;
    total_com_parecer?: number;
  };
}
