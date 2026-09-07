// Métricas canônicas de contratos (lógica pura, sem Supabase/Deno).
// Usada pelas tools listar_contratos, obter_contrato, listar_receitas_por_contrato
// e relatorio_contratos. Vínculo receita↔contrato SEMPRE por receitas.contrato_id.

import { formatBRL, formatDateBR } from './logic.ts';

export const PRODUCAO_FONTE = 'contratos.valor_contrato';

export type ContratoRow = {
  id: string;
  nome: string;
  unidade_negocio?: string | null;
  data_implantacao?: string | null;
  valor_contrato?: number | null;
  observacoes?: string | null;
  operadora_nome?: string | null;
  corretor_nome?: string | null;
  supervisor_a_nome?: string | null;
  supervisor_b_nome?: string | null;
  supervisor_a_id?: string | null;
  supervisor_a_percentual?: number | null;
  supervisor_a_valor?: number | null;
  supervisor_a_pago?: boolean | null;
  supervisor_b_id?: string | null;
  supervisor_b_percentual?: number | null;
  supervisor_b_valor?: number | null;
  supervisor_b_pago?: boolean | null;
  corretor_id?: string | null;
  corretor_percentual?: number | null;
  corretor_valor?: number | null;
  corretor_pago?: boolean | null;
};

export type ReceitaRow = {
  id: string;
  contrato_id: string | null;
  data: string | null;
  descricao: string | null;
  valor: number | null;
  status: string | null;
  operadora_nome?: string | null;
};

export type StatusFinanceiro = 'sem_lancamentos' | 'aguardando' | 'parcial' | 'recebido';
export const STATUS_FINANCEIRO: StatusFinanceiro[] = ['sem_lancamentos', 'aguardando', 'parcial', 'recebido'];

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Par número cru + string BRL, achatado com sufixo _formatado. */
export function moneyPair(prefix: string, value: number): Record<string, unknown> {
  const n = num(value);
  return { [prefix]: n, [`${prefix}_formatado`]: formatBRL(n) };
}

export function round2(n: number): number {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

/** Comissão de um slot: 0 sem pessoa; valor salvo se > 0; senão base*percentual/100; senão 0. */
export function comissaoSlot(
  base: number,
  pessoaId: string | null | undefined,
  percentual: number | null | undefined,
  valorSalvo: number | null | undefined,
): number {
  if (!pessoaId) return 0;
  const salvo = num(valorSalvo);
  if (salvo > 0) return round2(salvo);
  const pct = num(percentual);
  if (pct > 0) return round2((num(base) * pct) / 100);
  return 0;
}

export type ComissaoSlotOut = {
  papel: string;
  pessoa: string | null;
  percentual: number | null;
  pago: boolean;
  valor: number;
  valor_formatado: string;
};

export type ComissoesContrato = {
  slots: ComissaoSlotOut[];
  previstas_total: number;
  pagas_corretor: number;
  pagas_supervisores: number;
  pagas_total: number;
  pendentes: number;
};

export function comissoesContrato(c: ContratoRow): ComissoesContrato {
  const base = num(c.valor_contrato);
  const defs = [
    { papel: 'Supervisor A', grupo: 'supervisor', pessoaId: c.supervisor_a_id, pessoa: c.supervisor_a_nome ?? null, percentual: c.supervisor_a_percentual ?? null, valorSalvo: c.supervisor_a_valor, pago: !!c.supervisor_a_pago },
    { papel: 'Supervisor B', grupo: 'supervisor', pessoaId: c.supervisor_b_id, pessoa: c.supervisor_b_nome ?? null, percentual: c.supervisor_b_percentual ?? null, valorSalvo: c.supervisor_b_valor, pago: !!c.supervisor_b_pago },
    { papel: 'Corretor', grupo: 'corretor', pessoaId: c.corretor_id, pessoa: c.corretor_nome ?? null, percentual: c.corretor_percentual ?? null, valorSalvo: c.corretor_valor, pago: !!c.corretor_pago },
  ];
  const slots: ComissaoSlotOut[] = [];
  let previstas = 0, pagasCorretor = 0, pagasSup = 0;
  for (const d of defs) {
    const valor = comissaoSlot(base, d.pessoaId, d.percentual, d.valorSalvo);
    previstas += valor;
    if (d.pago) {
      if (d.grupo === 'corretor') pagasCorretor += valor;
      else pagasSup += valor;
    }
    slots.push({
      papel: d.papel,
      pessoa: d.pessoa,
      percentual: d.percentual === null || d.percentual === undefined ? null : num(d.percentual),
      pago: d.pago,
      valor,
      valor_formatado: formatBRL(valor),
    });
  }
  const pagasTotal = round2(pagasCorretor + pagasSup);
  return {
    slots,
    previstas_total: round2(previstas),
    pagas_corretor: round2(pagasCorretor),
    pagas_supervisores: round2(pagasSup),
    pagas_total: pagasTotal,
    pendentes: round2(round2(previstas) - pagasTotal),
  };
}

export type ResumoReceitas = { prevista: number; recebida: number; pendente: number; quantidade: number };

export function resumirReceitas(receitas: ReceitaRow[]): ResumoReceitas {
  let prevista = 0, recebida = 0, pendente = 0;
  for (const r of receitas) {
    const v = num(r.valor);
    prevista += v;
    if (r.status === 'Recebido') recebida += v;
    else if (r.status === 'Aguardando') pendente += v;
  }
  return { prevista: round2(prevista), recebida: round2(recebida), pendente: round2(pendente), quantidade: receitas.length };
}

export function statusFinanceiro(resumo: ResumoReceitas): StatusFinanceiro {
  if (resumo.quantidade === 0) return 'sem_lancamentos';
  if (resumo.recebida <= 0) return 'aguardando';
  if (resumo.recebida < resumo.prevista) return 'parcial';
  return 'recebido';
}

export function percentualRecebido(resumo: ResumoReceitas): number | null {
  if (resumo.prevista === 0) return null;
  return round2((resumo.recebida / resumo.prevista) * 100);
}

export type ContratoMetrica = {
  contrato_id: string;
  producao: number;
  receita_prevista: number;
  receita_recebida: number;
  receita_pendente: number;
  comissoes_pagas_total: number;
  comissoes_previstas_total: number;
  margem_bruta_corretora: number;
  margem_bruta_prevista: number;
  status_financeiro: StatusFinanceiro;
  saida: Record<string, unknown>;
};

/** Monta o objeto completo (cadastro + métricas) de um contrato. */
export function montarContrato(c: ContratoRow, receitas: ReceitaRow[]): ContratoMetrica {
  const resumo = resumirReceitas(receitas);
  const com = comissoesContrato(c);
  const producao = round2(num(c.valor_contrato));
  const margemRealizada = round2(resumo.recebida - com.pagas_total);
  const margemPrevista = round2(resumo.prevista - com.previstas_total);
  const status = statusFinanceiro(resumo);
  const saida = {
    id: c.id,
    nome: c.nome,
    operadora: c.operadora_nome ?? null,
    unidade_negocio: c.unidade_negocio ?? null,
    data_implantacao: c.data_implantacao ?? null,
    data_implantacao_formatada: formatDateBR(c.data_implantacao),
    observacoes: c.observacoes ?? null,
    corretor: c.corretor_nome ?? null,
    supervisor_a: c.supervisor_a_nome ?? null,
    supervisor_b: c.supervisor_b_nome ?? null,
    ...moneyPair('producao', producao),
    producao_fonte: PRODUCAO_FONTE,
    financeiro: {
      ...moneyPair('receita_prevista', resumo.prevista),
      ...moneyPair('receita_recebida', resumo.recebida),
      ...moneyPair('receita_pendente', resumo.pendente),
      quantidade_receitas: resumo.quantidade,
      percentual_recebido: percentualRecebido(resumo),
      status_financeiro: status,
      status,
      status_observacao: 'Status financeiro DERIVADO dos lançamentos ligados (não é um campo cadastral do contrato).',
    },
    comissoes: {
      slots: com.slots,
      ...moneyPair('comissoes_pagas_corretor', com.pagas_corretor),
      ...moneyPair('comissoes_pagas_supervisores', com.pagas_supervisores),
      ...moneyPair('comissoes_pagas_total', com.pagas_total),
      ...moneyPair('comissoes_previstas_total', com.previstas_total),
      ...moneyPair('comissoes_pendentes', com.pendentes),
    },
    margens: {
      ...moneyPair('margem_bruta_corretora', margemRealizada),
      ...moneyPair('margem_bruta_prevista', margemPrevista),
    },
  };
  return {
    contrato_id: c.id,
    producao,
    receita_prevista: resumo.prevista,
    receita_recebida: resumo.recebida,
    receita_pendente: resumo.pendente,
    comissoes_pagas_total: com.pagas_total,
    comissoes_previstas_total: com.previstas_total,
    margem_bruta_corretora: margemRealizada,
    margem_bruta_prevista: margemPrevista,
    status_financeiro: status,
    saida,
  };
}

/** Item de receita ligada a um contrato (parcela não existe no sistema). */
export function receitaItem(r: ReceitaRow) {
  return {
    contrato_id: r.contrato_id,
    receita_id: r.id,
    descricao: r.descricao ?? null,
    data: r.data ?? null,
    data_formatada: formatDateBR(r.data),
    ...moneyPair('valor', num(r.valor)),
    status: r.status ?? null,
    operadora: r.operadora_nome ?? null,
    parcela: null,
  };
}

/** Ordena receitas por data DESC (nulos por último) e depois id. */
export function ordenarReceitas<T extends { data?: string | null; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.data ?? '', dbb = b.data ?? '';
    if (da !== dbb) {
      if (!da) return 1;
      if (!dbb) return -1;
      return da < dbb ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Ordena contratos por data de implantação DESC NULLS LAST, depois id. */
export function ordenarContratos<T extends { data_implantacao?: string | null; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.data_implantacao ?? '', dbb = b.data_implantacao ?? '';
    if (da !== dbb) {
      if (!da) return 1;
      if (!dbb) return -1;
      return da < dbb ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const s = [...valores].map(num).sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2);
}

export function media(valores: number[]): number {
  if (!valores.length) return 0;
  return round2(valores.reduce((a, x) => a + num(x), 0) / valores.length);
}

export const FAIXAS_PADRAO = [0, 1000, 3000, 5000, 10000, 20000];

export type FaixaOut = {
  min: number;
  max: number | null;
  rotulo: string;
  quantidade: number;
  percentual_contratos: number | null;
  producao: number;
  producao_formatado: string;
  receita_recebida: number;
  receita_recebida_formatado: string;
  percentual_receita: number | null;
  margem_bruta_corretora: number;
  margem_bruta_corretora_formatado: string;
};

/** Faixas meia-abertas [atual, próxima); a última vai até o infinito. */
export function calcularFaixas(metricas: ContratoMetrica[], faixas: number[]): FaixaOut[] {
  const totalContratos = metricas.length;
  const totalReceita = round2(metricas.reduce((a, m) => a + m.receita_recebida, 0));
  return faixas.map((min, i) => {
    const max = i + 1 < faixas.length ? faixas[i + 1] : null;
    const dentro = metricas.filter((m) => m.producao >= min && (max === null || m.producao < max));
    const producao = round2(dentro.reduce((a, m) => a + m.producao, 0));
    const recebida = round2(dentro.reduce((a, m) => a + m.receita_recebida, 0));
    const margem = round2(dentro.reduce((a, m) => a + m.margem_bruta_corretora, 0));
    return {
      min,
      max,
      rotulo: max === null ? `>= ${min}` : `[${min}, ${max})`,
      quantidade: dentro.length,
      percentual_contratos: totalContratos > 0 ? round2((dentro.length / totalContratos) * 100) : null,
      ...moneyPair('producao', producao),
      ...moneyPair('receita_recebida', recebida),
      percentual_receita: totalReceita > 0 ? round2((recebida / totalReceita) * 100) : null,
      ...moneyPair('margem_bruta_corretora', margem),
    } as FaixaOut;
  });
}

export type BasePareto = 'receita_recebida' | 'receita_prevista' | 'producao';

export function valorBase(m: ContratoMetrica, base: BasePareto): number {
  if (base === 'receita_prevista') return m.receita_prevista;
  if (base === 'producao') return m.producao;
  return m.receita_recebida;
}

export type ParetoOut = {
  base: BasePareto;
  total: number;
  total_formatado: string;
  itens: Array<{
    contrato_id: string;
    nome: string;
    valor: number;
    valor_formatado: string;
    participacao: number | null;
    acumulado: number | null;
  }>;
  pareto_80: { quantidade: number; percentual_contratos: number; acumulado: number } | null;
};

export function calcularPareto(metricas: ContratoMetrica[], base: BasePareto): ParetoOut {
  const ordenados = [...metricas].sort((a, b) => {
    const va = valorBase(a, base), vb = valorBase(b, base);
    if (va !== vb) return vb - va;
    return a.contrato_id < b.contrato_id ? -1 : a.contrato_id > b.contrato_id ? 1 : 0;
  });
  const total = round2(ordenados.reduce((a, m) => a + valorBase(m, base), 0));
  let acumulado = 0;
  let pareto80: ParetoOut['pareto_80'] = null;
  const itens = ordenados.map((m, i) => {
    const valor = valorBase(m, base);
    acumulado += valor;
    const participacao = total > 0 ? round2((valor / total) * 100) : null;
    const acumuladoPct = total > 0 ? round2((acumulado / total) * 100) : null;
    if (total > 0 && pareto80 === null && (acumuladoPct as number) >= 80) {
      pareto80 = {
        quantidade: i + 1,
        percentual_contratos: round2(((i + 1) / ordenados.length) * 100),
        acumulado: acumuladoPct as number,
      };
    }
    return {
      contrato_id: m.contrato_id,
      nome: String((m.saida as any).nome ?? ''),
      valor,
      valor_formatado: formatBRL(valor),
      participacao,
      acumulado: acumuladoPct,
    };
  });
  return { base, total, total_formatado: formatBRL(total), itens, pareto_80: total > 0 ? pareto80 : null };
}

export const AVISOS_QUALIDADE = [
  'O status financeiro é derivado dos lançamentos ligados por contrato_id — não existe status cadastral no contrato.',
  'Produção = contratos.valor_contrato (não há campo de produção separado).',
  'Parcela de receita não existe no sistema: o campo "parcela" é sempre null.',
  'Receita prevista é a soma dos lançamentos já cadastrados e ligados ao contrato, não uma projeção contratual.',
];
