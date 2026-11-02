import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/financialReporting';
import type { CustoRegra } from '@/lib/rentabilidadeCorretor';

const db = supabase as any;

export function useBaseRentabilidade() {
  return useQuery({
    queryKey: ['rentabilidade-base'],
    queryFn: async () => {
      const [contratos, receitas, despesas, vendedores] = await Promise.all([
        fetchAllRows((f, t) => db.from('contratos').select('id,corretor_id,valor_contrato,data_implantacao,corretor_id,corretor_valor,corretor_percentual,corretor_pago,supervisor_a_id,supervisor_a_valor,supervisor_a_percentual,supervisor_a_pago,supervisor_b_id,supervisor_b_valor,supervisor_b_percentual,supervisor_b_pago').order('id').range(f, t)),
        fetchAllRows((f, t) => db.from('receitas').select('id,contrato_id,valor,status,cancelado,competencia,data_recebimento').not('contrato_id', 'is', null).order('id').range(f, t)),
        fetchAllRows((f, t) => db.from('despesas').select('id,vendedor_id,contrato_id,comissao_papel,descricao,categoria_id,valor,status,cancelado,competencia,data_pagamento').or('vendedor_id.not.is.null,contrato_id.not.is.null').order('id').range(f, t)),
        fetchAllRows((f, t) => db.from('vendedores').select('id,nome,ativo').order('id').range(f, t)),
      ]);
      return { contratos, receitas, despesas, vendedores: (vendedores as any[]).sort((a, b) => a.nome.localeCompare(b.nome)) };
    },
  });
}

export function useCustosCorretor() {
  return useQuery({
    queryKey: ['custos-corretor'],
    queryFn: async (): Promise<CustoRegra[]> => {
      const { data, error } = await db.from('custos_corretor').select('*').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarCusto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...c }: Partial<CustoRegra>) => {
      const { error } = id ? await db.from('custos_corretor').update(c).eq('id', id) : await db.from('custos_corretor').insert(c);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custos-corretor'] }),
  });
}

export function useExcluirCusto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('custos_corretor').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custos-corretor'] }),
  });
}
