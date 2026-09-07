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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      canais_venda: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      categorias_despesa: {
        Row: {
          ativo: boolean
          created_at: string
          grupo_dre: string | null
          id: string
          nome: string
          tipo_dre: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grupo_dre?: string | null
          id?: string
          nome: string
          tipo_dre?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grupo_dre?: string | null
          id?: string
          nome?: string
          tipo_dre?: string
          updated_at?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          corretor_id: string | null
          corretor_pago: boolean
          corretor_percentual: number | null
          corretor_valor: number | null
          created_at: string
          data_implantacao: string | null
          id: string
          nome: string
          observacoes: string | null
          operadora_id: string | null
          supervisor_a_id: string | null
          supervisor_a_pago: boolean
          supervisor_a_percentual: number | null
          supervisor_a_valor: number | null
          supervisor_b_id: string | null
          supervisor_b_pago: boolean
          supervisor_b_percentual: number | null
          supervisor_b_valor: number | null
          unidade_negocio: string | null
          updated_at: string
          user_id: string
          valor_contrato: number
        }
        Insert: {
          corretor_id?: string | null
          corretor_pago?: boolean
          corretor_percentual?: number | null
          corretor_valor?: number | null
          created_at?: string
          data_implantacao?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          operadora_id?: string | null
          supervisor_a_id?: string | null
          supervisor_a_pago?: boolean
          supervisor_a_percentual?: number | null
          supervisor_a_valor?: number | null
          supervisor_b_id?: string | null
          supervisor_b_pago?: boolean
          supervisor_b_percentual?: number | null
          supervisor_b_valor?: number | null
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
          valor_contrato?: number
        }
        Update: {
          corretor_id?: string | null
          corretor_pago?: boolean
          corretor_percentual?: number | null
          corretor_valor?: number | null
          created_at?: string
          data_implantacao?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          operadora_id?: string | null
          supervisor_a_id?: string | null
          supervisor_a_pago?: boolean
          supervisor_a_percentual?: number | null
          supervisor_a_valor?: number | null
          supervisor_b_id?: string | null
          supervisor_b_pago?: boolean
          supervisor_b_percentual?: number | null
          supervisor_b_valor?: number | null
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
          valor_contrato?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_supervisor_a_id_fkey"
            columns: ["supervisor_a_id"]
            isOneToOne: false
            referencedRelation: "supervisores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_supervisor_b_id_fkey"
            columns: ["supervisor_b_id"]
            isOneToOne: false
            referencedRelation: "supervisores"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas: {
        Row: {
          cancelado: boolean
          cancelado_em: string | null
          categoria_id: string
          competencia: string | null
          created_at: string
          data: string
          data_pagamento: string | null
          descricao: string
          id: string
          motivo_cancelamento: string | null
          observacoes: string | null
          recorrente: boolean
          responsavel: string | null
          serie_id: string | null
          setor_id: string | null
          status: string
          subcategoria_id: string | null
          tipo: string
          unidade_negocio: string | null
          updated_at: string
          user_id: string
          valor: number
          vencimento: string | null
          versao: number
        }
        Insert: {
          cancelado?: boolean
          cancelado_em?: string | null
          categoria_id: string
          competencia?: string | null
          created_at?: string
          data: string
          data_pagamento?: string | null
          descricao: string
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          recorrente?: boolean
          responsavel?: string | null
          serie_id?: string | null
          setor_id?: string | null
          status?: string
          subcategoria_id?: string | null
          tipo: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
          valor?: number
          vencimento?: string | null
          versao?: number
        }
        Update: {
          cancelado?: boolean
          cancelado_em?: string | null
          categoria_id?: string
          competencia?: string | null
          created_at?: string
          data?: string
          data_pagamento?: string | null
          descricao?: string
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          recorrente?: boolean
          responsavel?: string | null
          serie_id?: string | null
          setor_id?: string | null
          status?: string
          subcategoria_id?: string | null
          tipo?: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          vencimento?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "series_recorrencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_despesa"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_operacoes: {
        Row: {
          after_data: Json | null
          arguments: Json
          before_data: Json | null
          created_at: string
          error: string | null
          executed_at: string | null
          expires_at: string
          id: string
          item_count: number
          status: string
          summary: string | null
          tool_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          after_data?: Json | null
          arguments?: Json
          before_data?: Json | null
          created_at?: string
          error?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          item_count?: number
          status?: string
          summary?: string | null
          tool_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          after_data?: Json | null
          arguments?: Json
          before_data?: Json | null
          created_at?: string
          error?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          item_count?: number
          status?: string
          summary?: string | null
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operadoras: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      pipeline_contratos: {
        Row: {
          canal_id: string | null
          cliente: string
          created_at: string
          dados_proposta: Json | null
          data_revisao: string | null
          data_vigencia: string | null
          declinada: boolean
          declinada_em: string | null
          etapa: Database["public"]["Enums"]["pipeline_etapa"]
          id: string
          motivo_declinio: string | null
          numero_proposta: string | null
          observacoes: string | null
          operadora_id: string | null
          posicao: number
          tipo: string
          updated_at: string
          user_id: string
          valor_mensal: number
          vendedor_id: string | null
        }
        Insert: {
          canal_id?: string | null
          cliente: string
          created_at?: string
          dados_proposta?: Json | null
          data_revisao?: string | null
          data_vigencia?: string | null
          declinada?: boolean
          declinada_em?: string | null
          etapa?: Database["public"]["Enums"]["pipeline_etapa"]
          id?: string
          motivo_declinio?: string | null
          numero_proposta?: string | null
          observacoes?: string | null
          operadora_id?: string | null
          posicao?: number
          tipo?: string
          updated_at?: string
          user_id: string
          valor_mensal?: number
          vendedor_id?: string | null
        }
        Update: {
          canal_id?: string | null
          cliente?: string
          created_at?: string
          dados_proposta?: Json | null
          data_revisao?: string | null
          data_vigencia?: string | null
          declinada?: boolean
          declinada_em?: string | null
          etapa?: Database["public"]["Enums"]["pipeline_etapa"]
          id?: string
          motivo_declinio?: string | null
          numero_proposta?: string | null
          observacoes?: string | null
          operadora_id?: string | null
          posicao?: number
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_mensal?: number
          vendedor_id?: string | null
        }
        Relationships: []
      }
      propostas: {
        Row: {
          created_at: string
          id: string
          mes_implantacao: string | null
          nome: string
          operadora_id: string | null
          unidade_negocio: string | null
          updated_at: string
          user_id: string
          valor_contrato: number | null
          valor_proposta: number
          vendedor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mes_implantacao?: string | null
          nome: string
          operadora_id?: string | null
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
          valor_contrato?: number | null
          valor_proposta?: number
          vendedor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mes_implantacao?: string | null
          nome?: string
          operadora_id?: string | null
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
          valor_contrato?: number | null
          valor_proposta?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      receitas: {
        Row: {
          cancelado: boolean
          cancelado_em: string | null
          categoria: string
          categoria_id: string | null
          comissao: number
          competencia: string | null
          contrato_id: string | null
          created_at: string
          data: string
          data_recebimento: string | null
          descricao: string
          id: string
          motivo_cancelamento: string | null
          observacoes: string | null
          operadora_id: string
          proposta_id: string | null
          serie_id: string | null
          status: string
          subcategoria_id: string | null
          unidade_negocio: string | null
          updated_at: string
          user_id: string
          valor: number
          vencimento: string | null
          vendedor_id: string
          versao: number
        }
        Insert: {
          cancelado?: boolean
          cancelado_em?: string | null
          categoria: string
          categoria_id?: string | null
          comissao?: number
          competencia?: string | null
          contrato_id?: string | null
          created_at?: string
          data: string
          data_recebimento?: string | null
          descricao: string
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          operadora_id: string
          proposta_id?: string | null
          serie_id?: string | null
          status?: string
          subcategoria_id?: string | null
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
          valor?: number
          vencimento?: string | null
          vendedor_id: string
          versao?: number
        }
        Update: {
          cancelado?: boolean
          cancelado_em?: string | null
          categoria?: string
          categoria_id?: string | null
          comissao?: number
          competencia?: string | null
          contrato_id?: string | null
          created_at?: string
          data?: string
          data_recebimento?: string | null
          descricao?: string
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          operadora_id?: string
          proposta_id?: string | null
          serie_id?: string | null
          status?: string
          subcategoria_id?: string | null
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          vencimento?: string | null
          vendedor_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "receitas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_contrato_user_fkey"
            columns: ["user_id", "contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "receitas_contrato_user_fkey"
            columns: ["user_id", "contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_financeiro"
            referencedColumns: ["user_id", "contrato_id"]
          },
          {
            foreignKeyName: "receitas_operadora_id_fkey"
            columns: ["operadora_id"]
            isOneToOne: false
            referencedRelation: "operadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "series_recorrencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      series_recorrencia: {
        Row: {
          ativa: boolean
          categoria_id: string | null
          created_at: string
          encerrada_em: string | null
          id: string
          motivo_encerramento: string | null
          nome: string
          setor_id: string | null
          subcategoria_id: string | null
          tipo: string
          unidade_negocio: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          categoria_id?: string | null
          created_at?: string
          encerrada_em?: string | null
          id?: string
          motivo_encerramento?: string | null
          nome: string
          setor_id?: string | null
          subcategoria_id?: string | null
          tipo: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          categoria_id?: string | null
          created_at?: string
          encerrada_em?: string | null
          id?: string
          motivo_encerramento?: string | null
          nome?: string
          setor_id?: string | null
          subcategoria_id?: string | null
          tipo?: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_recorrencia_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_recorrencia_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_recorrencia_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_despesa"
            referencedColumns: ["id"]
          },
        ]
      }
      setores_despesa: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      subcategorias_despesa: {
        Row: {
          ativo: boolean
          categoria_id: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_despesa_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesa"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendedores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      contratos_financeiro: {
        Row: {
          contrato_id: string | null
          nome: string | null
          producao: number | null
          qtd_receitas: number | null
          receita_pendente: number | null
          receita_prevista: number | null
          receita_recebida: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      grant_role_by_email: {
        Args: {
          _email: string
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_users_with_roles: {
        Args: never
        Returns: {
          email: string
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      mcp_aplicar_lote: {
        Args: { _itens: Json; _op_id: string }
        Returns: Json
      }
      mcp_claim_operacao: {
        Args: { _id: string }
        Returns: {
          after_data: Json | null
          arguments: Json
          before_data: Json | null
          created_at: string
          error: string | null
          executed_at: string | null
          expires_at: string
          id: string
          item_count: number
          status: string
          summary: string | null
          tool_name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "mcp_operacoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mcp_executar_operacao: {
        Args: { _op_id: string; _plano: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "gestor" | "adm_pipeline"
      pipeline_etapa:
        | "Montagem de contrato"
        | "Assinatura / Declaração de saúde"
        | "Entrevista médica"
        | "Em análise"
        | "Pendências"
        | "Aguardando vigência"
        | "Implantado"
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
      app_role: ["admin", "gestor", "adm_pipeline"],
      pipeline_etapa: [
        "Montagem de contrato",
        "Assinatura / Declaração de saúde",
        "Entrevista médica",
        "Em análise",
        "Pendências",
        "Aguardando vigência",
        "Implantado",
      ],
    },
  },
} as const
