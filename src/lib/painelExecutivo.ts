import {
  calcularDRE, calcularFluxoCaixa, cancelado, dataValida, emAberto, liquidado, passaFiltros,
  type FiltrosDRE, type LancamentoDRE,
} from '../../supabase/functions/odisseia-mcp/dre';

export type LancamentoExec = LancamentoDRE & {
  categoria_nome?: string | null;
  serie_id?: string | null;
  descricao?: string | null;
  datas_legado?: boolean;
};

export type Metas = { margem_contribuicao_min: number; custo_fixo_max: number; geracao_caixa_min: number };
export const METAS_PADRAO: Metas = { margem_contribuicao_min: 40, custo_fixo_max: 15, geracao_caixa_min: 30 };

export type StatusMeta = 'saudavel' | 'atencao' | 'critico' | 'sem_dados';

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? r2((num / den) * 100) : null);
const ehComissao = (l: LancamentoExec) => l.origem === 'despesa' && /comiss/i.test(l.categoria_nome ?? '');

/** Faixa de atenção: até 5 p.p. do alvo. */
export function statusMeta(valor: number | null, alvo: number, sentido: 'min' | 'max'): StatusMeta {
  if (valor == null) return 'sem_dados';
  const folga = sentido === 'min' ? valor - alvo : alvo - valor;
  if (folga >= 0) return 'saudavel';
  return folga >= -5 ? 'atencao' : 'critico';
}

const naFaixa = (d: string | null | undefined, inicio: string, fim: string) => dataValida(d) && d >= inicio && d <= fim;

export function calcularPainel(lancs: LancamentoExec[], inicio: string, fim: string, filtros: FiltrosDRE, metas: Metas) {
  const dre = calcularDRE(lancs, { inicio, fim, regime: 'competencia', filtros });
  const caixa = calcularFluxoCaixa(lancs, { inicio, fim, filtros });
  const doPeriodo = lancs.filter(l => !cancelado(l) && passaFiltros(l, filtros) && naFaixa(l.competencia, inicio, fim));

  const receitaRecebida = r2(doPeriodo.filter(l => l.origem === 'receita' && liquidado(l)).reduce((a, l) => a + Number(l.valor), 0));
  const receitaAReceber = r2(doPeriodo.filter(l => l.origem === 'receita' && emAberto(l)).reduce((a, l) => a + Number(l.valor), 0));
  const comissoes = r2(doPeriodo.filter(ehComissao).reduce((a, l) => a + Number(l.valor), 0));

  const rl = dre.receita_liquida;
  const mcPct = pct(dre.margem_contribuicao, rl);
  const estrutura = r2(dre.despesas_fixas + dre.despesas_comerciais);
  const breakEven = mcPct && mcPct > 0 ? r2(estrutura / (mcPct / 100)) : null;
  const custoFixoPct = pct(dre.despesas_fixas, rl);
  const geracao = r2(caixa.entradas_realizadas - caixa.saidas_realizadas);
  const geracaoPct = pct(geracao, caixa.entradas_realizadas);

  return {
    dre, caixa,
    receita: { bruta: dre.receita_bruta, liquida: rl, recebida: receitaRecebida, a_receber: receitaAReceber },
    margem: { contribuicao: dre.margem_contribuicao, contribuicao_pct: mcPct },
    custos: { variaveis: dre.custos_variaveis, comissoes, comerciais: dre.despesas_comerciais, fixos: dre.despesas_fixas, fixo_pct: custoFixoPct },
    resultado: { operacional: dre.resultado_operacional, operacional_pct: pct(dre.resultado_operacional, rl), liquido: dre.resultado_liquido, liquido_pct: pct(dre.resultado_liquido, rl) },
    geracaoCaixa: { entradas: caixa.entradas_realizadas, saidas: caixa.saidas_realizadas, geracao, pct: geracaoPct },
    breakEven: {
      valor: breakEven, estrutura,
      falta: breakEven == null ? null : r2(Math.max(0, breakEven - rl)),
      atingido_pct: breakEven ? r2((rl / breakEven) * 100) : null,
    },
    status: {
      margem: statusMeta(mcPct, metas.margem_contribuicao_min, 'min'),
      custoFixo: statusMeta(custoFixoPct, metas.custo_fixo_max, 'max'),
      caixa: statusMeta(geracaoPct, metas.geracao_caixa_min, 'min'),
    },
  };
}

/** Período anterior de mesma duração (mês cheio -> mês anterior cheio). */
export function periodoAnterior(inicio: string, fim: string) {
  const [y1, m1, d1] = inicio.split('-').map(Number);
  const [y2, m2, d2] = fim.split('-').map(Number);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ultimoDia = new Date(y2, m2, 0).getDate();
  if (d1 === 1 && d2 === ultimoDia && y1 === y2 && m1 === m2) {
    return { inicio: fmt(new Date(y1, m1 - 2, 1, 12)), fim: fmt(new Date(y1, m1 - 1, 0, 12)) };
  }
  const ini = new Date(y1, m1 - 1, d1, 12), f = new Date(y2, m2 - 1, d2, 12);
  const dias = Math.round((f.getTime() - ini.getTime()) / 86400000) + 1;
  return { inicio: fmt(new Date(y1, m1 - 1, d1 - dias, 12)), fim: fmt(new Date(y1, m1 - 1, d1 - 1, 12)) };
}

export type SerieInfo = { id: string; nome: string; tipo: string; ativa: boolean };

/** Auditoria de dados: tudo que impede cobertura de 100%. Não altera nada. */
export function qualidadeFinanceira(lancs: LancamentoExec[], series: SerieInfo[]) {
  const ativos = lancs.filter(l => !cancelado(l));
  const conta = (f: (l: LancamentoExec) => boolean) => {
    const s = ativos.filter(f);
    return { quantidade: s.length, valor: r2(s.reduce((a, l) => a + Number(l.valor), 0)) };
  };
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

  const grupos = new Map<string, SerieInfo[]>();
  for (const s of series.filter(s => s.ativa)) {
    const k = `${s.tipo}|${norm(s.nome)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  const seriesDuplicadas = [...grupos.values()].filter(g => g.length > 1).map(g => ({ nome: g[0].nome, tipo: g[0].tipo, ids: g.map(s => s.id) }));

  const porSerieMes = new Map<string, number>();
  for (const l of ativos) if (l.serie_id && dataValida(l.competencia)) {
    const k = `${l.serie_id}|${l.competencia.slice(0, 7)}`;
    porSerieMes.set(k, (porSerieMes.get(k) ?? 0) + 1);
  }
  const ocorrenciasRepetidas = [...porSerieMes.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ serie_id: k.split('|')[0], mes: k.split('|')[1], quantidade: n }));

  const itens = {
    sem_competencia: conta(l => !dataValida(l.competencia)),
    liquidados_sem_data_efetiva: conta(l => liquidado(l) && !dataValida(l.data_efetiva)),
    abertos_sem_vencimento: conta(l => emAberto(l) && !dataValida(l.vencimento)),
    sem_grupo_dre: conta(l => !l.grupo),
    datas_de_legado: conta(l => !!l.datas_legado),
    comissoes_sem_vinculo: conta(ehComissao),
  };
  const problemas = new Set<string>();
  for (const l of ativos) {
    if (!dataValida(l.competencia) || (liquidado(l) && !dataValida(l.data_efetiva)) || (emAberto(l) && !dataValida(l.vencimento)) || !l.grupo) problemas.add(l.id);
  }
  return {
    total: ativos.length, itens, seriesDuplicadas, ocorrenciasRepetidas,
    cobertura_pct: ativos.length ? r2(((ativos.length - problemas.size) / ativos.length) * 100) : null,
  };
}

export type ContratoCorretor = {
  id: string; corretor_id: string | null; corretor_nome?: string | null; valor_contrato: number; data_implantacao: string | null;
  slots: { pessoa: string | null; valor: number | null; percentual: number | null; pago: boolean }[];
};

const comissaoSlot = (s: ContratoCorretor['slots'][number], base: number) => {
  if (!s.pessoa) return 0;
  if (s.valor != null && Number(s.valor) > 0) return Number(s.valor);
  if (s.percentual != null) return r2((base * Number(s.percentual)) / 100);
  return 0;
};

/** Receitas devem vir já filtradas por contrato_id; produção por data de implantação. */
export function indicadoresPorCorretor(contratos: ContratoCorretor[], receitas: { contrato_id: string | null; valor: number; status: string; cancelado?: boolean }[]) {
  const recPorContrato = new Map<string, { gerada: number; recebida: number }>();
  for (const r of receitas) {
    if (!r.contrato_id || r.cancelado) continue;
    const c = recPorContrato.get(r.contrato_id) ?? { gerada: 0, recebida: 0 };
    c.gerada += Number(r.valor);
    if (r.status === 'Recebido') c.recebida += Number(r.valor);
    recPorContrato.set(r.contrato_id, c);
  }
  const mapa = new Map<string, any>();
  for (const c of contratos) {
    const k = c.corretor_id ?? 'sem';
    const a = mapa.get(k) ?? { corretor_id: c.corretor_id, nome: c.corretor_nome ?? 'Sem corretor', contratos: 0, producao: 0, receita: 0, recebida: 0, comissao: 0, comissao_paga: 0 };
    const rec = recPorContrato.get(c.id) ?? { gerada: 0, recebida: 0 };
    a.contratos += 1; a.producao += Number(c.valor_contrato); a.receita += rec.gerada; a.recebida += rec.recebida;
    for (const s of c.slots) {
      const v = comissaoSlot(s, Number(c.valor_contrato));
      a.comissao += v; if (s.pago) a.comissao_paga += v;
    }
    mapa.set(k, a);
  }
  return [...mapa.values()].map(a => {
    const margem = r2(a.receita - a.comissao);
    return {
      ...a, producao: r2(a.producao), receita: r2(a.receita), recebida: r2(a.recebida), comissao: r2(a.comissao), comissao_paga: r2(a.comissao_paga),
      comissao_pct: pct(a.comissao, a.receita), margem, margem_pct: pct(margem, a.receita),
      ticket_medio: a.contratos ? r2(a.producao / a.contratos) : 0,
      receita_media: a.contratos ? r2(a.receita / a.contratos) : 0,
    };
  }).sort((x, y) => y.margem - x.margem);
}
