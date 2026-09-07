/**
 * DRE por competência x caixa (realizado / projetado) — lógica pura e compartilhada
 * entre o servidor MCP e a aplicação. Sem dependências de runtime.
 *
 * Regras:
 * - competência: reconhecimento pela data de competência, independente de pagamento.
 * - realizado:   somente lançamentos efetivamente liquidados, na data efetiva de pagamento/recebimento.
 * - projetado:   somente lançamentos em aberto, na data de vencimento.
 * - Nenhuma data é inferida. Faltando a data do regime, o lançamento vira PENDÊNCIA
 *   (contagem + valor) e nunca é somado silenciosamente como zero.
 */

export type Regime = 'competencia' | 'realizado' | 'projetado';

export const REGIMES: Regime[] = ['competencia', 'realizado', 'projetado'];

export const GRUPOS_DRE = [
  'receita_operacional',
  'deducoes_receita',
  'custos_variaveis',
  'despesas_fixas',
  'despesas_comerciais',
  'resultado_financeiro',
  'depreciacao_amortizacao',
  'tributos_lucro',
  'fora_dre',
] as const;

export type GrupoDRE = (typeof GRUPOS_DRE)[number];

export const STATUS_LIQUIDADO: Record<'receita' | 'despesa', string[]> = {
  receita: ['Recebido'],
  despesa: ['Pago'],
};

/** Mapa da classificação legada (tipo_dre) para os grupos canônicos, preservando a ordem da cascata. */
export const GRUPO_LEGADO: Record<string, GrupoDRE> = {
  operacional: 'custos_variaveis',
  custo_fixo: 'despesas_fixas',
  imposto: 'tributos_lucro',
};

/** Grupo de uma categoria: usa grupo_dre e, opcionalmente, cai no tipo_dre legado. */
export function grupoDeCategoria(
  cat: { grupo_dre?: string | null; tipo_dre?: string | null } | null | undefined,
  usarLegado = false,
): string | null {
  if (!cat) return null;
  if (cat.grupo_dre) return cat.grupo_dre;
  if (usarLegado && cat.tipo_dre) return GRUPO_LEGADO[cat.tipo_dre] ?? null;
  return null;
}

export type LancamentoDRE = {
  id?: string;
  origem: 'receita' | 'despesa';
  valor: number | string | null;
  status?: string | null;
  cancelado?: boolean | null;
  competencia?: string | null;
  vencimento?: string | null;
  /** data_pagamento (despesa) ou data_recebimento (receita) */
  data_efetiva?: string | null;
  /** Data legada do lançamento; só usada se `fallback_data_legada` for ligado explicitamente. */
  data_legada?: string | null;
  grupo?: string | null;
  unidade_negocio?: string | null;
  setor?: string | null;
};

export type Bucket = { quantidade: number; valor: number };

export type PendenciasDRE = {
  sem_data_do_regime: Bucket;
  sem_grupo_dre: Bucket;
  cancelados_ignorados: Bucket;
  cobertura_percentual: number | null;
  avisos: string[];
};

export type ResultadoDRE = {
  regime: Regime;
  periodo: { inicio: string; fim: string };
  grupos: Record<string, Bucket>;
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custos_variaveis: number;
  margem_contribuicao: number;
  despesas_fixas: number;
  despesas_comerciais: number;
  resultado_antes_depreciacao: number;
  depreciacao_amortizacao: number;
  resultado_operacional: number;
  resultado_financeiro: number;
  resultado_antes_tributos: number;
  tributos_lucro: number;
  resultado_liquido: number;
  fora_dre: Bucket;
  nao_classificado: Bucket;
  margens: { contribuicao: number | null; operacional: number | null; liquida: number | null };
  pendencias: PendenciasDRE;
  itens_considerados: number;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

const zero = (): Bucket => ({ quantidade: 0, valor: 0 });
const add = (b: Bucket, v: number) => {
  b.quantidade += 1;
  b.valor = r2(b.valor + v);
};

export function liquidado(l: LancamentoDRE): boolean {
  return STATUS_LIQUIDADO[l.origem].includes(String(l.status ?? ''));
}

/** Data que o regime exige. `null` quando ausente (vira pendência). */
export function dataDoRegime(l: LancamentoDRE, regime: Regime): string | null {
  if (regime === 'competencia') return l.competencia ?? null;
  if (regime === 'realizado') return l.data_efetiva ?? null;
  return l.vencimento ?? null;
}

/** O lançamento é candidato a aparecer neste regime? */
export function candidato(l: LancamentoDRE, regime: Regime): boolean {
  if (l.cancelado) return false;
  if (regime === 'realizado') return liquidado(l);
  if (regime === 'projetado') return !liquidado(l);
  return true;
}

export function grupoDe(l: LancamentoDRE): string | null {
  if (l.grupo) return l.grupo;
  return null;
}

export type FiltrosDRE = { unidade?: string | null; setor?: string | null };

export function passaFiltros(l: LancamentoDRE, f: FiltrosDRE): boolean {
  if (f.unidade && f.unidade !== 'all') {
    if (f.unidade === 'none') {
      if (l.unidade_negocio) return false;
    } else if (l.unidade_negocio !== f.unidade) return false;
  }
  if (f.setor && f.setor !== 'all') {
    if (f.setor === 'none') {
      if (l.setor) return false;
    } else if ((l.setor ?? '') !== f.setor) return false;
  }
  return true;
}

export function calcularDRE(
  lancamentos: LancamentoDRE[],
  opts: { regime: Regime; inicio: string; fim: string; filtros?: FiltrosDRE; fallbackDataLegada?: boolean },
): ResultadoDRE {
  const { regime, inicio, fim } = opts;
  const filtros = opts.filtros ?? {};
  const fallback = opts.fallbackDataLegada === true;
  const grupos: Record<string, Bucket> = {};
  for (const g of GRUPOS_DRE) grupos[g] = zero();
  const naoClassificado = zero();
  const pendSemData = zero();
  const pendSemGrupo = zero();
  const cancelados = zero();
  const viaDataLegada = zero();
  let considerados = 0;
  let candidatos = 0;

  for (const l of lancamentos) {
    if (!passaFiltros(l, filtros)) continue;
    const v = n(l.valor);
    if (l.cancelado) {
      add(cancelados, v);
      continue;
    }
    if (!candidato(l, regime)) continue;
    candidatos += 1;
    let d = dataDoRegime(l, regime);
    if (!d && fallback && l.data_legada) {
      d = l.data_legada;
      add(viaDataLegada, v);
    }
    if (!d) {
      add(pendSemData, v);
      continue;
    }
    if (d < inicio || d > fim) continue;


    const g = grupoDe(l);
    if (!g) {
      add(naoClassificado, v);
      if (l.origem === 'despesa') add(pendSemGrupo, v);
      else {
        // Receita sem grupo cai em receita operacional, mas fica sinalizada.
        naoClassificado.quantidade -= 1;
        naoClassificado.valor = r2(naoClassificado.valor - v);
        add(grupos.receita_operacional, v);
        add(pendSemGrupo, v);
        considerados += 1;
      }
      continue;
    }
    if (!(g in grupos)) {
      add(naoClassificado, v);
      add(pendSemGrupo, v);
      continue;
    }
    add(grupos[g], v);
    considerados += 1;
  }

  const receitaBruta = grupos.receita_operacional.valor;
  const deducoes = grupos.deducoes_receita.valor;
  const receitaLiquida = r2(receitaBruta - deducoes);
  const custosVariaveis = grupos.custos_variaveis.valor;
  const margemContribuicao = r2(receitaLiquida - custosVariaveis);
  const fixas = grupos.despesas_fixas.valor;
  const comerciais = grupos.despesas_comerciais.valor;
  const antesDepreciacao = r2(margemContribuicao - fixas - comerciais);
  const depreciacao = grupos.depreciacao_amortizacao.valor;
  const resultadoOperacional = r2(antesDepreciacao - depreciacao);
  const financeiro = grupos.resultado_financeiro.valor;
  const antesTributos = r2(resultadoOperacional - financeiro);
  const tributos = grupos.tributos_lucro.valor;
  const resultadoLiquido = r2(antesTributos - tributos);

  const pct = (v: number) => (receitaLiquida > 0 ? r2((v / receitaLiquida) * 100) : null);
  const cobertura = candidatos > 0 ? r2(((candidatos - pendSemData.quantidade) / candidatos) * 100) : null;

  const avisos: string[] = [];
  if (pendSemData.quantidade) {
    avisos.push(
      `${pendSemData.quantidade} lançamento(s) sem a data exigida pelo regime "${regime}" ` +
        `(total ${pendSemData.valor}) ficaram FORA dos totais. Nenhuma data foi presumida.`,
    );
  }
  if (pendSemGrupo.quantidade) {
    avisos.push(`${pendSemGrupo.quantidade} lançamento(s) sem grupo de DRE definido na categoria (total ${pendSemGrupo.valor}).`);
  }
  if (grupos.fora_dre.quantidade) {
    avisos.push(
      `${grupos.fora_dre.quantidade} lançamento(s) classificados como "fora_dre" (empréstimo/principal, compra de ativos, ` +
        `investimentos) não afetam o resultado — total ${grupos.fora_dre.valor}.`,
    );
  }
  if (filtros.setor && filtros.setor !== 'all') {
    avisos.push('Filtro de setor aplicado aos dois lados; receitas sem setor cadastrado são excluídas por não atenderem ao filtro.');
  }
  if (viaDataLegada.quantidade) {
    avisos.push(
      `${viaDataLegada.quantidade} lançamento(s) (total ${viaDataLegada.valor}) entraram pela data legada do lançamento ` +
        `por ainda não terem a data específica do regime "${regime}". Nenhuma data foi gravada no banco.`,
    );
  }

  return {
    regime,
    periodo: { inicio, fim },
    grupos,
    receita_bruta: receitaBruta,
    deducoes,
    receita_liquida: receitaLiquida,
    custos_variaveis: custosVariaveis,
    margem_contribuicao: margemContribuicao,
    despesas_fixas: fixas,
    despesas_comerciais: comerciais,
    resultado_antes_depreciacao: antesDepreciacao,
    depreciacao_amortizacao: depreciacao,
    resultado_operacional: resultadoOperacional,
    resultado_financeiro: financeiro,
    resultado_antes_tributos: antesTributos,
    tributos_lucro: tributos,
    resultado_liquido: resultadoLiquido,
    fora_dre: grupos.fora_dre,
    nao_classificado: naoClassificado,
    margens: {
      contribuicao: pct(margemContribuicao),
      operacional: pct(resultadoOperacional),
      liquida: pct(resultadoLiquido),
    },
    pendencias: {
      sem_data_do_regime: pendSemData,
      sem_grupo_dre: pendSemGrupo,
      cancelados_ignorados: cancelados,
      cobertura_percentual: cobertura,
      avisos,
    },
    itens_considerados: considerados,
  };
}
