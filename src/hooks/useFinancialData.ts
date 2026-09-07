import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  type Regime,
  type ResultadoDRE,
  type ResultadoCaixa,
  calcularFluxoCaixa,
} from '../../supabase/functions/odisseia-mcp/dre';
import { carregarLancamentosRelatorio, relatorioDRE, projetarCaixa, dataLocal, fetchAllRows, lancamentoAtivo } from '@/lib/financialReporting';

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
      const rows = await fetchAllRows<any>((from, to) => {
        let query = supabase.from('receitas').select('*, vendedores(nome), operadoras(nome)').order('data').order('id');
        if (startDate && endDate) query = query.gte('data', startDate).lte('data', endDate);
        else if (month !== undefined && year !== undefined) {
          query = query.gte('data', toDateStr(year, month, 1)).lte('data', toDateStr(year, month, new Date(year, month + 1, 0).getDate()));
        }
        return query.range(from, to);
      });
      return rows.filter(r => lancamentoAtivo(r, 'receita'));
    },
  });
}

export function useDespesas(month?: number, year?: number, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['despesas', month, year, startDate, endDate],
    queryFn: async () => {
      const rows = await fetchAllRows<any>((from, to) => {
        let query = supabase.from('despesas').select('*, categorias_despesa(nome), setores_despesa(nome)').order('data').order('id');
        if (startDate && endDate) query = query.gte('data', startDate).lte('data', endDate);
        else if (month !== undefined && year !== undefined) {
          query = query.gte('data', toDateStr(year, month, 1)).lte('data', toDateStr(year, month, new Date(year, month + 1, 0).getDate()));
        }
        return query.range(from, to);
      });
      return rows.filter(r => lancamentoAtivo(r, 'despesa'));
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
  return useMutation({
    mutationFn: async ({ sourceMonth, sourceYear, targetMonth, targetYear }: {
      sourceMonth: number; sourceYear: number; targetMonth: number; targetYear: number;
    }) => {
      // Database locks the real series and enforces occurrence uniqueness.
      // Legacy rows without a verified series are reported, NEVER copied by text.
      const { data, error } = await (supabase as any).rpc('gerar_ocorrencias_recorrentes', {
        _source_inicio: toDateStr(sourceYear, sourceMonth, 1),
        _source_fim: toDateStr(sourceYear, sourceMonth, new Date(sourceYear, sourceMonth + 1, 0).getDate()),
        _target_inicio: toDateStr(targetYear, targetMonth, 1),
      });
      if (error) throw error;
      return {
        geradas: data.criadas ?? 0,
        ignoradas_serie_encerrada: data.ignoradas_encerradas ?? 0,
        ignoradas_canceladas: data.ignoradas_canceladas ?? 0,
        ignoradas_existentes: data.ignoradas_existentes ?? 0,
        sem_serie: data.legadas_sem_serie ?? 0,
        pendencias: (data.pendencias ?? []) as { serie_id?: string; motivo: string }[],
      };
    },
    onSuccess: () => queryClient.invalidateQueries(),
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
      const lancamentos = await carregarLancamentosRelatorio(supabase);
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const y = d.getFullYear(), m = d.getMonth();
        const caixa = calcularFluxoCaixa(lancamentos, { inicio: toDateStr(y, m, 1), fim: toDateStr(y, m, new Date(y, m + 1, 0).getDate()), filtros: { unidade } });
        return { mes: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), receitas: caixa.entradas_realizadas, despesas: caixa.saidas_realizadas };
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
    queryFn: () => fetchAllRows<any>((from, to) => (supabase as any)
      .from('contratos')
      .select('*, operadoras(nome), supervisor_a:supervisores!supervisor_a_id(nome), supervisor_b:supervisores!supervisor_b_id(nome), corretor:vendedores!corretor_id(nome)')
      .order('data_implantacao', { ascending: false, nullsFirst: false }).order('id').range(from, to)),
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

// ===== Vínculo Contrato ↔ Receitas (por receitas.contrato_id) =====

export type ReceitaResumo = { recebido: number; aguardando: number; qtd: number };

function normalizeNome(s: string): string {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export type ReceitaDetalheItem = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  status: string;
  operadora_nome: string | null;
  vendedor_nome: string | null;
};

/** Todas as receitas ligadas a um contrato, agrupadas por contrato_id. */
export function useReceitasDetalhePorContrato() {
  return useQuery({
    queryKey: ['receitas-por-contrato'],
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) => (supabase as any)
        .from('receitas')
        .select('id, data, data_recebimento, vencimento, cancelado, descricao, valor, status, contrato_id, operadoras:operadora_id(nome), vendedores:vendedor_id(nome)')
        .not('contrato_id', 'is', null)
        .order('data', { ascending: false }).order('id').range(from, to));
      const map = new Map<string, ReceitaDetalheItem[]>();
      for (const r of (data || []) as any[]) {
        if (!r.contrato_id || !lancamentoAtivo(r, 'receita')) continue;
        const item: ReceitaDetalheItem = {
          id: r.id,
          data: r.data,
          descricao: r.descricao,
          valor: Number(r.valor),
          status: r.status,
          operadora_nome: r.operadoras?.nome ?? null,
          vendedor_nome: r.vendedores?.nome ?? null,
        };
        const cur = map.get(r.contrato_id) || [];
        cur.push(item);
        map.set(r.contrato_id, cur);
      }
      return map;
    },
  });
}

export function getDetalheContrato(
  detalhe: Map<string, ReceitaDetalheItem[]> | undefined,
  contratoId: string,
): ReceitaDetalheItem[] {
  if (!detalhe) return [];
  return detalhe.get(contratoId) || [];
}

export function getResumoContrato(
  detalhe: Map<string, ReceitaDetalheItem[]> | undefined,
  contratoId: string,
): ReceitaResumo | null {
  const itens = getDetalheContrato(detalhe, contratoId);
  if (!itens.length) return null;
  let recebido = 0, aguardando = 0;
  for (const i of itens) {
    if (i.status === 'Recebido') recebido += i.valor;
    else aguardando += i.valor;
  }
  return { recebido, aguardando, qtd: itens.length };
}

export type ReceitaPendenteGrupo = { nome: string; qtd: number; total: number; ids: string[] };

/** Receitas ainda sem contrato_id, agrupadas pela descrição (pendências de vínculo). */
export function useReceitasSemContrato() {
  return useQuery({
    queryKey: ['receitas-sem-contrato'],
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) => (supabase as any)
        .from('receitas')
        .select('id, descricao, valor, status, cancelado')
        .is('contrato_id', null).order('id').range(from, to));
      const map = new Map<string, ReceitaPendenteGrupo>();
      for (const r of (data || []) as any[]) {
        if (!lancamentoAtivo(r, 'receita')) continue;
        const key = normalizeNome(r.descricao);
        if (!key) continue;
        const cur = map.get(key) || { nome: r.descricao, qtd: 0, total: 0, ids: [] };
        cur.qtd += 1;
        cur.total += Number(r.valor) || 0;
        cur.ids.push(r.id);
        map.set(key, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    },
  });
}

export function normalizeNomeContrato(s: string): string {
  return normalizeNome(s);
}

/** Vincula receitas a um contrato gravando o contrato_id (não altera a descrição). */
export function useVincularReceitasAoContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, contratoId }: { ids: string[]; contratoId: string }) => {
      if (!ids.length) return;
      const { error } = await (supabase as any)
        .from('receitas')
        .update({ contrato_id: contratoId })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receitas'] });
      qc.invalidateQueries({ queryKey: ['receitas-por-contrato'] });
      qc.invalidateQueries({ queryKey: ['receitas-sem-contrato'] });
      qc.invalidateQueries({ queryKey: ['contratos'] });
    },
  });
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
  /** Detalhamento completo (mesma regra usada pelo assistente/MCP). */
  detalhe: ResultadoDRE;
};

/**
 * DRE com a MESMA regra do servidor MCP (regime de competência, caixa realizado ou projetado).
 * Dados sem competência/pagamento/vencimento ou classificação viram pendências visíveis.
 * Não há fallback para datas legadas nem classificação automática.
 */
export function useDRE(args: PeriodArgs & { regime?: Regime; setor?: string }) {
  const regime: Regime = args.regime ?? 'competencia';
  return useQuery({
    queryKey: ['dre', regime, args.month, args.year, args.startDate, args.endDate, args.unidade || 'all', args.setor || 'all'],
    enabled: !!resolveRange(args),
    queryFn: async (): Promise<DREResult> => {
      const r = resolveRange(args)!;
      const lancamentos = await carregarLancamentosRelatorio(supabase);
      return relatorioDRE(lancamentos, r.sd, r.ed, regime, { unidade: args.unidade, setor: args.setor });
    },
  });
}

export type DFCRealizado = {
  entradasRealizadas: number; saidasRealizadas: number; entradasPrevistas: number; saidasPrevistas: number;
  saldoRealizado: number; saldoTotal: number; detalhe: ResultadoCaixa;
};

export function useDFCRealizado(args: PeriodArgs & { setor?: string }) {
  return useQuery({
    queryKey: ['dfc-realizado', args.month, args.year, args.startDate, args.endDate, args.unidade || 'all', args.setor || 'all'],
    enabled: !!resolveRange(args),
    queryFn: async (): Promise<DFCRealizado> => {
      const r = resolveRange(args)!;
      const lancamentos = await carregarLancamentosRelatorio(supabase);
      const detalhe = calcularFluxoCaixa(lancamentos, { inicio: r.sd, fim: r.ed, filtros: { unidade: args.unidade, setor: args.setor } });
      return {
        entradasRealizadas: detalhe.entradas_realizadas, saidasRealizadas: detalhe.saidas_realizadas,
        entradasPrevistas: detalhe.entradas_previstas, saidasPrevistas: detalhe.saidas_previstas,
        saldoRealizado: detalhe.saldo_realizado, saldoTotal: detalhe.saldo_total, detalhe,
      };
    },
  });
}

export type DFCProjetadoPonto = { semana: string; sd: string; ed: string; entradas: number; saidas: number; saldo: number; saldoAcumulado: number };

/** Explicit due dates only; arrears and records with absent dates are reported separately. */
export function useDFCProjetado(unidade?: string, daysAhead = 90, setor?: string) {
  return useQuery({
    queryKey: ['dfc-projetado', unidade || 'all', daysAhead, setor || 'all'],
    queryFn: async () => {
      const lancamentos = await carregarLancamentosRelatorio(supabase);
      return projetarCaixa(lancamentos, dataLocal(new Date()), daysAhead, { unidade, setor });
    },
  });
}

