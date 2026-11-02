import { describe, it, expect } from 'vitest';
import { calcularRentabilidade, semanasNoMes, valorRegra, type CustoRegra } from '@/lib/rentabilidadeCorretor';

const V = [{ id: 'v1', nome: 'Ana' }];
const contrato = { id: 'c1', corretor_id: 'v1', valor_contrato: 1000, data_implantacao: '2026-10-05', corretor_id_: null, corretor_valor: 800, corretor_pago: false };
const regra = (p: Partial<CustoRegra>): CustoRegra => ({ id: 'r', vendedor_id: 'v1', nome: 'DAS', tipo: 'fixo', valor: 86.05, frequencia: 'mensal', ativo: true, ...p });
const base = { contratos: [contrato], receitas: [], despesas: [], regras: [], vendedores: V, inicio: '2026-10-01', fim: '2026-10-31', modo: 'competencia' as const };

describe('rentabilidade por corretor', () => {
  it('semanal conta 4 ou 5 semanas', () => {
    expect(semanasNoMes('2026-11')).toBe(5); // nov/2026 tem 5 segundas
    expect(semanasNoMes('2026-10')).toBe(4);
    expect(valorRegra(regra({ valor: 50, frequencia: 'semanal' }), '2026-10', 0)).toBe(200);
  });
  it('percentual sobre a produção do mês', () => {
    const r = calcularRentabilidade({ ...base, regras: [regra({ tipo: 'percentual', valor: 20 })] });
    expect(r.linhas[0].custos).toBe(200);
  });
  it('pontual só no mês dele e inativa não conta', () => {
    const r = calcularRentabilidade({ ...base, regras: [regra({ tipo: 'pontual', valor: 300, mes_referencia: '2026-09-01' }), regra({ ativo: false })] });
    expect(r.linhas[0].custos).toBe(0);
  });
  it('despesa real substitui a regra', () => {
    const despesas = [{ id: 'd', vendedor_id: 'v1', descricao: 'DAS Ana', valor: 90, status: 'Pago', competencia: '2026-10-10', data_pagamento: '2026-10-10' }];
    const r = calcularRentabilidade({ ...base, despesas, regras: [regra({ termo_match: 'das' })] });
    expect(r.linhas[0].custos).toBe(90);
  });
  it('comissão da despesa não duplica com a do contrato', () => {
    const despesas = [{ id: 'd', contrato_id: 'c1', comissao_papel: 'corretor', valor: 800, status: 'A pagar', competencia: '2026-10-05' }];
    expect(calcularRentabilidade({ ...base, despesas }).linhas[0].comissoes).toBe(800);
    expect(calcularRentabilidade(base).linhas[0].comissoes).toBe(800);
  });
  it('competência e caixa não se misturam', () => {
    const receitas = [{ contrato_id: 'c1', valor: 500, status: 'Recebido', competencia: '2026-10-05', data_recebimento: '2026-11-02' }];
    expect(calcularRentabilidade({ ...base, receitas }).linhas[0].receita).toBe(500);
    expect(calcularRentabilidade({ ...base, receitas, modo: 'caixa' }).linhas[0].receita).toBe(0);
  });
});
