import { cancelado, liquidado, dataValida } from '../../supabase/functions/odisseia-mcp/dre';

export type Modo = 'competencia' | 'caixa';
export type CustoRegra = {
  id: string; vendedor_id: string; nome: string; tipo: 'fixo' | 'percentual' | 'pontual';
  valor: number; frequencia: 'mensal' | 'semanal' | 'unica'; mes_referencia?: string | null;
  inicio?: string | null; fim?: string | null; ativo: boolean; categoria_id?: string | null; termo_match?: string | null;
};
export type ItemCusto = { vendedor_id: string; mes: string; nome: string; valor: number; origem: 'regra' | 'despesa'; substituida?: boolean };

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (n: number, d: number) => (d > 0 ? r2((n / d) * 100) : null);
const ym = (d: string) => d.slice(0, 7);
const ativo = (r: any, origem: 'receita' | 'despesa') => !cancelado({ ...r, origem });
const pago = (r: any, origem: 'receita' | 'despesa') => liquidado({ ...r, origem });
const naFaixa = (d: any, i: string, f: string) => dataValida(d) && d >= i && d <= f;

/** Lista YYYY-MM entre duas datas inclusive. */
export function mesesEntre(inicio: string, fim: string) {
  const out: string[] = [];
  let [y, m] = inicio.split('-').map(Number);
  const [y2, m2] = fim.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/** Semanas no mês = número de segundas-feiras (4 ou 5). */
export function semanasNoMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  const dias = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dias; d++) if (new Date(y, m - 1, d, 12).getDay() === 1) n++;
  return n;
}

function regraVale(r: CustoRegra, mes: string) {
  if (!r.ativo) return false;
  if (r.tipo === 'pontual') return !!r.mes_referencia && ym(r.mes_referencia) === mes;
  if (r.inicio && ym(r.inicio) > mes) return false;
  if (r.fim && ym(r.fim) < mes) return false;
  return true;
}

export function valorRegra(r: CustoRegra, mes: string, producaoMes: number) {
  if (r.tipo === 'percentual') return r2((producaoMes * Number(r.valor)) / 100);
  if (r.tipo === 'fixo' && r.frequencia === 'semanal') return r2(Number(r.valor) * semanasNoMes(mes));
  return r2(Number(r.valor));
}

const casa = (r: CustoRegra, d: any) =>
  (!!r.categoria_id && d.categoria_id === r.categoria_id) ||
  (!!r.termo_match?.trim() && String(d.descricao ?? '').toLowerCase().includes(r.termo_match.trim().toLowerCase()));

const slotsComissao = (c: any) => ([
  [c.corretor_id, c.corretor_valor, c.corretor_percentual, c.corretor_pago],
  [c.supervisor_a_id, c.supervisor_a_valor, c.supervisor_a_percentual, c.supervisor_a_pago],
  [c.supervisor_b_id, c.supervisor_b_valor, c.supervisor_b_percentual, c.supervisor_b_pago],
] as const).map(([p, v, pc, pg]) => ({
  valor: !p ? 0 : v != null && Number(v) > 0 ? Number(v) : pc != null ? r2((Number(c.valor_contrato) * Number(pc)) / 100) : 0,
  pago: !!pg,
}));

export function calcularRentabilidade(args: {
  contratos: any[]; receitas: any[]; despesas: any[]; regras: CustoRegra[];
  vendedores: { id: string; nome: string }[]; inicio: string; fim: string; modo: Modo;
}) {
  const { contratos, receitas, despesas, regras, vendedores, inicio, fim, modo } = args;
  const dono = new Map(contratos.map(c => [c.id, c.corretor_id as string | null]));
  const linhas = new Map<string, any>();
  const linha = (id: string) => {
    if (!linhas.has(id)) linhas.set(id, { vendedor_id: id, nome: vendedores.find(v => v.id === id)?.nome ?? 'Sem corretor', producao: 0, contratos: 0, receita: 0, comissoes: 0, custos: 0 });
    return linhas.get(id);
  };
  for (const v of vendedores as any[]) if (v.ativo !== false) linha(v.id);
  const itens: ItemCusto[] = [];
  const prodMes = new Map<string, number>();

  // Produção: sempre pela data de implantação (é fato de competência).
  for (const c of contratos) {
    if (!c.corretor_id || !naFaixa(c.data_implantacao, inicio, fim)) continue;
    const l = linha(c.corretor_id); l.producao += Number(c.valor_contrato); l.contratos += 1;
    const k = `${c.corretor_id}|${ym(c.data_implantacao)}`; prodMes.set(k, (prodMes.get(k) ?? 0) + Number(c.valor_contrato));
  }
  // Receita
  for (const r of receitas) {
    const v = r.contrato_id ? dono.get(r.contrato_id) : null;
    if (!v || !ativo(r, 'receita')) continue;
    const ok = modo === 'competencia' ? naFaixa(r.competencia, inicio, fim) : pago(r, 'receita') && naFaixa(r.data_recebimento, inicio, fim);
    if (ok) linha(v).receita += Number(r.valor);
  }
  // Comissões: despesas vinculadas ao contrato; fallback no contrato só se não houver despesa.
  const comDespesa = new Set(despesas.filter(d => d.contrato_id && d.comissao_papel).map(d => d.contrato_id));
  const dataDesp = (d: any) => (modo === 'competencia' ? d.competencia : d.data_pagamento);
  const despOk = (d: any) => ativo(d, 'despesa') && (modo === 'competencia' || pago(d, 'despesa')) && naFaixa(dataDesp(d), inicio, fim);
  for (const d of despesas) {
    if (!d.contrato_id || !d.comissao_papel) continue;
    const v = dono.get(d.contrato_id);
    if (v && despOk(d)) linha(v).comissoes += Number(d.valor);
  }
  for (const c of contratos) {
    if (!c.corretor_id || comDespesa.has(c.id) || !naFaixa(c.data_implantacao, inicio, fim)) continue;
    for (const s of slotsComissao(c)) if (modo === 'competencia' || s.pago) linha(c.corretor_id).comissoes += s.valor;
  }
  // Despesas ligadas ao corretor (não comissão de contrato)
  const despCorretor = despesas.filter(d => d.vendedor_id && !(d.contrato_id && d.comissao_papel) && despOk(d));
  for (const d of despCorretor) {
    linha(d.vendedor_id).custos += Number(d.valor);
    itens.push({ vendedor_id: d.vendedor_id, mes: ym(dataDesp(d)), nome: d.descricao, valor: r2(Number(d.valor)), origem: 'despesa' });
  }
  // Regras: estimativas, só em competência; despesa real do mês substitui a regra.
  if (modo === 'competencia') {
    for (const mes of mesesEntre(inicio, fim)) for (const r of regras) {
      if (!regraVale(r, mes)) continue;
      const valor = valorRegra(r, mes, prodMes.get(`${r.vendedor_id}|${mes}`) ?? 0);
      const substituida = despCorretor.some(d => d.vendedor_id === r.vendedor_id && ym(dataDesp(d)) === mes && casa(r, d));
      itens.push({ vendedor_id: r.vendedor_id, mes, nome: r.nome, valor, origem: 'regra', substituida });
      if (!substituida && valor) linha(r.vendedor_id).custos += valor;
    }
  }
  const resultado = [...linhas.values()].map(l => {
    const margem = r2(l.receita - l.comissoes), res = r2(margem - l.custos);
    return {
      ...l, producao: r2(l.producao), receita: r2(l.receita), comissoes: r2(l.comissoes), custos: r2(l.custos),
      ticket: l.contratos ? r2(l.producao / l.contratos) : 0, comissao_pct: pct(l.comissoes, l.receita),
      margem, resultado: res, margem_gerencial_pct: pct(res, l.receita),
    };
  }).sort((a, b) => b.resultado - a.resultado);
  return { linhas: resultado, itens };
}
