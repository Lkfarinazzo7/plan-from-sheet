/**
 * Testes de regressão do servidor MCP, exercitados pelo protocolo real
 * (Client MCP + InMemoryTransport) contra um adapter Supabase in-memory.
 * Nenhuma chamada toca o banco de produção.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../../supabase/functions/odisseia-mcp/server';
import { SERVER_VERSION, TOOL, TOOL_NAMES } from '../../supabase/functions/odisseia-mcp/tools';
import { findIdentityArgViolation } from '../../supabase/functions/odisseia-mcp/logic';
import { FakeDb } from './fakeSupabase';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function seedDb() {
  return new FakeDb({
    operadoras: [{ id: '22222222-2222-4222-8222-222222222222', nome: 'Amil', ativa: true }],
    vendedores: [{ id: '33333333-3333-4333-8333-333333333333', nome: 'Rhayssa', ativo: true }],
    categorias_despesa: [{ id: '44444444-4444-4444-8444-444444444444', nome: 'Administrativo', tipo_dre: 'operacional' }],
    receitas: [],
    despesas: [],
    mcp_operacoes: [],
  });
}

async function connect(db: FakeDb) {
  const server = buildServer({ supabase: db.client(), userId: USER_ID, email: null });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function payload(result: any) {
  return JSON.parse(result.content[0].text);
}

let db: FakeDb;
let client: Awaited<ReturnType<typeof connect>>;

beforeEach(async () => {
  db = seedDb();
  client = await connect(db);
});

describe('discovery', () => {
  it('expõe exatamente a lista canônica de tools, sem duplicatas', async () => {
    const { tools } = await client.listTools();
    const nomes = tools.map((t) => t.name);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(nomes.sort()).toEqual([...TOOL_NAMES].sort());
    expect(nomes).toHaveLength(30);
  });

  it('inclui as tools de preparação de lançamento', async () => {
    const nomes = (await client.listTools()).tools.map((t) => t.name);
    expect(nomes).toContain(TOOL.PREPARAR_CRIACAO_RECEITA);
    expect(nomes).toContain(TOOL.PREPARAR_CRIACAO_DESPESA);
    expect(nomes).toContain(TOOL.OBTER_OPERACAO);
    expect(nomes).toContain(TOOL.CONFIRMAR_OPERACAO);
  });

  it('reporta a versão do servidor em initialize', async () => {
    expect(client.getServerVersion()?.version).toBe(SERVER_VERSION);
  });
});

describe('fluxo de criação de receita em duas etapas', () => {
  const args = {
    data: '2026-08-10',
    descricao: 'Contrato Teste MCP',
    categoria: 'Plano de Saúde',
    operadora: 'Amil',
    vendedor: 'Rhayssa',
    valor: 1500,
  };

  it('preparar_criacao_receita devolve confirmation_id e não cria receita', async () => {
    const out = payload(await client.callTool({ name: TOOL.PREPARAR_CRIACAO_RECEITA, arguments: args }));
    expect(out.confirmation_id).toBeTruthy();
    expect(out.status).toBe('pending');
    expect(db.rows('receitas')).toHaveLength(0);
  });

  it('obter_operacao retorna a operação pendente', async () => {
    const prep = payload(await client.callTool({ name: TOOL.PREPARAR_CRIACAO_RECEITA, arguments: args }));
    const op = payload(await client.callTool({ name: TOOL.OBTER_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } }));
    expect(op.status).toBe('pending');
    expect(op.tool_name).toBe(TOOL.PREPARAR_CRIACAO_RECEITA);
  });

  it('confirmar_operacao cria exatamente uma receita e o replay falha', async () => {
    const prep = payload(await client.callTool({ name: TOOL.PREPARAR_CRIACAO_RECEITA, arguments: args }));
    const ok = payload(await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } }));
    expect(ok.status).toBe('executed');
    expect(db.rows('receitas')).toHaveLength(1);
    expect(db.rows('receitas')[0].user_id).toBe(USER_ID);

    const replay: any = await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } });
    expect(replay.isError).toBe(true);
    expect(replay.content[0].text).toMatch(/já foi executada/i);
    expect(db.rows('receitas')).toHaveLength(1);
  });

  it('rejeita operadora inexistente sem criar operação', async () => {
    const r: any = await client.callTool({
      name: TOOL.PREPARAR_CRIACAO_RECEITA,
      arguments: { ...args, operadora: 'Inexistente XPTO' },
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Operadora não encontrad/i);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });
});

describe('demais tools alcançáveis por nome', () => {
  it('preparar_criacao_despesa continua alcançável', async () => {
    const out = payload(
      await client.callTool({
        name: TOOL.PREPARAR_CRIACAO_DESPESA,
        arguments: { data: '2026-08-10', descricao: 'Aluguel', categoria: 'Administrativo', tipo: 'Fixa', valor: 900 },
      }),
    );
    expect(out.confirmation_id).toBeTruthy();
    expect(db.rows('despesas')).toHaveLength(0);
  });

  it('cancelar_operacao invalida a pendência', async () => {
    const prep = payload(
      await client.callTool({
        name: TOOL.PREPARAR_CRIACAO_DESPESA,
        arguments: { data: '2026-08-10', descricao: 'Aluguel', categoria: 'Administrativo', tipo: 'Fixa', valor: 900 },
      }),
    );
    const c = payload(await client.callTool({ name: TOOL.CANCELAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } }));
    expect(c.status).toBe('cancelled');
    const replay: any = await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } });
    expect(replay.isError).toBe(true);
    expect(db.rows('despesas')).toHaveLength(0);
  });

  it('tool de leitura responde pelo nome registrado', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_CADASTROS, arguments: { tipo: 'operadoras' } }));
    expect(out.tipo).toBe('operadoras');
    expect(out.itens[0].nome).toBe('Amil');
  });

  it('rejeita user_id no transporte, antes do schema da tool', () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: TOOL.LISTAR_CADASTROS, arguments: { tipo: 'operadoras', user_id: 'x' } },
    });
    expect(findIdentityArgViolation(body)).toBe('user_id');
    const limpo = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: TOOL.LISTAR_CADASTROS, arguments: { tipo: 'operadoras' } } });
    expect(findIdentityArgViolation(limpo)).toBeNull();
  });
});

describe('alteração do campo tipo em despesas', () => {
  const DESPESA_ID = '55555555-5555-4555-8555-555555555555';
  const baseDespesa = {
    id: DESPESA_ID,
    user_id: USER_ID,
    data: '2026-08-05',
    descricao: 'Aluguel Sede',
    valor: 900,
    tipo: 'Variável',
    status: 'A pagar',
    responsavel: 'Bruno',
    recorrente: false,
    unidade_negocio: 'Odisseia',
    observacoes: 'nota',
    categoria_id: '44444444-4444-4444-8444-444444444444',
    setor_id: null,
  };

  beforeEach(async () => {
    db = seedDb();
    db.rows('despesas').push({ ...baseDespesa });
    client = await connect(db);
  });

  async function prepararTipo(tipo: string, extra: Record<string, unknown> = {}) {
    return await client.callTool({
      name: TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
      arguments: { tipo_lancamento: 'despesa', id: DESPESA_ID, tipo, ...extra } as any,
    });
  }

  it('Variável -> Fixo com diff correto e sem alterar o banco', async () => {
    const out = payload(await prepararTipo('Fixo'));
    expect(out.status).toBe('pending');
    const linha = out.alteracoes.find((d: any) => d.campo === 'tipo');
    expect(linha).toEqual({ campo: 'tipo', antes: 'Variável', depois: 'Fixo' });
    expect(out.alteracoes).toHaveLength(1);
    expect(out.depois.tipo).toBe('Fixo');
    expect(db.rows('despesas')[0].tipo).toBe('Variável');
    expect(db.rows('mcp_operacoes')).toHaveLength(1);
    expect(db.rows('mcp_operacoes')[0].status).toBe('pending');
  });

  it('Fixo -> Variável com diff correto', async () => {
    db.rows('despesas')[0].tipo = 'Fixo';
    const out = payload(await prepararTipo('Variável'));
    expect(out.alteracoes).toContainEqual({ campo: 'tipo', antes: 'Fixo', depois: 'Variável' });
  });

  it('confirmação efetiva o tipo preservando id e demais campos', async () => {
    const prep = payload(await prepararTipo('Fixo'));
    const ok = payload(await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } }));
    expect(ok.status).toBe('executed');
    const rows = db.rows('despesas');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ ...baseDespesa, tipo: 'Fixo' });
  });

  it('tipo inválido é rejeitado pelo schema e não cria operação', async () => {
    const r: any = await prepararTipo('Recorrente');
    expect(r.isError).toBe(true);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
    expect(db.rows('despesas')[0].tipo).toBe('Variável');
  });

  it('tipo enviado para receita não cria operação', async () => {
    db.rows('receitas').push({ id: '66666666-6666-4666-8666-666666666666', user_id: USER_ID, data: '2026-08-01', descricao: 'Contrato X', valor: 100, status: 'Aguardando' });
    const r: any = await client.callTool({
      name: TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
      arguments: { tipo_lancamento: 'receita', id: '66666666-6666-4666-8666-666666666666', tipo: 'Fixo' } as any,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/só se aplica a despesas/i);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });

  it('chamada sem tipo continua funcionando e altera apenas o outro campo', async () => {
    const out = payload(
      await client.callTool({
        name: TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
        arguments: { tipo_lancamento: 'despesa', id: DESPESA_ID, valor: 1200 } as any,
      }),
    );
    expect(out.alteracoes).toEqual([{ campo: 'valor', antes: 900, depois: 1200 }]);
    const ok = payload(await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: out.confirmation_id } }));
    expect(ok.status).toBe('executed');
    expect(db.rows('despesas')[0]).toEqual({ ...baseDespesa, valor: 1200 });
  });

  it('listar_despesas retorna tipo para Fixo e Variável', async () => {
    db.rows('despesas').push({ ...baseDespesa, id: '77777777-7777-4777-8777-777777777777', descricao: 'Internet', tipo: 'Fixo' });
    const out = payload(await client.callTool({ name: TOOL.LISTAR_DESPESAS, arguments: {} }));
    const tipos = out.itens.map((i: any) => i.tipo).sort();
    expect(tipos).toEqual(['Fixo', 'Variável']);
  });
});
