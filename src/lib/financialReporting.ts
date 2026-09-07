import {
  calcularDRE, calcularFluxoCaixa, cancelado, grupoEfetivo,
  type FiltrosDRE, type LancamentoDRE, type Regime, type ResultadoDRE,
} from '../../supabase/functions/odisseia-mcp/dre';

/** The caller must order each query by a unique key before range. */
export async function fetchAllRows<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await build(from, from + 999);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export function lancamentosParaRelatorio(receitas: any[], despesas: any[], categorias: any[], subcategorias: any[], setores: any[]): LancamentoDRE[] {
  const cats = new Map(categorias.map(c => [c.id, c]));
  const subs = new Map(subcategorias.map(c => [c.id, c]));
  const sectors = new Map(setores.map(s => [s.id, s.nome]));
  const map = (origem: 'receita' | 'despesa') => (r: any): LancamentoDRE => ({
    id: r.id, origem, valor: r.valor, status: r.status, cancelado: r.cancelado,
    competencia: r.competencia, vencimento: r.vencimento,
    data_efetiva: origem === 'receita' ? r.data_recebimento : r.data_pagamento,
    grupo: grupoEfetivo(cats.get(r.categoria_id), subs.get(r.subcategoria_id)),
    unidade_negocio: r.unidade_negocio, setor: sectors.get(r.setor_id) ?? null,
  });
  return [...receitas.map(map('receita')), ...despesas.map(map('despesa'))];
}

/** Reads absent-date records too, so the report can expose gaps rather than hide them. */
export async function carregarLancamentosRelatorio(client: any): Promise<LancamentoDRE[]> {
  const read = (table: string, fields: string) => fetchAllRows((from, to) => client.from(table).select(fields).order('id').range(from, to));
  const [receitas, despesas, categorias, subs, setores] = await Promise.all([
    read('receitas', 'id,valor,status,cancelado,competencia,vencimento,data_recebimento,categoria_id,subcategoria_id,unidade_negocio,setor_id'),
    read('despesas', 'id,valor,status,cancelado,competencia,vencimento,data_pagamento,categoria_id,subcategoria_id,unidade_negocio,setor_id'),
    read('categorias_despesa', 'id,grupo_dre'), read('subcategorias_despesa', 'id,grupo_dre'), read('setores_despesa', 'id,nome'),
  ]);
  return lancamentosParaRelatorio(receitas, despesas, categorias, subs, setores);
}

export function dreParaUI(detalhe: ResultadoDRE) {
  return {
    receitaBruta: detalhe.receita_bruta, despesasOperacionais: detalhe.custos_variaveis,
    margemOperacional: detalhe.resultado_operacional, custosFixos: detalhe.despesas_fixas,
    margemContribuicao: detalhe.margem_contribuicao, impostos: detalhe.tributos_lucro,
    resultadoLiquido: detalhe.resultado_liquido, detalhe,
  };
}

export function relatorioDRE(lancamentos: LancamentoDRE[], inicio: string, fim: string, regime: Regime, filtros: FiltrosDRE) {
  return dreParaUI(calcularDRE(lancamentos, { inicio, fim, regime, filtros }));
}

export const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const somarDias = (inicio: string, dias: number) => {
  const [y, m, d] = inicio.split('-').map(Number);
  return dataLocal(new Date(y, m - 1, d + dias, 12));
};

/** Exactly N calendar days (inclusive today), not rounded-up weeks. Arrears remain separate. */
export function projetarCaixa(lancamentos: LancamentoDRE[], inicio: string, dias: number, filtros: FiltrosDRE = {}) {
  if (!Number.isInteger(dias) || dias < 1 || dias > 366) throw new Error('Horizonte inválido.');
  const fim = somarDias(inicio, dias - 1);
  const resumo = calcularFluxoCaixa(lancamentos, { inicio, fim, filtros });
  const pontos = [];
  let acumulado = 0;
  for (let i = 0; i < dias; i += 7) {
    const sd = somarDias(inicio, i), ed = somarDias(inicio, Math.min(i + 6, dias - 1));
    const caixa = calcularFluxoCaixa(lancamentos, { inicio: sd, fim: ed, filtros });
    acumulado = Math.round((acumulado + caixa.saldo_previsto) * 100) / 100;
    pontos.push({ semana: `${sd.slice(8)}/${sd.slice(5, 7)}`, sd, ed, entradas: caixa.entradas_previstas, saidas: caixa.saidas_previstas, saldo: caixa.saldo_previsto, saldoAcumulado: acumulado });
  }
  return { pontos, resumo };
}

export const lancamentoAtivo = (r: any, origem: 'receita' | 'despesa') => !cancelado({ ...r, origem });
