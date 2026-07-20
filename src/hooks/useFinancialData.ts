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
      let query = supabase.from('despesas').select('*, categorias_despesa(nome), setores_despesa(nome)').order('data', { ascending: true });
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

export function usePropostas() {
  return useQuery({
    queryKey: ['propostas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propostas')
        .select('*, operadoras(nome), vendedores(nome)')
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProposta() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: {
      nome: string; operadora_id?: string | null; vendedor_id?: string | null;
      unidade_negocio?: string | null; valor_proposta?: number; valor_contrato?: number | null;
      mes_implantacao?: string | null;
    }) => {
      const { data, error } = await supabase.from('propostas').insert({
        nome: p.nome,
        operadora_id: p.operadora_id || null,
        vendedor_id: p.vendedor_id || null,
        unidade_negocio: p.unidade_negocio || null,
        valor_proposta: p.valor_proposta ?? 0,
        valor_contrato: p.valor_contrato ?? null,
        mes_implantacao: p.mes_implantacao || null,
        user_id: user!.id,
      } as any).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['propostas'] }),
  });
}

export function useUpdateProposta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('propostas').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['propostas'] }),
  });
}

export function useDeleteProposta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('propostas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
      queryClient.invalidateQueries({ queryKey: ['receitas'] });
    },
  });
}

async function ensurePropostaId(
  userId: string,
  nome: string,
  fallback: { operadora_id?: string | null; vendedor_id?: string | null; unidade_negocio?: string | null; valor_proposta?: number },
): Promise<string> {
  const trimmed = (nome || '').trim();
  if (!trimmed) throw new Error('Descrição da proposta vazia');
  // .limit(1) em vez de .maybeSingle(): se já existirem duplicatas no banco, usa a primeira em vez de quebrar
  const { data: existing } = await supabase
    .from('propostas').select('id').eq('user_id', userId).eq('nome', trimmed).limit(1);
  if (existing?.[0]?.id) return existing[0].id;
  const { data, error } = await supabase.from('propostas').insert({
    user_id: userId, nome: trimmed,
    operadora_id: fallback.operadora_id || null,
    vendedor_id: fallback.vendedor_id || null,
    unidade_negocio: fallback.unidade_negocio || null,
    valor_proposta: fallback.valor_proposta ?? 0,
  }).select('id').single();
  if (error) throw error;
  return data!.id;
}

export function useCreateReceita() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (receita: {
      data: string; descricao: string; categoria: string; operadora_id: string;
      valor: number; vendedor_id: string; status: string; unidade_negocio?: string | null;
      proposta_id?: string | null; observacoes?: string | null;
    }) => {
      let proposta_id = receita.proposta_id || null;
      if (!proposta_id) {
        proposta_id = await ensurePropostaId(user!.id, receita.descricao, {
          operadora_id: receita.operadora_id, vendedor_id: receita.vendedor_id,
          unidade_negocio: receita.unidade_negocio || null, valor_proposta: receita.valor,
        });
      }
      const { error } = await supabase.from('receitas').insert({
        ...receita, proposta_id, comissao: 0, user_id: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas'] });
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
    },
  });
}

export function useUpdateReceita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('receitas').update(updates as any).eq('id', id);
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
      valor: number; responsavel?: string; recorrente: boolean; status: string; unidade_negocio?: string | null;
      observacoes?: string | null; setor_id?: string | null;
    }) => {
      const { error } = await supabase.from('despesas').insert({ ...despesa, user_id: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useUpdateDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('despesas').update(updates as any).eq('id', id);
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

export type CategoriaPayload = { nome: string; tipo_dre?: 'operacional' | 'custo_fixo' | 'imposto' };

export function useCreateCategoriaDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: string | CategoriaPayload) => {
      const body = typeof payload === 'string' ? { nome: payload } : payload;
      const { error } = await supabase.from('categorias_despesa').insert(body);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categorias_despesa'] }); },
  });
}

export function useUpdateCategoriaDespesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: { id: string } & Partial<CategoriaPayload>) => {
      const { error } = await supabase.from('categorias_despesa').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categorias_despesa'] }); },
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

// ===== Setores de Despesa =====
export function useSetoresDespesa() {
  return useQuery({
    queryKey: ['setores_despesa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setores_despesa').select('*').eq('ativo', true).order('nome');
      if (error) throw error;
      return data;
    },
  });
}
export function useAllSetoresDespesa() {
  return useQuery({
    queryKey: ['setores_despesa', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setores_despesa').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}
export function useCreateSetorDespesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('setores_despesa').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setores_despesa'] }),
  });
}
export function useUpdateSetorDespesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; ativo?: boolean }) => {
      const { error } = await supabase.from('setores_despesa').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setores_despesa'] }),
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

      // Buscar recorrentes já existentes no mês de destino para não duplicar
      const targetStart = toDateStr(targetYear, targetMonth, 1);
      const targetEnd = toDateStr(targetYear, targetMonth, new Date(targetYear, targetMonth + 1, 0).getDate());
      const { data: existing, error: existingError } = await supabase
        .from('despesas')
        .select('descricao, valor')
        .eq('recorrente', true)
        .gte('data', targetStart)
        .lte('data', targetEnd);
      if (existingError) throw existingError;
      const existingKeys = new Set((existing || []).map(e => `${e.descricao}|${Number(e.valor)}`));

      const lastDayTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
      const newDespesas = recurring
        .filter(d => !existingKeys.has(`${d.descricao}|${Number(d.valor)}`))
        .map(d => {
          // Extrair o dia direto da string YYYY-MM-DD (new Date() interpretaria como UTC e voltaria 1 dia)
          const originalDay = parseInt(String(d.data).slice(8, 10), 10);
          const day = Math.min(originalDay, lastDayTarget);
          return {
            data: toDateStr(targetYear, targetMonth, day),
            descricao: d.descricao,
            categoria_id: d.categoria_id,
            tipo: d.tipo,
            valor: d.valor,
            responsavel: d.responsavel,
            recorrente: true,
            status: 'A pagar' as const,
            unidade_negocio: (d as any).unidade_negocio ?? null,
            setor_id: (d as any).setor_id ?? null,
            observacoes: (d as any).observacoes ?? null,
            user_id: user!.id,
          };
        });

      if (!newDespesas.length) {
        throw new Error('Todas as despesas recorrentes desse mês já existem no mês de destino. Nada foi duplicado.');
      }

      const { error } = await supabase.from('despesas').insert(newDespesas);
      if (error) throw error;
      return newDespesas.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useBulkUpdateReceita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, any> }) => {
      const { error } = await supabase.from('receitas').update(updates as any).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receitas'] }),
  });
}

export function useBulkDeleteReceita() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('receitas').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receitas'] }),
  });
}

export function useBulkCreateReceita() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: Array<{
      data: string; descricao: string; categoria: string; operadora_id: string;
      valor: number; vendedor_id: string; status: string; unidade_negocio?: string | null;
      proposta_id?: string | null; observacoes?: string | null;
    }>) => {
      const payload: any[] = [];
      for (const r of rows) {
        let proposta_id = r.proposta_id || null;
        if (!proposta_id) {
          proposta_id = await ensurePropostaId(user!.id, r.descricao, {
            operadora_id: r.operadora_id, vendedor_id: r.vendedor_id,
            unidade_negocio: r.unidade_negocio || null, valor_proposta: r.valor,
          });
        }
        payload.push({ ...r, proposta_id, comissao: 0, user_id: user!.id });
      }
      const { error } = await supabase.from('receitas').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas'] });
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
    },
  });
}

export function useBulkCreateDespesa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: Array<{
      data: string; descricao: string; categoria_id: string; tipo: string;
      valor: number; responsavel?: string; recorrente: boolean; status: string;
      unidade_negocio?: string | null; observacoes?: string | null; setor_id?: string | null;
    }>) => {
      const payload = rows.map(r => ({ ...r, user_id: user!.id }));
      const { error } = await supabase.from('despesas').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['despesas'] }),
  });
}

export function useMonthlyComparison(unidade?: string) {
  return useQuery({
    queryKey: ['monthly-comparison', unidade || 'all'],
    queryFn: async () => {
      const now = new Date();
      const startM = now.getMonth() - 5;
      const startY = now.getFullYear() + Math.floor(startM / 12);
      const startMonth = ((startM % 12) + 12) % 12;
      const startDate = toDateStr(startY, startMonth, 1);
      const endDate = toDateStr(now.getFullYear(), now.getMonth(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());

      let rq = supabase.from('receitas').select('data, valor, unidade_negocio').gte('data', startDate).lte('data', endDate);
      let dq = supabase.from('despesas').select('data, valor, unidade_negocio').gte('data', startDate).lte('data', endDate);
      if (unidade === 'none') {
        rq = rq.is('unidade_negocio', null);
        dq = dq.is('unidade_negocio', null);
      } else if (unidade) {
        rq = rq.eq('unidade_negocio', unidade);
        dq = dq.eq('unidade_negocio', unidade);
      }
      const [receitasRes, despesasRes] = await Promise.all([rq, dq]);

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

// ===== Contratos =====

export type ContratoInput = {
  nome: string;
  operadora_id?: string | null;
  unidade_negocio?: string | null;
  data_implantacao?: string | null;
  valor_contrato?: number;
  supervisor_a_id?: string | null;
  supervisor_a_percentual?: number | null;
  supervisor_a_valor?: number | null;
  supervisor_a_pago?: boolean;
  supervisor_b_id?: string | null;
  supervisor_b_percentual?: number | null;
  supervisor_b_valor?: number | null;
  supervisor_b_pago?: boolean;
  corretor_id?: string | null;
  corretor_percentual?: number | null;
  corretor_valor?: number | null;
  corretor_pago?: boolean;
  observacoes?: string | null;
};

export function useContratos() {
  return useQuery({
    queryKey: ['contratos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contratos')
        .select('*, operadoras(nome), supervisor_a:supervisores!supervisor_a_id(nome), supervisor_b:supervisores!supervisor_b_id(nome), corretor:vendedores!corretor_id(nome)')
        .order('data_implantacao', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateContrato() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (c: ContratoInput) => {
      const { error } = await (supabase as any).from('contratos').insert({
        ...c,
        operadora_id: c.operadora_id || null,
        unidade_negocio: c.unidade_negocio || null,
        data_implantacao: c.data_implantacao || null,
        supervisor_a_id: c.supervisor_a_id || null,
        supervisor_b_id: c.supervisor_b_id || null,
        corretor_id: c.corretor_id || null,
        valor_contrato: c.valor_contrato ?? 0,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

export function useUpdateContrato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ContratoInput>) => {
      const { error } = await (supabase as any).from('contratos').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

export function useDeleteContrato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('contratos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

export function useBulkUpdateContrato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, any> }) => {
      const { error } = await (supabase as any).from('contratos').update(updates).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

export function useBulkDeleteContrato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any).from('contratos').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

export function useBulkCreateContrato() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: ContratoInput[]) => {
      const payload = rows.map(c => ({
        ...c,
        operadora_id: c.operadora_id || null,
        unidade_negocio: c.unidade_negocio || null,
        data_implantacao: c.data_implantacao || null,
        supervisor_a_id: c.supervisor_a_id || null,
        supervisor_b_id: c.supervisor_b_id || null,
        corretor_id: c.corretor_id || null,
        valor_contrato: c.valor_contrato ?? 0,
        user_id: user!.id,
      }));
      const { error } = await (supabase as any).from('contratos').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

// ===== Vínculo Contrato ↔ Receitas (por nome da proposta/descrição) =====

export type ReceitaResumo = { recebido: number; aguardando: number; qtd: number };

function normalizeNome(s: string): string {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Agrupa todas as receitas pela descrição normalizada (que corresponde ao nome
 * da proposta/contrato). Permite calcular quanto cada contrato já recebeu.
 */
export function useReceitasResumoPorNome() {
  return useQuery({
    queryKey: ['receitas-resumo-por-nome'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receitas')
        .select('descricao, valor, status');
      if (error) throw error;
      const map = new Map<string, ReceitaResumo>();
      for (const r of data || []) {
        const key = normalizeNome(r.descricao);
        if (!key) continue;
        const cur = map.get(key) || { recebido: 0, aguardando: 0, qtd: 0 };
        if (r.status === 'Recebido') cur.recebido += Number(r.valor);
        else cur.aguardando += Number(r.valor);
        cur.qtd += 1;
        map.set(key, cur);
      }
      return map;
    },
  });
}

export function getResumoContrato(
  resumo: Map<string, ReceitaResumo> | undefined,
  nomeContrato: string,
): ReceitaResumo | null {
  if (!resumo) return null;
  return resumo.get(normalizeNome(nomeContrato)) || null;
}

/** Retorna Map<nomeNormalizado, ReceitaItem[]> com detalhamento por contrato. */
export type ReceitaDetalheItem = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  status: string;
  operadora_nome: string | null;
  vendedor_nome: string | null;
};

export function useReceitasDetalhePorNome() {
  return useQuery({
    queryKey: ['receitas-detalhe-por-nome'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receitas')
        .select('id, data, descricao, valor, status, operadoras:operadora_id(nome), vendedores:vendedor_id(nome)')
        .order('data', { ascending: false });
      if (error) throw error;
      const map = new Map<string, ReceitaDetalheItem[]>();
      for (const r of (data || []) as any[]) {
        const key = normalizeNome(r.descricao);
        if (!key) continue;
        const item: ReceitaDetalheItem = {
          id: r.id,
          data: r.data,
          descricao: r.descricao,
          valor: Number(r.valor),
          status: r.status,
          operadora_nome: r.operadoras?.nome ?? null,
          vendedor_nome: r.vendedores?.nome ?? null,
        };
        const cur = map.get(key) || [];
        cur.push(item);
        map.set(key, cur);
      }
      return map;
    },
  });
}

export function getDetalheContrato(
  detalhe: Map<string, ReceitaDetalheItem[]> | undefined,
  nomeContrato: string,
): ReceitaDetalheItem[] {
  if (!detalhe) return [];
  return detalhe.get(normalizeNome(nomeContrato)) || [];
}

/** Conjunto de nomes de contratos existentes (normalizados) — usado para detectar receitas sem contrato. */
export function useContratosNomesSet() {
  return useQuery({
    queryKey: ['contratos-nomes-set'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contratos').select('nome');
      if (error) throw error;
      const set = new Set<string>();
      for (const c of (data || []) as any[]) {
        const key = normalizeNome(c.nome);
        if (key) set.add(key);
      }
      return set;
    },
  });
}

export function normalizeNomeContrato(s: string): string {
  return normalizeNome(s);
}

// ===== Comissões (derivadas dos contratos) =====

export type ComissaoItem = {
  contratoId: string;
  contratoNome: string;
  operadoraNome: string;
  dataImplantacao: string | null;
  papel: 'Supervisor A' | 'Supervisor B' | 'Corretor';
  campoPago: 'supervisor_a_pago' | 'supervisor_b_pago' | 'corretor_pago';
  pessoaId: string;
  pessoaNome: string;
  percentual: number | null;
  valor: number;
  pago: boolean;
};

/** Explode os contratos em itens de comissão, ignorando papéis sem responsável. */
export function extractComissoes(contratos: any[]): ComissaoItem[] {
  const itens: ComissaoItem[] = [];
  for (const c of contratos || []) {
    const base = Number(c.valor_contrato) || 0;
    const push = (
      papel: ComissaoItem['papel'],
      campoPago: ComissaoItem['campoPago'],
      pessoaId: string | null,
      pessoaNome: string | undefined,
      percentual: number | null,
      valorSalvo: number | null,
      pago: boolean,
    ) => {
      // Sem responsável = não é comissão real, ignora (evita "pagamentos fantasmas")
      if (!pessoaId) return;
      const valor = valorSalvo != null && Number(valorSalvo) > 0
        ? Number(valorSalvo)
        : percentual != null ? (base * Number(percentual)) / 100 : 0;
      itens.push({
        contratoId: c.id,
        contratoNome: c.nome,
        operadoraNome: c.operadoras?.nome || '—',
        dataImplantacao: c.data_implantacao || null,
        papel, campoPago,
        pessoaId,
        pessoaNome: pessoaNome || 'Desconhecido',
        percentual: percentual != null ? Number(percentual) : null,
        valor,
        pago: !!pago,
      });
    };
    push('Supervisor A', 'supervisor_a_pago', c.supervisor_a_id, c.supervisor_a?.nome, c.supervisor_a_percentual, c.supervisor_a_valor, c.supervisor_a_pago);
    push('Supervisor B', 'supervisor_b_pago', c.supervisor_b_id, c.supervisor_b?.nome, c.supervisor_b_percentual, c.supervisor_b_valor, c.supervisor_b_pago);
    push('Corretor', 'corretor_pago', c.corretor_id, c.corretor?.nome, c.corretor_percentual, c.corretor_valor, c.corretor_pago);
  }
  return itens;
}

// ===== DRE (cascata) e DFC =====

type PeriodArgs = { month?: number; year?: number; startDate?: string; endDate?: string; unidade?: string };

function resolveRange(a: PeriodArgs): { sd: string; ed: string } | null {
  if (a.startDate && a.endDate) return { sd: a.startDate, ed: a.endDate };
  if (a.month !== undefined && a.year !== undefined) {
    return {
      sd: toDateStr(a.year, a.month, 1),
      ed: toDateStr(a.year, a.month, new Date(a.year, a.month + 1, 0).getDate()),
    };
  }
  return null;
}

function applyUnidade<T extends { eq: any; is: any }>(q: T, unidade?: string): T {
  if (!unidade || unidade === 'all') return q;
  if (unidade === 'none') return q.is('unidade_negocio', null);
  return q.eq('unidade_negocio', unidade);
}

export type DREResult = {
  receitaBruta: number;
  despesasOperacionais: number;
  margemOperacional: number;
  custosFixos: number;
  margemContribuicao: number;
  impostos: number;
  resultadoLiquido: number;
};

export function useDRE(args: PeriodArgs) {
  return useQuery({
    queryKey: ['dre', args.month, args.year, args.startDate, args.endDate, args.unidade || 'all'],
    enabled: !!resolveRange(args),
    queryFn: async (): Promise<DREResult> => {
      const r = resolveRange(args)!;
      let rq: any = supabase.from('receitas').select('valor, unidade_negocio, status').eq('status', 'Recebido').gte('data', r.sd).lte('data', r.ed);
      let dq: any = supabase.from('despesas').select('valor, unidade_negocio, categorias_despesa(tipo_dre)').gte('data', r.sd).lte('data', r.ed);
      rq = applyUnidade(rq, args.unidade);
      dq = applyUnidade(dq, args.unidade);
      const [rr, dr] = await Promise.all([rq, dq]);
      if (rr.error) throw rr.error;
      if (dr.error) throw dr.error;
      const receitaBruta = (rr.data || []).reduce((a: number, x: any) => a + Number(x.valor), 0);
      let despesasOperacionais = 0, custosFixos = 0, impostos = 0;
      for (const d of dr.data || []) {
        const t = (d.categorias_despesa as any)?.tipo_dre || 'operacional';
        const v = Number(d.valor);
        if (t === 'custo_fixo') custosFixos += v;
        else if (t === 'imposto') impostos += v;
        else despesasOperacionais += v;
      }
      const margemOperacional = receitaBruta - despesasOperacionais;
      const margemContribuicao = margemOperacional - custosFixos;
      const resultadoLiquido = margemContribuicao - impostos;
      return { receitaBruta, despesasOperacionais, margemOperacional, custosFixos, margemContribuicao, impostos, resultadoLiquido };
    },
  });
}

export type DFCRealizado = {
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  saldoRealizado: number;
  saldoTotal: number;
};

export function useDFCRealizado(args: PeriodArgs) {
  return useQuery({
    queryKey: ['dfc-realizado', args.month, args.year, args.startDate, args.endDate, args.unidade || 'all'],
    enabled: !!resolveRange(args),
    queryFn: async (): Promise<DFCRealizado> => {
      const r = resolveRange(args)!;
      let rq: any = supabase.from('receitas').select('valor, status, unidade_negocio').gte('data', r.sd).lte('data', r.ed);
      let dq: any = supabase.from('despesas').select('valor, status, unidade_negocio').gte('data', r.sd).lte('data', r.ed);
      rq = applyUnidade(rq, args.unidade);
      dq = applyUnidade(dq, args.unidade);
      const [rr, dr] = await Promise.all([rq, dq]);
      if (rr.error) throw rr.error;
      if (dr.error) throw dr.error;
      let entradasRealizadas = 0, entradasPrevistas = 0;
      for (const x of rr.data || []) {
        if (x.status === 'Recebido') entradasRealizadas += Number(x.valor);
        else entradasPrevistas += Number(x.valor);
      }
      let saidasRealizadas = 0, saidasPrevistas = 0;
      for (const x of dr.data || []) {
        if (x.status === 'Pago') saidasRealizadas += Number(x.valor);
        else saidasPrevistas += Number(x.valor);
      }
      const saldoRealizado = entradasRealizadas - saidasRealizadas;
      const saldoTotal = (entradasRealizadas + entradasPrevistas) - (saidasRealizadas + saidasPrevistas);
      return { entradasRealizadas, saidasRealizadas, entradasPrevistas, saidasPrevistas, saldoRealizado, saldoTotal };
    },
  });
}

export type DFCProjetadoPonto = { semana: string; sd: string; ed: string; entradas: number; saidas: number; saldo: number; saldoAcumulado: number };

/**
 * Projeção semanal do fluxo de caixa nos próximos N dias (a partir de hoje).
 * Entradas: receitas com status "Aguardando" (data futura).
 * Saídas: despesas com status "A pagar" ou "Atrasado" (data futura ou vencidas).
 */
export function useDFCProjetado(unidade?: string, daysAhead = 90) {
  return useQuery({
    queryKey: ['dfc-projetado', unidade || 'all', daysAhead],
    queryFn: async (): Promise<DFCProjetadoPonto[]> => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(start);
      end.setDate(start.getDate() + daysAhead);
      const sd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const ed = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

      let rq: any = supabase.from('receitas').select('data, valor, status, unidade_negocio').eq('status', 'Aguardando').gte('data', sd).lte('data', ed);
      let dq: any = supabase.from('despesas').select('data, valor, status, unidade_negocio').in('status', ['A pagar', 'Atrasado']).gte('data', sd).lte('data', ed);
      rq = applyUnidade(rq, unidade);
      dq = applyUnidade(dq, unidade);
      const [rr, dr] = await Promise.all([rq, dq]);
      if (rr.error) throw rr.error;
      if (dr.error) throw dr.error;

      // Buckets semanais (7d) a partir de hoje
      const weeks = Math.ceil(daysAhead / 7);
      const buckets: DFCProjetadoPonto[] = [];
      for (let i = 0; i < weeks; i++) {
        const ws = new Date(start); ws.setDate(start.getDate() + i * 7);
        const we = new Date(start); we.setDate(start.getDate() + i * 7 + 6);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        buckets.push({
          semana: `${String(ws.getDate()).padStart(2, '0')}/${String(ws.getMonth() + 1).padStart(2, '0')}`,
          sd: fmt(ws), ed: fmt(we),
          entradas: 0, saidas: 0, saldo: 0, saldoAcumulado: 0,
        });
      }
      const findBucket = (dStr: string) => buckets.find(b => dStr >= b.sd && dStr <= b.ed);
      for (const x of rr.data || []) { const b = findBucket(x.data); if (b) b.entradas += Number(x.valor); }
      for (const x of dr.data || []) { const b = findBucket(x.data); if (b) b.saidas += Number(x.valor); }
      let acc = 0;
      for (const b of buckets) {
        b.saldo = b.entradas - b.saidas;
        acc += b.saldo;
        b.saldoAcumulado = acc;
      }
      return buckets;
    },
  });
}

