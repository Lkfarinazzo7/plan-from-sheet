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
    PostgrestVersion: "14.4"
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
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      despesas: {
        Row: {
          categoria_id: string
          created_at: string
          data: string
          descricao: string
          id: string
          observacoes: string | null
          recorrente: boolean
          responsavel: string | null
          setor_id: string | null
          status: string
          tipo: string
          unidade_negocio: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria_id: string
          created_at?: string
          data: string
          descricao: string
          id?: string
          observacoes?: string | null
          recorrente?: boolean
          responsavel?: string | null
          setor_id?: string | null
          status?: string
          tipo: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          categoria_id?: string
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          observacoes?: string | null
          recorrente?: boolean
          responsavel?: string | null
          setor_id?: string | null
          status?: string
          tipo?: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesa"
            referencedColumns: ["id"]
          },
        ]
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
          categoria: string
          comissao: number
          created_at: string
          data: string
          descricao: string
          id: string
          observacoes: string | null
          operadora_id: string
          proposta_id: string | null
          status: string
          unidade_negocio: string | null
          updated_at: string
          user_id: string
          valor: number
          vendedor_id: string
        }
        Insert: {
          categoria: string
          comissao?: number
          created_at?: string
          data: string
          descricao: string
          id?: string
          observacoes?: string | null
          operadora_id: string
          proposta_id?: string | null
          status?: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id: string
          valor?: number
          vendedor_id: string
        }
        Update: {
          categoria?: string
          comissao?: number
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          observacoes?: string | null
          operadora_id?: string
          proposta_id?: string | null
          status?: string
          unidade_negocio?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          vendedor_id?: string
        }
        Relationships: [
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
            foreignKeyName: "receitas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
