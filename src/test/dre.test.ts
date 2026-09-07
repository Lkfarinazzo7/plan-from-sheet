/** Testes puros do DRE: competência x caixa realizado x projetado, com pendências explícitas. */
import { describe, expect, it } from 'vitest';
import { calcularDRE, type LancamentoDRE } from '../../supabase/functions/odisseia-mcp/dre';

const base = { inicio: '2026-08-01', fim: '2026-08-31' };

const rec = (o: Partial<LancamentoDRE>): LancamentoDRE => ({
  origem: 'receita',
  valor: 1000,
  status: 'Aguardando',
  grupo: 'receita_operacional',
  ...o,
});
const desp = (o: Partial<LancamentoDRE>): LancamentoDRE => ({
  origem: 'despesa',
  valor: 100,
  status: 'A pagar',
  grupo: 'despesas_fixas',
  ...o,
});

describe('regimes', () => {
  const dados: LancamentoDRE[] = [
    rec({ id: 'r1', valor: 5000, status: 'Recebido', competencia: '2026-08-05', data_efetiva: '2026-08-20' }),
    rec({ id: 'r2', valor: 2000, status: 'Aguardando', competencia: '2026-08-10', vencimento: '2026-08-25' }),
    desp({ id: 'd1', valor: 900, status: 'Pago', competencia: '2026-08-01', data_efetiva: '2026-08-03' }),
    desp({ id: 'd2', valor: 300, status: 'A pagar', competencia: '2026-08-15', vencimento: '2026-08-28' }),
  ];

  it('competência reconhece independente de pagamento', () => {
    const r = calcularDRE(dados, { ...base, regime: 'competencia' });
    expect(r.receita_bruta).toBe(7000);
    expect(r.despesas_fixas).toBe(1200);
    expect(r.resultado_liquido).toBe(5800);
    expect(r.pendencias.sem_data_do_regime.quantidade).toBe(0);
    expect(r.pendencias.cobertura_percentual).toBe(100);
  });

  it('realizado usa somente liquidados na data efetiva', () => {
    const r = calcularDRE(dados, { ...base, regime: 'realizado' });
    expect(r.receita_bruta).toBe(5000);
    expect(r.despesas_fixas).toBe(900);
    expect(r.resultado_liquido).toBe(4100);
  });

  it('projetado usa somente vencimentos em aberto', () => {
    const r = calcularDRE(dados, { ...base, regime: 'projetado' });
    expect(r.receita_bruta).toBe(2000);
    expect(r.despesas_fixas).toBe(300);
  });

  it('competência e caixa divergem quando a data efetiva cai em outro mês', () => {
    const fora = [rec({ id: 'x', valor: 1000, status: 'Recebido', competencia: '2026-08-01', data_efetiva: '2026-09-02' })];
    expect(calcularDRE(fora, { ...base, regime: 'competencia' }).receita_bruta).toBe(1000);
    expect(calcularDRE(fora, { ...base, regime: 'realizado' }).receita_bruta).toBe(0);
  });
});

describe('pendências e ausências', () => {
  it('lançamento sem competência não entra no total e vira pendência', () => {
    const r = calcularDRE([rec({ valor: 800, competencia: null })], { ...base, regime: 'competencia' });
    expect(r.receita_bruta).toBe(0);
    expect(r.pendencias.sem_data_do_regime).toEqual({ quantidade: 1, valor: 800 });
    expect(r.pendencias.cobertura_percentual).toBe(0);
    expect(r.pendencias.avisos.join(' ')).toMatch(/sem a data exigida/i);
  });

  it('pago sem data de pagamento vira pendência no realizado', () => {
    const r = calcularDRE([desp({ valor: 500, status: 'Pago', data_efetiva: null })], { ...base, regime: 'realizado' });
    expect(r.despesas_fixas).toBe(0);
    expect(r.pendencias.sem_data_do_regime.valor).toBe(500);
  });

  it('despesa sem grupo de DRE fica em nao_classificado, fora da cascata', () => {
    const r = calcularDRE([desp({ valor: 400, grupo: null, competencia: '2026-08-04' })], { ...base, regime: 'competencia' });
    expect(r.nao_classificado).toEqual({ quantidade: 1, valor: 400 });
    expect(r.resultado_liquido).toBe(0);
    expect(r.pendencias.sem_grupo_dre.valor).toBe(400);
  });

  it('cancelados são ignorados e contabilizados à parte', () => {
    const r = calcularDRE([desp({ valor: 200, cancelado: true, competencia: '2026-08-04' })], { ...base, regime: 'competencia' });
    expect(r.despesas_fixas).toBe(0);
    expect(r.pendencias.cancelados_ignorados).toEqual({ quantidade: 1, valor: 200 });
  });
});

describe('cascata e classificação', () => {
  const dados: LancamentoDRE[] = [
    rec({ valor: 10000, grupo: 'receita_operacional', competencia: '2026-08-01' }),
    rec({ valor: 1000, grupo: 'deducoes_receita', competencia: '2026-08-01' }),
    desp({ valor: 2000, grupo: 'custos_variaveis', competencia: '2026-08-02' }),
    desp({ valor: 1500, grupo: 'despesas_fixas', competencia: '2026-08-02' }),
    desp({ valor: 500, grupo: 'despesas_comerciais', competencia: '2026-08-02' }),
    desp({ valor: 300, grupo: 'depreciacao_amortizacao', competencia: '2026-08-02' }),
    desp({ valor: 200, grupo: 'resultado_financeiro', competencia: '2026-08-02' }),
    desp({ valor: 400, grupo: 'tributos_lucro', competencia: '2026-08-02' }),
    desp({ valor: 20000, grupo: 'fora_dre', competencia: '2026-08-02' }),
  ];

  it('margem de contribuição vem ANTES das despesas fixas e comerciais', () => {
    const r = calcularDRE(dados, { ...base, regime: 'competencia' });
    expect(r.receita_liquida).toBe(9000);
    expect(r.margem_contribuicao).toBe(7000);
    expect(r.resultado_antes_depreciacao).toBe(5000);
    expect(r.resultado_operacional).toBe(4700);
    expect(r.resultado_antes_tributos).toBe(4500);
    expect(r.resultado_liquido).toBe(4100);
  });

  it('fora_dre não afeta o resultado', () => {
    const r = calcularDRE(dados, { ...base, regime: 'competencia' });
    expect(r.fora_dre.valor).toBe(20000);
    expect(r.resultado_liquido).toBe(4100);
    expect(r.pendencias.avisos.join(' ')).toMatch(/fora_dre/);
  });

  it('margens percentuais sobre a receita líquida', () => {
    const r = calcularDRE(dados, { ...base, regime: 'competencia' });
    expect(r.margens.contribuicao).toBe(77.78);
    expect(r.margens.liquida).toBe(45.56);
  });

  it('sem receita líquida, as margens são null e não zero', () => {
    const r = calcularDRE([desp({ valor: 100, competencia: '2026-08-02' })], { ...base, regime: 'competencia' });
    expect(r.margens.liquida).toBeNull();
  });
});

describe('filtros de unidade e setor nos dois lados', () => {
  const dados: LancamentoDRE[] = [
    rec({ valor: 1000, competencia: '2026-08-01', unidade_negocio: 'Odisseia' }),
    rec({ valor: 500, competencia: '2026-08-01', unidade_negocio: 'Outra' }),
    desp({ valor: 100, competencia: '2026-08-01', unidade_negocio: 'Odisseia', setor: 'Pré-vendas' }),
    desp({ valor: 70, competencia: '2026-08-01', unidade_negocio: 'Outra', setor: 'Pré-vendas' }),
  ];

  it('filtra unidade em receitas e despesas', () => {
    const r = calcularDRE(dados, { ...base, regime: 'competencia', filtros: { unidade: 'Odisseia' } });
    expect(r.receita_bruta).toBe(1000);
    expect(r.despesas_fixas).toBe(100);
  });

  it('filtro de setor avisa que receitas não possuem setor', () => {
    const r = calcularDRE(dados, { ...base, regime: 'competencia', filtros: { setor: 'Pré-vendas' } });
    expect(r.receita_bruta).toBe(0);
    expect(r.despesas_fixas).toBe(170);
    expect(r.pendencias.avisos.join(' ')).toMatch(/setor/i);
  });
});
