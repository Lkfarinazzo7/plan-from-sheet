/**
 * Regressões de segurança/integridade do MCP: plano persistido no servidor,
 * campos fora da allowlist, auditoria por registro e cancelados fora dos totais.
 * Tudo em memória — nunca toca produção.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../../supabase/functions/odisseia-mcp/server';
import { TOOL } from '../../supabase/functions/odisseia-mcp/tools';
import { FakeDb } from './fakeSupabase';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OUTRO_USER = '99999999-9999-4999-8999-999999999999';
const CAT = '44444444-4444-4444-8444-444444444444';
const D1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const R_OK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const R_CANC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

function seed() {
  return new FakeDb(
    {
      operadoras: [{ id: '22222222-2222-4222-8222-222222222222', nome: 'Amil', ativa: true }],
      vendedores: [{ id: '33333333-3333-4333-8333-333333333333', nome: 'Rhayssa', ativo: true }],
      categorias_despesa: [{ id: CAT, nome: 'Escritório', tipo_dre: 'operacional', grupo_dre: 'despesas_fixas', ativo: true }],
      receitas: [
        {
          id: R_OK,
          user_id: USER_ID,
          data: '2026-08-01',
          descricao: 'Receita válida',
          valor: 1000,
          status: 'Recebido',
          cancelado: false,
          versao: 1,
          unidade_negocio: 'Odisseia',
        },
        {
          id: R_CANC,
          user_id: USER_ID,
          data: '2026-08-02',
          descricao: 'Receita cancelada',
          valor: 5000,
          status: 'Aguardando',
          cancelado: true,
          versao: 1,
          unidade_negocio: 'Odisseia',
        },
      ],
      despesas: [
        {
          id: D1,
          user_id: USER_ID,
          data: '2026-08-10',
          descricao: 'Aluguel',
          valor: 400,
          tipo: 'Variável',
          status: 'A pagar',
          categoria_id: CAT,
          cancelado: false,
          versao: 1,
          unidade_negocio: 'Odisseia',
        },
      ],
      mcp_operacoes: [],
      mcp_auditoria_registros: [],
    },
    USER_ID,
  );
}

async function connect(db: FakeDb) {
  const server = buildServer({ supabase: db.client(), userId: USER_ID, email: null });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

const payload = (r: any) => JSON.parse(r.content[0].text);
const call = (client: Client, name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args }) as Promise<any>;

let db: FakeDb;
let client: Client;

beforeEach(async () => {
  db = seed();
  client = await connect(db);
});

describe('plano de execução vive no servidor', () => {
  it('confirmar_operacao ignora qualquer plano vindo do cliente', async () => {
    const prep = payload(
      await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, valor: 500 }),
    );
    const r: any = await call(client, TOOL.CONFIRMAR_OPERACAO, {
      confirmation_id: prep.confirmation_id,
      plano: { updates: [{ tabela: 'despesas', id: D1, patch: { valor: 999999 } }] },
    });
    expect(r.isError).toBeFalsy();
    expect(db.rows('despesas')[0].valor).toBe(500);
  });

  it('campo fora da allowlist gravado no plano é recusado na execução', async () => {
    const prep = payload(
      await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, valor: 500 }),
    );
    // Simula adulteração direta do plano persistido.
    const op = db.rows('mcp_operacoes').find((o) => o.id === prep.confirmation_id)!;
    op.plano.updates[0].patch.user_id = OUTRO_USER;
    const r: any = await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(r.isError).toBe(true);
    expect(db.rows('despesas')[0].user_id).toBe(USER_ID);
    expect(db.rows('despesas')[0].valor).toBe(400);
  });

  it('cada registro alterado gera uma linha de auditoria com antes e depois', async () => {
    const prep = payload(
      await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, valor: 500 }),
    );
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const aud = db.rows('mcp_auditoria_registros');
    expect(aud).toHaveLength(1);
    expect([aud[0].registro_id, aud[0].tabela, aud[0].user_id]).toEqual([D1, 'despesas', USER_ID]);
    expect(aud[0].antes.valor).toBe(400);
    expect(aud[0].depois.valor).toBe(500);
  });

  it('confirmação preserva a prévia e o plano e registra o resultado em campo separado', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, valor: 500 }));
    const original = db.rows('mcp_operacoes')[0];
    const preview = JSON.stringify({ before_data: original.before_data, after_data: original.after_data, arguments: original.arguments, plano: original.plano });
    const r = await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(r.isError, r.content[0].text).not.toBe(true);
    const executed = db.rows('mcp_operacoes')[0];
    expect(JSON.stringify({ before_data: executed.before_data, after_data: executed.after_data, arguments: executed.arguments, plano: executed.plano })).toBe(preview);
    expect(executed.resultado).toMatchObject({ ok: true, itens: 1 });
    expect(executed.resultado.antes[0].valor).toBe(400);
    expect(executed.resultado.depois[0].valor).toBe(500);
  });
});

describe('lançamentos cancelados nunca entram em totais', () => {
  it('resumo do dashboard soma apenas o não cancelado', async () => {
    const out = payload(await call(client, TOOL.CONSULTAR_DASHBOARD, { data_inicio: '2026-08-01', data_fim: '2026-08-31' }));
    expect(JSON.stringify(out)).not.toContain('6000');
  });

  it('listar_receitas não devolve o cancelado como ativo', async () => {
    const out = payload(await call(client, TOOL.LISTAR_RECEITAS, { data_inicio: '2026-08-01', data_fim: '2026-08-31' }));
    const ids = (out.itens ?? []).map((i: any) => i.id);
    expect(ids).toContain(R_OK);
    expect(ids).not.toContain(R_CANC);
    expect(out.total_encontrado).toBe(1);
  });
});
