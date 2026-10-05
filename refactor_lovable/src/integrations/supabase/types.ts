// Tipos do banco no formato do `supabase gen types`. No Lovable Cloud este
// arquivo é gerado a partir do banco real; esta versão foi escrita a partir
// de supabase/migrations para o build local. Ao gerar o oficial, substituir.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AppRole = "analista" | "auditor";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nome: string;
          email: string;
          ativo: boolean;
          criado_em: string;
          ultimo_acesso: string | null;
        };
        Insert: {
          id: string;
          nome: string;
          email: string;
          ativo?: boolean;
          criado_em?: string;
          ultimo_acesso?: string | null;
        };
        Update: {
          id?: string;
          nome?: string;
          email?: string;
          ativo?: boolean;
          criado_em?: string;
          ultimo_acesso?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: { id: number; user_id: string; role: AppRole };
        Insert: { id?: never; user_id: string; role: AppRole };
        Update: { id?: never; user_id?: string; role?: AppRole };
        Relationships: [];
      };
      usuarios_autorizados: {
        Row: {
          email: string;
          nome: string;
          perfil: AppRole;
          criado_por: string | null;
          criado_em: string;
        };
        Insert: {
          email: string;
          nome: string;
          perfil?: AppRole;
          criado_por?: string | null;
          criado_em?: string;
        };
        Update: {
          email?: string;
          nome?: string;
          perfil?: AppRole;
          criado_por?: string | null;
          criado_em?: string;
        };
        Relationships: [];
      };
      auditorias: {
        Row: {
          id: number;
          evaluation_id: number;
          user_id: string | null;
          checklist: string | null;
          unidade: string | null;
          auditor_cf: string | null;
          data_inicio: string | null;
          status_cf: number | null;
          percentual_conformidade: number | null;
          nivel_conformidade: string | null;
          total_itens: number;
          total_nc: number;
          total_parciais: number;
          total_conformes: number;
          total_reprocessamentos: number;
          processado_em: string;
          atualizado_em: string;
          payload: Json | null;
        };
        Insert: {
          id?: never;
          evaluation_id: number;
          user_id?: string | null;
          checklist?: string | null;
          unidade?: string | null;
          auditor_cf?: string | null;
          data_inicio?: string | null;
          status_cf?: number | null;
          percentual_conformidade?: number | null;
          nivel_conformidade?: string | null;
          total_itens?: number;
          total_nc?: number;
          total_parciais?: number;
          total_conformes?: number;
          total_reprocessamentos?: number;
          processado_em?: string;
          atualizado_em?: string;
          payload?: Json | null;
        };
        Update: {
          id?: never;
          evaluation_id?: number;
          user_id?: string | null;
          checklist?: string | null;
          unidade?: string | null;
          auditor_cf?: string | null;
          data_inicio?: string | null;
          status_cf?: number | null;
          percentual_conformidade?: number | null;
          nivel_conformidade?: string | null;
          total_itens?: number;
          total_nc?: number;
          total_parciais?: number;
          total_conformes?: number;
          total_reprocessamentos?: number;
          processado_em?: string;
          atualizado_em?: string;
          payload?: Json | null;
        };
        Relationships: [];
      };
      reprocessamentos: {
        Row: {
          id: number;
          evaluation_id: number;
          user_id: string | null;
          percentual_conformidade: number | null;
          nivel_conformidade: string | null;
          total_itens: number;
          total_nc: number;
          processado_em: string;
        };
        Insert: {
          id?: never;
          evaluation_id: number;
          user_id?: string | null;
          percentual_conformidade?: number | null;
          nivel_conformidade?: string | null;
          total_itens?: number;
          total_nc?: number;
          processado_em?: string;
        };
        Update: {
          id?: never;
          evaluation_id?: number;
          user_id?: string | null;
          percentual_conformidade?: number | null;
          nivel_conformidade?: string | null;
          total_itens?: number;
          total_nc?: number;
          processado_em?: string;
        };
        Relationships: [];
      };
      sugestoes: {
        Row: {
          id: number;
          auditoria_id: number;
          reprocessamento_id: number | null;
          item_id: number | null;
          categoria: string | null;
          pergunta: string | null;
          criticidade: string | null;
          resposta_original: string | null;
          sugestao_ia: string | null;
          tipo: string;
          aceita: boolean | null;
          aceita_em: string | null;
          aceita_por: string | null;
          substituida_em: string | null;
        };
        Insert: {
          id?: never;
          auditoria_id: number;
          reprocessamento_id?: number | null;
          item_id?: number | null;
          categoria?: string | null;
          pergunta?: string | null;
          criticidade?: string | null;
          resposta_original?: string | null;
          sugestao_ia?: string | null;
          tipo?: string;
          aceita?: boolean | null;
          aceita_em?: string | null;
          aceita_por?: string | null;
          substituida_em?: string | null;
        };
        Update: {
          id?: never;
          auditoria_id?: number;
          reprocessamento_id?: number | null;
          item_id?: number | null;
          categoria?: string | null;
          pergunta?: string | null;
          criticidade?: string | null;
          resposta_original?: string | null;
          sugestao_ia?: string | null;
          tipo?: string;
          aceita?: boolean | null;
          aceita_em?: string | null;
          aceita_por?: string | null;
          substituida_em?: string | null;
        };
        Relationships: [];
      };
      config_itens: {
        Row: {
          id: number;
          checklist_id: string;
          item_nome: string;
          habilitado: boolean;
          validacao_tipo: string;
          exige_imagem: boolean;
          criado_por: string | null;
          atualizado_em: string;
        };
        Insert: {
          id?: never;
          checklist_id?: string;
          item_nome: string;
          habilitado?: boolean;
          validacao_tipo?: string;
          exige_imagem?: boolean;
          criado_por?: string | null;
          atualizado_em?: string;
        };
        Update: {
          id?: never;
          checklist_id?: string;
          item_nome?: string;
          habilitado?: boolean;
          validacao_tipo?: string;
          exige_imagem?: boolean;
          criado_por?: string | null;
          atualizado_em?: string;
        };
        Relationships: [];
      };
      uso_tokens: {
        Row: {
          id: number;
          evaluation_id: number | null;
          user_id: string | null;
          modelo: string | null;
          tipo_chamada: string | null;
          tokens_input: number;
          tokens_output: number;
          tokens_total: number | null;
          custo_usd: number | null;
          criado_em: string;
        };
        Insert: {
          id?: never;
          evaluation_id?: number | null;
          user_id?: string | null;
          modelo?: string | null;
          tipo_chamada?: string | null;
          tokens_input?: number;
          tokens_output?: number;
          tokens_total?: never;
          custo_usd?: number | null;
          criado_em?: string;
        };
        Update: {
          id?: never;
          evaluation_id?: number | null;
          user_id?: string | null;
          modelo?: string | null;
          tipo_chamada?: string | null;
          tokens_input?: number;
          tokens_output?: number;
          tokens_total?: never;
          custo_usd?: number | null;
          criado_em?: string;
        };
        Relationships: [];
      };
      normas_chunks: {
        Row: {
          id: number;
          fonte: string;
          pagina: number;
          chunk_index: number;
          texto: string;
          tsv: unknown | null;
          criado_em: string;
        };
        Insert: {
          id?: never;
          fonte: string;
          pagina: number;
          chunk_index: number;
          texto: string;
          tsv?: never;
          criado_em?: string;
        };
        Update: {
          id?: never;
          fonte?: string;
          pagina?: number;
          chunk_index?: number;
          texto?: string;
          tsv?: never;
          criado_em?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: AppRole };
        Returns: boolean;
      };
      is_active_user: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      is_analista: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      try_timestamptz: {
        Args: { _valor: string };
        Returns: string;
      };
      registrar_auditoria: {
        Args: {
          p_evaluation_id: number;
          p_user_id: string;
          p_cabecalho: Json;
          p_resumo: Json;
          p_itens?: Json;
          p_payload?: Json;
        };
        Returns: number;
      };
      score_auditores: {
        Args: never;
        Returns: {
          auditor: string;
          total_auditorias: number;
          media_score: number | null;
          total_nc: number;
          total_sugestoes: number;
          sugestoes_aceitas: number;
          sugestoes_ignoradas: number;
          taxa_aceitacao: number | null;
        }[];
      };
      resumo_uso_tokens: {
        Args: { dias?: number };
        Returns: {
          total_chamadas: number;
          total_input: number;
          total_output: number;
          total_tokens: number;
          custo_total_usd: number;
          auditorias_processadas: number;
        }[];
      };
      uso_tokens_por_dia: {
        Args: { dias?: number };
        Returns: {
          dia: string;
          tokens: number | null;
          custo_usd: number | null;
          chamadas: number;
        }[];
      };
      listar_inativos: {
        Args: { dias?: number };
        Returns: {
          id: string;
          nome: string;
          email: string;
          perfil: AppRole | null;
          ativo: boolean;
          ultimo_acesso: string | null;
          dias_inativo: number;
        }[];
      };
      buscar_normas: {
        Args: { consulta: string; top_k?: number };
        Returns: {
          texto: string;
          fonte: string;
          pagina: number;
          score: number;
        }[];
      };
      listar_normas: {
        Args: never;
        Returns: {
          fonte: string;
          total_chunks: number;
          paginas: number;
          indexado_em: string;
        }[];
      };
    };
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
