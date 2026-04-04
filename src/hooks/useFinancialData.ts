import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

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
      let query = supabase.from('receitas').select('*, vendedores(nome), operadoras(nome)').order('data', { ascending: true });
      if (startDate && endDate) {
        query = query.gte('data', startDate).lte('data', endDate);
      } else if (month !== undefined && year !== undefined) {
        const sd = toDateStr(year, month, 1);
        const ed = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
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
      let query = supabase.from('despesas').select('*, categorias_despesa(nome)').order('data', { ascending: true });
      if (startDate && endDate) {
        query = query.gte('data', startDate).lte('data', endDate);
      } else if (month !== undefined && year !== undefined) {
        const sd = toDateStr(year, month, 1);
        const ed = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
        query = query.gte('data', sd).lte('data', ed);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useComissoes(month?: number, year?: number, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['comissoes', month, year, startDate, endDate],
    queryFn: async () => {
      let query = supabase.from('comissoes').select('*, vendedores(nome)').order('data', { ascending: false });
      if (startDate && endDate) {
        query = query.gte('data', startDate).lte('data', endDate);
      } else if (month !== undefined && year !== undefined) {
        const sd = toDateStr(year, month, 1);
        const ed = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
        query = query.gte('data', sd).lte('data', ed);
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

// ===== Cadastros CRUD Hooks =====

export function useAllVendedores() {
  return useQuery({
    queryKey: ['vendedores', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendedores').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateVendedor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('vendedores').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendedores'] });
    },
  });
}

export function useUpdateVendedor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; ativo?: boolean }) => {
      const { error } = await supabase.from('vendedores').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendedores'] });
    },
  });
}

export function useAllOperadoras() {
  return useQuery({
    queryKey: ['operadoras', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operadoras').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOperadora() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('operadoras').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operadoras'] });
    },
  });
}

export function useUpdateOperadora() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; ativa?: boolean }) => {
      const { error } = await supabase.from('operadoras').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operadoras'] });
    },
  });
}

export function useCreateCategoriaDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('categorias_despesa').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias_despesa'] });
    },
  });
}

export function useUpdateCategoriaDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('categorias_despesa').update({ nome }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias_despesa'] });
    },
  });
}

export function useDeleteCategoriaDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categorias_despesa').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias_despesa'] });
    },
  });
}

export function useSupervisores() {
  return useQuery({
    queryKey: ['supervisores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('supervisores').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSupervisor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('supervisores').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisores'] });
    },
  });
}

export function useUpdateSupervisor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; ativo?: boolean }) => {
      const { error } = await supabase.from('supervisores').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisores'] });
    },
  });
}

export function useGenerateRecurringDespesas() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ sourceMonth, sourceYear, targetMonth, targetYear }: {
      sourceMonth: number; sourceYear: number; targetMonth: number; targetYear: number;
    }) => {
      const startDate = toDateStr(sourceYear, sourceMonth, 1);
      const endDate = toDateStr(sourceYear, sourceMonth, new Date(sourceYear, sourceMonth + 1, 0).getDate());
      
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
        const newDate = toDateStr(targetYear, targetMonth, day);
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

export function useBulkCreateReceita() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: Array<{
      data: string; descricao: string; categoria: string; operadora_id: string;
      valor: number; vendedor_id: string; status: string;
    }>) => {
      const payload = rows.map(r => ({ ...r, comissao: 0, user_id: user!.id }));
      const { error } = await supabase.from('receitas').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receitas'] }),
  });
}

export function useBulkCreateDespesa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: Array<{
      data: string; descricao: string; categoria_id: string; tipo: string;
      valor: number; responsavel?: string; recorrente: boolean; status: string;
    }>) => {
      const payload = rows.map(r => ({ ...r, user_id: user!.id }));
      const { error } = await supabase.from('despesas').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useMonthlyComparison() {
  return useQuery({
    queryKey: ['monthly-comparison'],
    queryFn: async () => {
      const now = new Date();
      const startM = now.getMonth() - 5;
      const startY = now.getFullYear() + Math.floor(startM / 12);
      const startMonth = ((startM % 12) + 12) % 12;
      const startDate = toDateStr(startY, startMonth, 1);
      const endDate = toDateStr(now.getFullYear(), now.getMonth(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());

      const [receitasRes, despesasRes] = await Promise.all([
        supabase.from('receitas').select('data, valor').gte('data', startDate).lte('data', endDate),
        supabase.from('despesas').select('data, valor').gte('data', startDate).lte('data', endDate),
      ]);

      if (receitasRes.error) throw receitasRes.error;
      if (despesasRes.error) throw despesasRes.error;

      const months: Record<string, { receitas: number; despesas: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months[key] = { receitas: 0, despesas: 0 };
      }

      for (const r of receitasRes.data || []) {
        const key = r.data.substring(0, 7);
        if (months[key]) months[key].receitas += Number(r.valor);
      }
      for (const d of despesasRes.data || []) {
        const key = d.data.substring(0, 7);
        if (months[key]) months[key].despesas += Number(d.valor);
      }

      return Object.entries(months).map(([key, val]) => {
        const [y, m] = key.split('-');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return { mes: `${monthNames[parseInt(m) - 1]}/${y.slice(2)}`, ...val };
      });
    },
  });
}
