import { describe, it, expect } from 'vitest';
import { calcularPainel, periodoAnterior, qualidadeFinanceira, indicadoresPorCorretor, statusMeta, METAS_PADRAO, type LancamentoExec } from '@/lib/painelExecutivo';

const L = (o: Partial<LancamentoExec>): LancamentoExec => ({
  id: Math.random().toString(36), origem: 'despesa', valor: 0, status: 'Pago', cancelado: false,
  competencia: '2026-09-10', vencimento: '2026-09-10', data_efetiva: '2026-09-10', grupo: 'despesas_fixas',
  unidade_negocio: null, setor: null, ...o,
} as LancamentoExec);

const base = [
  L({ origem: 'receita', valor: 10000, status: 'Recebido', grupo: 'receita_operacional' }),
  L({ origem: 'receita', valor: 2000, status: 'Aguardando', data_efetiva: null, grupo: 'receita_operacional' }),
  L({ valor: 3000, grupo: 'custos_variaveis', categoria_nome: 'Comissão' }),
  L({ valor: 1000, grupo: 'despesas_comerciais' }),
  L({ valor: 2000, grupo: 'despesas_fixas' }),
  L({ valor: 2100, grupo: 'fora_dre' }),
  L({ valor: 999, grupo: 'despesas_fixas', cancelado: true }),
];

describe('painel executivo', () => {
  const p = calcularPainel(base, '2026-09-01', '2026-09-30', {}, METAS_PADRAO);
  it('DRE por competência e margens', () => {
    expect(p.receita.bruta).toBe(12000);
    expect(p.margem.contribuicao).toBe(9000);
    expect(p.margem.contribuicao_pct).toBe(75);
    expect(p.resultado.operacional).toBe(6000);
    expect(p.custos.comissoes).toBe(3000);
    expect(p.receita.recebida).toBe(10000);
    expect(p.receita.a_receber).toBe(2000);
  });
  it('comissão não é contada duas vezes e cancelado fica fora', () => {
    expect(p.custos.variaveis).toBe(3000);
    expect(p.custos.fixos).toBe(2000);
  });
  it('caixa usa data efetiva, inclui fora do DRE', () => {
    expect(p.geracaoCaixa.entradas).toBe(10000);
    expect(p.geracaoCaixa.saidas).toBe(8100);
  });
  it('break-even', () => {
    expect(p.breakEven.valor).toBe(4000);
    expect(p.breakEven.falta).toBe(0);
  });
  it('status das metas', () => {
    expect(statusMeta(42, 40, 'min')).toBe('saudavel');
    expect(statusMeta(37, 40, 'min')).toBe('atencao');
    expect(statusMeta(20, 15, 'max')).toBe('atencao');
    expect(statusMeta(25, 15, 'max')).toBe('critico');
  });
  it('período anterior', () => {
    expect(periodoAnterior('2026-03-01', '2026-03-31')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(periodoAnterior('2026-09-11', '2026-09-20')).toEqual({ inicio: '2026-09-01', fim: '2026-09-10' });
  });
  it('qualidade e séries duplicadas', () => {
    const q = qualidadeFinanceira([...base, L({ competencia: null, serie_id: 's1' }), L({ serie_id: 's1' }), L({ serie_id: 's1' })],
      [{ id: 'a', nome: 'Passagem 1', tipo: 'despesa', ativa: true }, { id: 'b', nome: 'passagem', tipo: 'despesa', ativa: true }]);
    expect(q.itens.sem_competencia.quantidade).toBe(1);
    expect(q.seriesDuplicadas).toHaveLength(1);
    expect(q.ocorrenciasRepetidas[0]).toMatchObject({ serie_id: 's1', quantidade: 2 });
  });
  it('indicadores por corretor', () => {
    const r = indicadoresPorCorretor([{ id: 'c1', corretor_id: 'v1', corretor_nome: 'Ana', valor_contrato: 1000, data_implantacao: '2026-09-01',
      slots: [{ pessoa: 'v1', valor: null, percentual: 50, pago: true }, { pessoa: null, valor: 100, percentual: null, pago: false }] }],
      [{ contrato_id: 'c1', valor: 800, status: 'Recebido' }, { contrato_id: 'c1', valor: 200, status: 'Aguardando', cancelado: true }]);
    expect(r[0]).toMatchObject({ receita: 800, comissao: 500, comissao_paga: 500, margem: 300 });
  });
});
