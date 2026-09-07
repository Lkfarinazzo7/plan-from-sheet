import React from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { DREWaterfall } from '../components/DREWaterfall';
import { fetchAllRows, lancamentosParaRelatorio, relatorioDRE, projetarCaixa } from '../lib/financialReporting';
import type { LancamentoDRE } from '../../supabase/functions/odisseia-mcp/dre';

afterEach(cleanup);
const row = (origem: 'receita' | 'despesa', valor: number, grupo: string | null, extra: Partial<LancamentoDRE> = {}): LancamentoDRE => ({
  origem, valor, grupo, status: origem === 'receita' ? 'Recebido' : 'Pago', competencia: '2026-08-10', ...extra,
});

describe('consumo de dados e paridade UI/motor', () => {
  it('percorre 1001 registros sem truncar e mantém ordem de leitura', async () => {
    const data = Array.from({ length: 1001 }, (_, id) => ({ id }));
    const ranges: number[][] = [];
    const rows = await fetchAllRows((from, to) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: data.slice(from, to + 1), error: null });
    });
    expect(rows).toHaveLength(1001);
    expect(rows[1000].id).toBe(1000);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('não mascara erro da segunda página como relatório parcial', async () => {
    await expect(fetchAllRows((from) => Promise.resolve(from === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
      : { data: null, error: new Error('falha de leitura') }))).rejects.toThrow('falha de leitura');
  });

  it('mapeia setor de receita e grupo da subcategoria sem inventar data ou grupo legado', () => {
    const [receita, despesa] = lancamentosParaRelatorio(
      [{ id: 'r', valor: 100, status: 'Recebido', data: '2026-08-01', categoria_id: 'cat', subcategoria_id: 'sub', setor_id: 's' }],
      [{ id: 'd', valor: 50, status: 'Pago', data: '2026-08-01', categoria_id: 'legado' }],
      [{ id: 'cat', grupo_dre: 'receita_operacional' }, { id: 'legado', tipo_dre: 'operacional' }],
      [{ id: 'sub', grupo_dre: 'resultado_financeiro' }], [{ id: 's', nome: 'Comercial' }],
    );
    expect(receita.grupo).toBe('resultado_financeiro');
    expect(receita.setor).toBe('Comercial');
    expect(receita.data_efetiva).toBeUndefined();
    expect(receita.competencia).toBeUndefined();
    expect(despesa.grupo).toBeNull();
  });

  it('cascata renderizada inclui todos os grupos e contribuição antes dos fixos', () => {
    const data = relatorioDRE([
      row('receita', 10000, 'receita_operacional'), row('receita', 1000, 'deducoes_receita'),
      row('despesa', 2000, 'custos_variaveis'), row('despesa', 3000, 'despesas_fixas'),
      row('despesa', 500, 'despesas_comerciais'), row('despesa', 200, 'depreciacao_amortizacao'),
      row('receita', 150, 'resultado_financeiro'), row('despesa', 100, 'resultado_financeiro'), row('despesa', 300, 'tributos_lucro'),
    ], '2026-08-01', '2026-08-31', 'competencia', {});
    expect(data.margemContribuicao).toBe(7000);
    expect(data.margemOperacional).toBe(3300);
    expect(data.resultadoLiquido).toBe(3050);
    render(<DREWaterfall dre={data} />);
    const table = screen.getByRole('table', { name: 'DRE por Competência' });
    const labels = within(table).getAllByRole('rowheader').map(x => x.textContent);
    expect(labels.indexOf('Margem de contribuição')).toBeLessThan(labels.indexOf('(−) Despesas fixas'));
    expect(labels).toContain('(−) Despesas comerciais');
    expect(labels).toContain('(−) Depreciação/amortização');
    expect(labels).toContain('(±) Resultado financeiro');
    expect(within(table).getByRole('row', { name: /Resultado líquido/ }).textContent).toMatch(/3\.050,00/);
    expect(within(table).getByRole('row', { name: /Resultado financeiro/ }).textContent).toMatch(/50,00/);
  });

  it('UI mostra ausência de data e classificação, não zero silencioso', () => {
    const data = relatorioDRE([
      row('receita', 20000, null), row('despesa', 50, 'despesas_fixas', { competencia: null, data_legada: '2026-08-01' }),
    ], '2026-08-01', '2026-08-31', 'competencia', {});
    render(<DREWaterfall dre={data} />);
    const aviso = screen.getByRole('status', { name: 'Qualidade dos dados do DRE' });
    expect(aviso.textContent).toMatch(/20\.000,00/);
    expect(aviso.textContent).toMatch(/sem a data exigida/);
    expect(aviso.textContent).toMatch(/Nenhuma data foi presumida/);
    expect(data.resultadoLiquido).toBe(0);
  });

  it('mudar o regime altera valores e título sem mudar dados', () => {
    const records = [row('receita', 1000, 'receita_operacional', { data_efetiva: '2026-09-01' })];
    const a = relatorioDRE(records, '2026-08-01', '2026-08-31', 'competencia', {});
    const b = relatorioDRE(records, '2026-08-01', '2026-08-31', 'realizado', {});
    const { rerender } = render(<DREWaterfall dre={a} />);
    expect(screen.getByRole('table', { name: 'DRE por Competência' })).toBeInTheDocument();
    rerender(<DREWaterfall dre={b} />);
    expect(screen.getByRole('table', { name: 'DRE por Caixa realizado' })).toBeInTheDocument();
    expect([a.resultadoLiquido, b.resultadoLiquido]).toEqual([1000, 0]);
    expect(records[0].data_efetiva).toBe('2026-09-01');
  });
});

describe('horizontes exatos da projeção de caixa', () => {
  const open = (vencimento: string, valor: number) => row('despesa', valor, 'despesas_fixas', { status: 'A pagar', vencimento });
  it('30 dias não inclui os dias 31 a 35 da última semana', () => {
    const p = projetarCaixa([open('2026-08-30', 100), open('2026-08-31', 999), open('2026-07-31', 50)], '2026-08-01', 30);
    expect(p.pontos.at(-1)?.ed).toBe('2026-08-30');
    expect(p.resumo.saidas_previstas).toBe(100);
    expect(p.pontos.reduce((sum, x) => sum + x.saidas, 0)).toBe(100);
    expect(p.resumo.vencidos_antes_periodo.saidas.valor).toBe(50);
    expect(p.pontos.at(-1)?.saldoAcumulado).toBe(-100);
  });
  it('60 dias não inclui dias 61 a 63 e transição de ano preserva datas', () => {
    const p = projetarCaixa([open('2026-12-30', 100), open('2026-12-31', 999)], '2026-11-01', 60);
    expect(p.pontos.at(-1)?.ed).toBe('2026-12-30');
    expect(p.resumo.saidas_previstas).toBe(100);
    expect(projetarCaixa([], '2026-12-31', 2).pontos[0].ed).toBe('2027-01-01');
  });
});
