import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useVendedores() {
  return useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendedores').select('*').eq('ativo', true).order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useOperadoras() {
  return useQuery({
    queryKey: ['operadoras'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operadoras').select('*').eq('ativa', true).order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useCategoriasDespesa() {
  return useQuery({
    queryKey: ['categorias_despesa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias_despesa').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useReceitas(month?: number, year?: number, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['receitas', month, year, startDate, endDate],
    queryFn: async () => {
      let query = supabase.from('receitas').select('*, vendedores(nome), operadoras(nome)').order('data', { ascending: false });
      if (startDate && endDate) {
        query = query.gte('data', startDate).lte('data', endDate);
      } else if (month !== undefined && year !== undefined) {
        const sd = new Date(year, month, 1).toISOString().split('T')[0];
        const ed = new Date(year, month + 1, 0).toISOString().split('T')[0];
        query = query.gte('data', sd).lte('data', ed);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useDespesas(month?: number, year?: number, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['despesas', month, year, startDate, endDate],
    queryFn: async () => {
      let query = supabase.from('despesas').select('*, categorias_despesa(nome)').order('data', { ascending: false });
      if (startDate && endDate) {
        query = query.gte('data', startDate).lte('data', endDate);
      } else if (month !== undefined && year !== undefined) {
        const sd = new Date(year, month, 1).toISOString().split('T')[0];
        const ed = new Date(year, month + 1, 0).toISOString().split('T')[0];
        query = query.gte('data', sd).lte('data', ed);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useComissoes(month?: number, year?: number) {
  return useQuery({
    queryKey: ['comissoes', month, year],
    queryFn: async () => {
      let query = supabase.from('comissoes').select('*, vendedores(nome)').order('data', { ascending: false });
      if (month !== undefined && year !== undefined) {
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        query = query.gte('data', startDate).lte('data', endDate);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateReceita() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (receita: {
      data: string; descricao: string; categoria: string; operadora_id: string;
      valor: number; vendedor_id: string; status: string;
    }) => {
      const { error } = await supabase.from('receitas').insert({ ...receita, comissao: 0, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receitas'] }),
  });
}

export function useUpdateReceita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('receitas').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receitas'] }),
  });
}

export function useDeleteReceita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('receitas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receitas'] }),
  });
}

export function useCreateDespesa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (despesa: {
      data: string; descricao: string; categoria_id: string; tipo: string;
      valor: number; responsavel?: string; recorrente: boolean; status: string;
    }) => {
      const { error } = await supabase.from('despesas').insert({ ...despesa, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useUpdateDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('despesas').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useDeleteDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('despesas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useCreateComissao() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (comissao: {
      data: string; descricao: string; vendedor_id: string;
      valor_proposta: number; valor_recebido: number;
      comissao_vendedor: number; comissao_supervisor: number; status: string;
    }) => {
      const { error } = await supabase.from('comissoes').insert({ ...comissao, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comissoes'] }),
  });
}

export function useUpdateComissao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('comissoes').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comissoes'] }),
  });
}

export function useDeleteComissao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comissoes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comissoes'] }),
  });
}

export function useGenerateRecurringDespesas() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ sourceMonth, sourceYear, targetMonth, targetYear }: {
      sourceMonth: number; sourceYear: number; targetMonth: number; targetYear: number;
    }) => {
      const startDate = new Date(sourceYear, sourceMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(sourceYear, sourceMonth + 1, 0).toISOString().split('T')[0];
      
      const { data: recurring, error: fetchError } = await supabase
        .from('despesas')
        .select('*')
        .eq('recorrente', true)
        .gte('data', startDate)
        .lte('data', endDate);
      
      if (fetchError) throw fetchError;
      if (!recurring?.length) throw new Error('Nenhuma despesa recorrente encontrada no mês selecionado.');

      const newDespesas = recurring.map(d => {
        const originalDate = new Date(d.data);
        const day = Math.min(originalDate.getDate(), new Date(targetYear, targetMonth + 1, 0).getDate());
        const newDate = new Date(targetYear, targetMonth, day).toISOString().split('T')[0];
        return {
          data: newDate,
          descricao: d.descricao,
          categoria_id: d.categoria_id,
          tipo: d.tipo,
          valor: d.valor,
          responsavel: d.responsavel,
          recorrente: true,
          status: 'A pagar' as const,
          user_id: user!.id,
        };
      });

      const { error } = await supabase.from('despesas').insert(newDespesas);
      if (error) throw error;
      return newDespesas.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}
