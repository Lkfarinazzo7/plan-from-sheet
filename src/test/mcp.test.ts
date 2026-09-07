import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  assertNoIdentityArgs,
  buildDiff,
  canConfirm,
  clampLimit,
  clampOffset,
  expiresAtFrom,
  formatBRL,
  formatDateBR,
  isExpired,
  resolveRange,
  sanitize,
} from '../../supabase/functions/odisseia-mcp/logic';
import { calcularDRE, type LancamentoDRE } from '../../supabase/functions/odisseia-mcp/dre';
import { safeReturnPath } from '@/lib/safeReturn';

describe('DRE canônico', () => {
  const period = { regime: 'competencia' as const, inicio: '2026-08-01', fim: '2026-08-31' };
  const despesa = (valor: number, grupo: string | null): LancamentoDRE => ({ origem: 'despesa', valor, grupo, status: 'A pagar', competencia: '2026-08-01' });
  it('contribuição antecede fixas e grupos ausentes não são presumidos', () => {
    const dre = calcularDRE([
      { origem: 'receita', valor: 2000, grupo: 'receita_operacional', status: 'Aguardando', competencia: '2026-08-01' },
      despesa(200, 'custos_variaveis'), despesa(300, 'despesas_fixas'), despesa(100, 'tributos_lucro'), despesa(100, null),
    ], period);
    expect(dre.receita_bruta).toBe(2000);
    expect(dre.custos_variaveis).toBe(200);
    expect(dre.despesas_fixas).toBe(300);
    expect(dre.tributos_lucro).toBe(100);
    expect(dre.margem_contribuicao).toBe(1800);
    expect(dre.resultado_operacional).toBe(1500);
    expect(dre.resultado_liquido).toBe(1400);
    expect(dre.margens.liquida).toBe(70);
    expect(dre.pendencias.sem_grupo_dre).toEqual({ quantidade: 1, valor: 100 });
  });

  it('não divide por zero sem receita', () => {
    const dre = calcularDRE([despesa(500, 'custos_variaveis')], period);
    expect(dre.resultado_liquido).toBe(-500);
    expect(dre.margens.liquida).toBeNull();
  });
});

describe('limites e paginação', () => {
  it('usa padrão 50 e teto 200', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(9999)).toBe(MAX_LIMIT);
    expect(clampLimit(0)).toBe(1);
    expect(clampOffset(-5)).toBe(0);
    expect(clampOffset(30)).toBe(30);
  });
});

describe('período e formatação', () => {
  it('resolve mês/ano sem conversão UTC', () => {
    expect(resolveRange({ mes: 2, ano: 2024 })).toEqual({ sd: '2024-02-01', ed: '2024-02-29' });
    expect(resolveRange({ data_inicio: '2026-01-01', data_fim: '2026-03-31' })).toEqual({ sd: '2026-01-01', ed: '2026-03-31' });
    expect(resolveRange({})).toBeNull();
    expect(() => resolveRange({ mes: 13, ano: 2026 })).toThrow();
  });

  it('formata datas em pt-BR e valores em BRL', () => {
    expect(formatDateBR('2026-08-15')).toBe('15/08/2026');
    expect(formatDateBR(null)).toBeNull();
    expect(formatBRL(1234.5).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,50');
  });
});

describe('expiração e idempotência das operações', () => {
  const base = { id: 'op-1', status: 'pending', expires_at: new Date(Date.now() + 60_000).toISOString() };

  it('gera expiração de 10 minutos', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(expiresAtFrom(now)).toBe('2026-01-01T00:10:00.000Z');
  });

  it('aceita operação pendente válida', () => {
    expect(canConfirm(base as any)).toEqual({ ok: true });
  });

  it('rejeita operação expirada', () => {
    const op = { ...base, expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(isExpired(op.expires_at)).toBe(true);
    expect(canConfirm(op as any).ok).toBe(false);
  });

  it('rejeita replay de operação já executada', () => {
    const r = canConfirm({ ...base, status: 'executed' } as any);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/já foi executada/);
  });

  it('rejeita canceladas, falhas e inexistentes', () => {
    expect(canConfirm({ ...base, status: 'cancelled' } as any).ok).toBe(false);
    expect(canConfirm({ ...base, status: 'failed' } as any).ok).toBe(false);
    expect(canConfirm(null).ok).toBe(false);
  });
});

describe('proteção de identidade', () => {
  it('rejeita user_id e tokens vindos do cliente', () => {
    expect(() => assertNoIdentityArgs({ user_id: 'x' })).toThrow(/não permitido/);
    expect(() => assertNoIdentityArgs({ access_token: 'x' })).toThrow();
    expect(() => assertNoIdentityArgs({ USER_ID: 'x' })).toThrow();
    expect(() => assertNoIdentityArgs({ descricao: 'ok', valor: 10 })).not.toThrow();
  });

  it('remove campos sensíveis das respostas', () => {
    const limpo = sanitize({ id: '1', user_id: 'u', valor: 10, nested: { user_id: 'u', nome: 'x' } });
    expect(limpo).toEqual({ id: '1', valor: 10, nested: { nome: 'x' } });
  });
});

describe('diff antes/depois', () => {
  it('lista apenas campos alterados', () => {
    const diff = buildDiff({ status: 'Aguardando', valor: 10 }, { status: 'Recebido', valor: 10 });
    expect(diff).toEqual([{ campo: 'status', antes: 'Aguardando', depois: 'Recebido' }]);
  });
});

describe('retorno pós-login', () => {
  it('bloqueia open redirect', () => {
    expect(safeReturnPath('/oauth/consent?authorization_id=1')).toBe('/oauth/consent?authorization_id=1');
    expect(safeReturnPath('https://evil.com')).toBe('/');
    expect(safeReturnPath('//evil.com')).toBe('/');
    expect(safeReturnPath(null)).toBe('/');
  });
});
