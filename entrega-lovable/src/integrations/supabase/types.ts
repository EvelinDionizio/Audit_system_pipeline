export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      auditorias: {
        Row: {
          atualizado_em: string
          auditor_cf: string | null
          checklist: string | null
          data_inicio: string | null
          evaluation_id: number
          id: number
          nivel_conformidade: string | null
          payload: Json | null
          percentual_conformidade: number | null
          processado_em: string
          status_cf: number | null
          total_conformes: number
          total_itens: number
          total_nc: number
          total_parciais: number
          total_reprocessamentos: number
          unidade: string | null
          user_id: string | null
        }
        Insert: {
          atualizado_em?: string
          auditor_cf?: string | null
          checklist?: string | null
          data_inicio?: string | null
          evaluation_id: number
          id?: never
          nivel_conformidade?: string | null
          payload?: Json | null
          percentual_conformidade?: number | null
          processado_em?: string
          status_cf?: number | null
          total_conformes?: number
          total_itens?: number
          total_nc?: number
          total_parciais?: number
          total_reprocessamentos?: number
          unidade?: string | null
          user_id?: string | null
        }
        Update: {
          atualizado_em?: string
          auditor_cf?: string | null
          checklist?: string | null
          data_inicio?: string | null
          evaluation_id?: number
          id?: never
          nivel_conformidade?: string | null
          payload?: Json | null
          percentual_conformidade?: number | null
          processado_em?: string
          status_cf?: number | null
          total_conformes?: number
          total_itens?: number
          total_nc?: number
          total_parciais?: number
          total_reprocessamentos?: number
          unidade?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      config_itens: {
        Row: {
          atualizado_em: string
          checklist_id: string
          criado_por: string | null
          exige_imagem: boolean
          habilitado: boolean
          id: number
          item_nome: string
          validacao_tipo: string
        }
        Insert: {
          atualizado_em?: string
          checklist_id?: string
          criado_por?: string | null
          exige_imagem?: boolean
          habilitado?: boolean
          id?: never
          item_nome: string
          validacao_tipo?: string
        }
        Update: {
          atualizado_em?: string
          checklist_id?: string
          criado_por?: string | null
          exige_imagem?: boolean
          habilitado?: boolean
          id?: never
          item_nome?: string
          validacao_tipo?: string
        }
        Relationships: []
      }
      normas_chunks: {
        Row: {
          chunk_index: number
          criado_em: string
          fonte: string
          id: number
          pagina: number
          texto: string
          tsv: unknown
        }
        Insert: {
          chunk_index: number
          criado_em?: string
          fonte: string
          id?: never
          pagina: number
          texto: string
          tsv?: unknown
        }
        Update: {
          chunk_index?: number
          criado_em?: string
          fonte?: string
          id?: never
          pagina?: number
          texto?: string
          tsv?: unknown
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          criado_em: string
          email: string
          id: string
          nome: string
          deve_trocar_senha: boolean
          senha_alterada_em: string | null
          tipo_acesso: "sso" | "senha"
          ultimo_acesso: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          email: string
          id: string
          nome: string
          deve_trocar_senha?: boolean
          senha_alterada_em?: string | null
          tipo_acesso?: "sso" | "senha"
          ultimo_acesso?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          deve_trocar_senha?: boolean
          senha_alterada_em?: string | null
          tipo_acesso?: "sso" | "senha"
          ultimo_acesso?: string | null
        }
        Relationships: []
      }
      reprocessamentos: {
        Row: {
          evaluation_id: number
          id: number
          nivel_conformidade: string | null
          percentual_conformidade: number | null
          processado_em: string
          total_itens: number
          total_nc: number
          user_id: string | null
        }
        Insert: {
          evaluation_id: number
          id?: never
          nivel_conformidade?: string | null
          percentual_conformidade?: number | null
          processado_em?: string
          total_itens?: number
          total_nc?: number
          user_id?: string | null
        }
        Update: {
          evaluation_id?: number
          id?: never
          nivel_conformidade?: string | null
          percentual_conformidade?: number | null
          processado_em?: string
          total_itens?: number
          total_nc?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reprocessamentos_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "auditorias"
            referencedColumns: ["evaluation_id"]
          },
        ]
      }
      sugestoes: {
        Row: {
          aceita: boolean | null
          aceita_em: string | null
          aceita_por: string | null
          auditoria_id: number
          categoria: string | null
          criticidade: string | null
          id: number
          item_id: number | null
          pergunta: string | null
          reprocessamento_id: number | null
          resposta_original: string | null
          substituida_em: string | null
          sugestao_ia: string | null
          tipo: string
        }
        Insert: {
          aceita?: boolean | null
          aceita_em?: string | null
          aceita_por?: string | null
          auditoria_id: number
          categoria?: string | null
          criticidade?: string | null
          id?: never
          item_id?: number | null
          pergunta?: string | null
          reprocessamento_id?: number | null
          resposta_original?: string | null
          substituida_em?: string | null
          sugestao_ia?: string | null
          tipo?: string
        }
        Update: {
          aceita?: boolean | null
          aceita_em?: string | null
          aceita_por?: string | null
          auditoria_id?: number
          categoria?: string | null
          criticidade?: string | null
          id?: never
          item_id?: number | null
          pergunta?: string | null
          reprocessamento_id?: number | null
          resposta_original?: string | null
          substituida_em?: string | null
          sugestao_ia?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugestoes_auditoria_id_fkey"
            columns: ["auditoria_id"]
            isOneToOne: false
            referencedRelation: "auditorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_reprocessamento_id_fkey"
            columns: ["reprocessamento_id"]
            isOneToOne: false
            referencedRelation: "reprocessamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: never
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: never
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      uso_tokens: {
        Row: {
          criado_em: string
          custo_usd: number | null
          evaluation_id: number | null
          id: number
          modelo: string | null
          tipo_chamada: string | null
          tokens_input: number
          tokens_output: number
          tokens_total: number | null
          user_id: string | null
        }
        Insert: {
          criado_em?: string
          custo_usd?: number | null
          evaluation_id?: number | null
          id?: never
          modelo?: string | null
          tipo_chamada?: string | null
          tokens_input?: number
          tokens_output?: number
          tokens_total?: number | null
          user_id?: string | null
        }
        Update: {
          criado_em?: string
          custo_usd?: number | null
          evaluation_id?: number | null
          id?: never
          modelo?: string | null
          tipo_chamada?: string | null
          tokens_input?: number
          tokens_output?: number
          tokens_total?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      usuarios_autorizados: {
        Row: {
          criado_em: string
          criado_por: string | null
          email: string
          nome: string
          perfil: Database["public"]["Enums"]["app_role"]
          tipo_acesso: "sso" | "senha"
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          email: string
          nome: string
          perfil?: Database["public"]["Enums"]["app_role"]
          tipo_acesso?: "sso" | "senha"
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          email?: string
          nome?: string
          perfil?: Database["public"]["Enums"]["app_role"]
          tipo_acesso?: "sso" | "senha"
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_normas: {
        Args: { consulta: string; top_k?: number }
        Returns: {
          fonte: string
          pagina: number
          score: number
          texto: string
        }[]
      }
      exigir_analista_ativo: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_analista: { Args: { _user_id: string }; Returns: boolean }
      listar_inativos: {
        Args: { dias?: number }
        Returns: {
          ativo: boolean
          dias_inativo: number
          email: string
          id: string
          nome: string
          perfil: Database["public"]["Enums"]["app_role"]
          ultimo_acesso: string
        }[]
      }
      listar_normas: {
        Args: never
        Returns: {
          fonte: string
          indexado_em: string
          paginas: number
          total_chunks: number
        }[]
      }
      registrar_auditoria: {
        Args: {
          p_cabecalho: Json
          p_evaluation_id: number
          p_itens?: Json
          p_payload?: Json
          p_resumo: Json
          p_user_id: string
        }
        Returns: number
      }
      resumo_uso_tokens: {
        Args: { dias?: number }
        Returns: {
          auditorias_processadas: number
          custo_total_usd: number
          total_chamadas: number
          total_input: number
          total_output: number
          total_tokens: number
        }[]
      }
      score_auditores: {
        Args: never
        Returns: {
          auditor: string
          media_score: number
          sugestoes_aceitas: number
          sugestoes_ignoradas: number
          taxa_aceitacao: number
          total_auditorias: number
          total_nc: number
          total_sugestoes: number
        }[]
      }
      try_timestamptz: { Args: { _valor: string }; Returns: string }
      uso_tokens_por_dia: {
        Args: { dias?: number }
        Returns: {
          chamadas: number
          custo_usd: number
          dia: string
          tokens: number
        }[]
      }
    }
    Enums: {
      app_role: "analista" | "auditor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["analista", "auditor"],
    },
  },
} as const
