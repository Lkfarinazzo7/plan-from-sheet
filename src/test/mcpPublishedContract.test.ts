/**
 * Contrato de discovery/invocation do MCP, pelo Client SDK + InMemoryTransport.
 * Banco sintético: não usa credenciais, rede, Supabase real ou dados de produção.
 * Estes testes NÃO substituem a verificação HTTP do schema depois do deploy.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../../supabase/functions/odisseia-mcp/server';
import { TOOL, TOOL_NAMES } from '../../supabase/functions/odisseia-mcp/tools';
import { FakeDb } from './fakeSupabase';

type Row = Record<string, any>;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = uuid(9000);
const SETOR = uuid(9001);
const SUB = uuid(9002);
const SERIE = uuid(9003);
const CONTRATO = uuid(9004);
const OPERADORA = uuid(9005);
const VENDEDOR = uuid(9006);
const GROUPS = ['receita_operacional', 'deducoes_receita', 'custos_variaveis', 'despesas_fixas',
  'despesas_comerciais', 'resultado_financeiro', 'depreciacao_amortizacao', 'tributos_lucro', 'fora_dre'];
const CAT = Object.fromEntries(GROUPS.map((g, i) => [g, uuid(9100 + i)]));

function entry(id: number, origem: 'receita' | 'despesa', grupo: string | null, valor: number, extra: Row = {}): Row {
  return {
    id: uuid(id), user_id: USER, data: '2026-08-10', descricao: `Teste ${origem} ${id}`, valor,
    status: origem === 'receita' ? 'Recebido' : 'Pago', tipo: origem === 'despesa' ? 'Variável' : undefined,
    categoria_id: grupo ? CAT[grupo] : null, categoria: origem === 'receita' ? 'Plano de Saúde' : undefined,
    subcategoria_id: null, setor_id: SETOR, responsavel: 'Responsável sintético',
    recorrente: false, serie_id: null, ocorrencia: null, contrato_id: origem === 'receita' ? CONTRATO : undefined,
    competencia: '2026-08-01', vencimento: '2026-09-10',
    data_pagamento: origem === 'despesa' ? '2026-09-10' : undefined,
    data_recebimento: origem === 'receita' ? '2026-09-10' : undefined,
    unidade_negocio: 'Odisseia', observacoes: 'Somente teste', cancelado: false,
    cancelado_em: null, motivo_cancelamento: null, versao: 1,
    operadora_id: OPERADORA, vendedor_id: VENDEDOR,
    operadoras: { nome: 'Amil' }, vendedores: { nome: 'Rhayssa' },
    setores_despesa: { nome: 'Comercial' },
    categorias_despesa: grupo ? { nome: grupo, grupo_dre: grupo, tipo_dre: 'operacional', ativo: true } : null,
    subcategorias_despesa: null,
    ...extra,
  };
}

function fixture(extra: Record<string, Row[]> = {}) {
  return new FakeDb({
    categorias_despesa: GROUPS.map((g) => ({ id: CAT[g], nome: g, grupo_dre: g, tipo_dre: 'operacional', ativo: true })),
    subcategorias_despesa: [{ id: SUB, nome: 'Elaboração de propostas', categoria_id: CAT.despesas_fixas, grupo_dre: 'custos_variaveis', ativo: true }],
    setores_despesa: [{ id: SETOR, nome: 'Comercial', ativo: true }],
    operadoras: [{ id: OPERADORA, nome: 'Amil', ativa: true }],
    vendedores: [{ id: VENDEDOR, nome: 'Rhayssa', ativo: true }],
    user_roles: [{ id: uuid(9999), user_id: USER, role: 'gestor' }],
    receitas: [entry(1, 'receita', 'receita_operacional', 10000)],
    despesas: [
      entry(11, 'despesa', 'deducoes_receita', 1000),
      entry(12, 'despesa', 'custos_variaveis', 2000),
      entry(13, 'despesa', 'despesas_fixas', 3000),
      entry(14, 'despesa', 'despesas_comerciais', 500),
      entry(15, 'despesa', 'depreciacao_amortizacao', 200),
      entry(16, 'despesa', 'resultado_financeiro', 100),
      entry(17, 'despesa', 'tributos_lucro', 300),
    ],
    mcp_operacoes: [], mcp_auditoria_registros: [], series_recorrencia: [],
    ...extra,
  }, USER);
}

let db: FakeDb;
let client: Client;
const connections: Client[] = [];
async function connect(database: FakeDb, supabase = database.client()) {
  const server = buildServer({ supabase, userId: USER, email: null });
  const c = new Client({ name: 'mcp-public-contract-regression', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), c.connect(ct)]);
  connections.push(c);
  return c;
}
const call = (name: string, args: Row = {}) => client.callTool({ name, arguments: args }) as Promise<any>;
async function result(name: string, args: Row = {}) {
  const r = await call(name, args);
  expect(r.isError, r.content?.[0]?.text).not.toBe(true);
  return JSON.parse(r.content[0].text);
}
async function rejectWithoutWrite(name: string, args: Row) {
  const before = JSON.stringify({ receitas: db.rows('receitas'), despesas: db.rows('despesas'), operacoes: db.rows('mcp_operacoes') });
  const r = await call(name, args);
  expect(r.isError, r.content?.[0]?.text).toBe(true);
  expect(JSON.stringify({ receitas: db.rows('receitas'), despesas: db.rows('despesas'), operacoes: db.rows('mcp_operacoes') })).toBe(before);
}

beforeEach(async () => { db = fixture(); client = await connect(db); });
afterEach(async () => { await Promise.all(connections.splice(0).map((c) => c.close())); });

describe('schema realmente entregue por tools/list do servidor construído', () => {
  it('cada nome canônico é descoberto uma vez e tipo de despesa continua opcional', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const schema = tools.find((t) => t.name === TOOL.PREPARAR_ALTERACAO_LANCAMENTO)!.inputSchema;
    expect(schema.properties!.tipo).toMatchObject({ type: 'string', enum: ['Fixo', 'Variável'] });
    expect(schema.required ?? []).not.toContain('tipo');
  });

  it('publica leitura de cancelados por opção explícita e grupo próprio da subcategoria', async () => {
    const { tools } = await client.listTools();
    for (const name of [TOOL.LISTAR_RECEITAS, TOOL.LISTAR_DESPESAS]) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.inputSchema.properties!.incluir_cancelados).toMatchObject({ type: 'boolean' });
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
    for (const name of [TOOL.PREPARAR_CRIACAO_SUBCATEGORIA, TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA]) {
      expect(tools.find((t) => t.name === name)!.inputSchema.properties).toHaveProperty('grupo_dre');
    }
  });
});

describe('DRE antigo e DRE por competência compartilham o motor estrito', () => {
  it('competência reconhece abertos, contribuição antes de fixas e resultado financeiro separado', async () => {
    db.rows('receitas')[0].status = 'Aguardando';
    db.rows('despesas')[0].status = 'A pagar';
    for (const name of [TOOL.GERAR_DRE, TOOL.GERAR_DRE_COMPETENCIA]) {
      const out = await result(name, { mes: 8, ano: 2026 });
      expect(out).toMatchObject({ regime: 'competencia', receita_bruta: 10000, deducoes: 1000,
        receita_liquida: 9000, custos_variaveis: 2000, margem_contribuicao: 7000,
        despesas_fixas: 3000, despesas_comerciais: 500, depreciacao_amortizacao: 200,
        resultado_operacional: 3300, resultado_financeiro: -100, resultado_antes_tributos: 3200,
        tributos_lucro: 300, resultado_liquido: 2900 });
    }
  });

  it.each(['competencia', 'realizado', 'projetado'])('as duas tools mantêm paridade no regime %s', async (regime) => {
    db.rows('receitas').push(entry(2, 'receita', 'receita_operacional', 500, { status: 'Atrasado' }));
    const args = { mes: regime === 'competencia' ? 8 : 9, ano: 2026, regime };
    const a = await result(TOOL.GERAR_DRE, args);
    const b = await result(TOOL.GERAR_DRE_COMPETENCIA, args);
    for (const field of ['regime', 'periodo', 'grupos', 'receita_bruta', 'margem_contribuicao', 'resultado_operacional', 'resultado_financeiro', 'resultado_liquido', 'pendencias']) {
      expect(a[field], field).toEqual(b[field]);
    }
  });

  it('competência em agosto não vira recebimento/pagamento em agosto', async () => {
    const ago = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026, regime: 'realizado' });
    const set = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 9, ano: 2026, regime: 'realizado' });
    expect(ago.receita_bruta).toBe(0);
    expect(ago.despesas_fixas).toBe(0);
    expect(set.receita_bruta).toBe(10000);
    expect(set.despesas_fixas).toBe(3000);
  });

  it('datas históricas ausentes continuam pendentes e nenhuma data é gravada', async () => {
    db.rows('receitas')[0].competencia = null;
    db.rows('receitas')[0].data_recebimento = null;
    db.rows('despesas')[0].competencia = null;
    const snapshot = JSON.stringify([db.rows('receitas'), db.rows('despesas')]);
    for (const name of [TOOL.GERAR_DRE, TOOL.GERAR_DRE_COMPETENCIA]) {
      const out = await result(name, { mes: 8, ano: 2026 });
      expect(out.receita_bruta).toBe(0);
      expect(out.deducoes).toBe(0);
      expect(out.pendencias.sem_data_do_regime).toMatchObject({ quantidade: 2, valor: 11000 });
      expect(out.pendencias.via_data_legada.quantidade).toBe(0);
    }
    expect(JSON.stringify([db.rows('receitas'), db.rows('despesas')])).toBe(snapshot);
  });

  it('grupo ausente não herda operacional nem presume que entrada seja receita', async () => {
    db.rows('receitas')[0].categoria_id = null;
    db.rows('receitas')[0].categorias_despesa = null;
    db.rows('categorias_despesa').find((c) => c.id === CAT.despesas_fixas)!.grupo_dre = null;
    db.rows('despesas').find((d) => d.categoria_id === CAT.despesas_fixas)!.categorias_despesa.grupo_dre = null;
    const out = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026 });
    expect(out.receita_bruta).toBe(0);
    expect(out.despesas_fixas).toBe(0);
    expect(out.custos_variaveis).toBe(2000);
    expect(out.pendencias.sem_grupo_dre).toMatchObject({ quantidade: 2, valor: 13000 });
  });

  it('filtra unidade e setor dos dois lados, inclusive receitas', async () => {
    db.rows('receitas').push(entry(2, 'receita', 'receita_operacional', 99999, { unidade_negocio: 'Outra' }));
    db.rows('receitas').push(entry(3, 'receita', 'receita_operacional', 88888, { setor_id: null, setores_despesa: null }));
    const out = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026, unidade: 'Odisseia', setor: 'Comercial' });
    expect(out.receita_bruta).toBe(10000);
    expect(out.resultado_liquido).toBe(2900);
  });

  it('grupo explícito da subcategoria prevalece sem confundir fixo/variável ou setor', async () => {
    db = fixture({ receitas: [], despesas: [entry(1, 'despesa', 'despesas_fixas', 50, { subcategoria_id: SUB, tipo: 'Fixo' })] });
    client = await connect(db);
    const out = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026 });
    expect(out.custos_variaveis).toBe(50);
    expect(out.despesas_fixas).toBe(0);
  });

  it('juros recebidos e pagos têm sinais opostos; principal e ativo ficam fora do resultado', async () => {
    db.rows('receitas').push(entry(2, 'receita', 'resultado_financeiro', 250));
    db.rows('receitas').push(entry(3, 'receita', 'fora_dre', 20000));
    db.rows('despesas').push(entry(18, 'despesa', 'fora_dre', 5000));
    const out = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026 });
    expect(out.resultado_financeiro).toBe(150);
    expect(out.resultado_liquido).toBe(3150);
    expect(out.fora_dre.quantidade).toBe(2);
  });

  it('agrega mais de 1000 lançamentos com paginação explícita', async () => {
    db = fixture({ despesas: [], receitas: Array.from({ length: 1001 }, (_, i) => entry(10000 + i, 'receita', 'receita_operacional', 1)) });
    const ranges: number[] = [];
    const base = db.client();
    const observed = { ...base, from(table: string) {
      const query = base.from(table);
      const range = query.range.bind(query);
      query.range = (from: number, to: number) => { if (table === 'receitas') ranges.push(from); return range(from, to); };
      return query;
    } };
    client = await connect(db, observed);
    const out = await result(TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026 });
    expect(out.receita_bruta).toBe(1001);
    expect(out.itens_considerados).toBe(1001);
    expect(ranges.some((from) => from >= 1000)).toBe(true);
  });
});

describe('listagens completas e filtros antes da paginação', () => {
  it.each(['receita', 'despesa'] as const)('%s expõe datas independentes, referências e cancelamento', async (origem) => {
    const row = entry(100, origem, 'despesas_fixas', 50, { subcategoria_id: SUB, serie_id: SERIE, ocorrencia: '2026-08-01', recorrente: true,
      subcategorias_despesa: { nome: 'Elaboração de propostas', grupo_dre: 'custos_variaveis' } });
    db = fixture({ receitas: origem === 'receita' ? [row] : [], despesas: origem === 'despesa' ? [row] : [] });
    client = await connect(db);
    const out = await result(origem === 'receita' ? TOOL.LISTAR_RECEITAS : TOOL.LISTAR_DESPESAS);
    expect(out.total_encontrado).toBe(1);
    expect(out.itens[0]).toMatchObject({ id: row.id, categoria_id: CAT.despesas_fixas, subcategoria_id: SUB,
      setor_id: SETOR, setor: 'Comercial', subcategoria: 'Elaboração de propostas', grupo_dre: 'custos_variaveis',
      competencia: '2026-08-01', vencimento: '2026-09-10', cancelado: false, serie_id: SERIE,
      ocorrencia: '2026-08-01', versao: 1, responsavel: 'Responsável sintético', recorrente: true });
    expect(out.itens[0][origem === 'receita' ? 'data_recebimento' : 'data_pagamento']).toBe('2026-09-10');
    if (origem === 'receita') expect(out.itens[0].contrato_id).toBe(CONTRATO);
    else expect(out.itens[0].tipo).toBe('Variável');
  });

  it.each(['receita', 'despesa'] as const)('%s exclui cancelados por flag e status, mas permite consultar o histórico', async (origem) => {
    const rows = [entry(100, origem, 'receita_operacional', 10), entry(101, origem, 'receita_operacional', 20, { cancelado: true }),
      entry(102, origem, 'receita_operacional', 30, { status: 'Cancelado' })];
    db = fixture({ receitas: origem === 'receita' ? rows : [], despesas: origem === 'despesa' ? rows : [] });
    client = await connect(db);
    const tool = origem === 'receita' ? TOOL.LISTAR_RECEITAS : TOOL.LISTAR_DESPESAS;
    const active = await result(tool);
    expect(active.itens.map((r: Row) => r.id)).toEqual([uuid(100)]);
    expect(active.total_encontrado).toBe(1);
    const history = await result(tool, { incluir_cancelados: true });
    expect(history.itens).toHaveLength(3);
    expect(history.total_encontrado).toBe(3);
  });

  it('receita filtra operadora/vendedor antes de offset e retorna total filtrado', async () => {
    db = fixture({ receitas: [entry(100, 'receita', 'receita_operacional', 10, { data: '2026-08-31', operadora_id: uuid(9020), operadoras: { nome: 'Outra' } }),
      entry(101, 'receita', 'receita_operacional', 20, { data: '2026-08-30' }), entry(102, 'receita', 'receita_operacional', 30, { data: '2026-08-29' })],
      operadoras: [{ id: OPERADORA, nome: 'Amil', ativa: true }, { id: uuid(9020), nome: 'Outra', ativa: true }] });
    client = await connect(db);
    const out = await result(TOOL.LISTAR_RECEITAS, { operadora: 'Amil', vendedor: 'Rhayssa', offset: 1, limit: 1 });
    expect(out.total_encontrado).toBe(2);
    expect(out.itens[0].id).toBe(uuid(102));
  });

  it('receita aceita filtro de setor e responsável sem devolver outra unidade', async () => {
    db.rows('receitas').push(entry(2, 'receita', 'receita_operacional', 20, { responsavel: 'Outro' }));
    const out = await result(TOOL.LISTAR_RECEITAS, { setor: 'Comercial', responsavel: 'Responsável sintético', unidade: 'Odisseia', limit: 1 });
    expect(out.total_encontrado).toBe(1);
    expect(out.itens[0].id).toBe(uuid(1));
  });

  it('despesa filtra categoria e setor antes de offset', async () => {
    db = fixture({ despesas: [entry(100, 'despesa', 'custos_variaveis', 10, { data: '2026-08-31' }),
      entry(101, 'despesa', 'despesas_fixas', 20, { data: '2026-08-30' }), entry(102, 'despesa', 'despesas_fixas', 30, { data: '2026-08-29' })] });
    client = await connect(db);
    const out = await result(TOOL.LISTAR_DESPESAS, { categoria: 'despesas_fixas', setor: 'Comercial', offset: 1, limit: 1 });
    expect(out.total_encontrado).toBe(2);
    expect(out.itens[0].id).toBe(uuid(102));
  });
});

describe('edição segura exposta pelo protocolo', () => {
  it.each(['receita', 'despesa'] as const)('%s com data efetiva não pode preparar cancelamento, mesmo com status aberto', async (origem) => {
    const row = db.rows(origem === 'receita' ? 'receitas' : 'despesas')[0];
    row.status = origem === 'receita' ? 'Aguardando' : 'A pagar';
    expect(row[origem === 'receita' ? 'data_recebimento' : 'data_pagamento']).toBe('2026-09-10');
    await rejectWithoutWrite(TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO, {
      tipo_lancamento: origem, id: row.id, motivo: 'Teste de proteção do pagamento histórico',
    });
  });

  it.each([
    ['receita', { valor: 0 }], ['despesa', { valor: 0 }],
    ['receita', { data_efetiva: null }], ['despesa', { data_efetiva: null }],
  ] as const)('rejeita na preparação a remoção de liquidação histórica de %s: %j', async (origem, patch) => {
    const row = db.rows(origem === 'receita' ? 'receitas' : 'despesas')[0];
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: origem, id: row.id, ...patch });
  });

  it.each([
    ['receita', { status: 'Inventado' }], ['despesa', { status: 'Inventado' }],
    ['receita', { categoria: '   ' }], ['despesa', { categoria: '   ' }],
    ['receita', { descricao: ' \t\n ' }], ['despesa', { descricao: ' \t\n ' }],
  ] as const)('criação de %s rejeita status arbitrário e texto vazio após trim: %j', async (origem, patch) => {
    const args = origem === 'receita'
      ? { data: '2026-08-10', descricao: 'Receita sintética', categoria: 'Plano de Saúde', operadora: 'Amil', vendedor: 'Rhayssa', valor: 100 }
      : { data: '2026-08-10', descricao: 'Despesa sintética', categoria: 'despesas_fixas', tipo: 'Fixo', valor: 100 };
    await rejectWithoutWrite(origem === 'receita' ? TOOL.PREPARAR_CRIACAO_RECEITA : TOOL.PREPARAR_CRIACAO_DESPESA, { ...args, ...patch });
  });

  it.each(['competencia', 'vencimento', 'data_efetiva'])('recusa calendário impossível em %s sem pendência nem alteração', async (field) => {
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: uuid(11), [field]: '2026-02-29' });
  });

  it('recusa data impossível em um item do lote inteiro', async () => {
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LOTE, { itens: [
      { tipo_lancamento: 'despesa', id: uuid(11), observacoes: 'válida' },
      { tipo_lancamento: 'despesa', id: uuid(12), competencia: '2026-04-31' },
    ] });
  });

  it('no-op não cria operação pendente', async () => {
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: uuid(11), valor: 1000 });
  });

  it('não troca a categoria conservando uma subcategoria de outro pai', async () => {
    db.rows('despesas')[0].categoria_id = CAT.despesas_fixas;
    db.rows('despesas')[0].subcategoria_id = SUB;
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: uuid(11), categoria_id: CAT.despesas_comerciais });
  });

  it('não associa categoria/subcategoria/setor inativos a um lançamento', async () => {
    db.rows('categorias_despesa').find((c) => c.id === CAT.despesas_fixas)!.ativo = false;
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: uuid(11), categoria_id: CAT.despesas_fixas });
    db.rows('categorias_despesa').find((c) => c.id === CAT.despesas_fixas)!.ativo = true;
    db.rows('subcategorias_despesa')[0].ativo = false;
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: uuid(11), categoria_id: CAT.despesas_fixas, subcategoria_id: SUB });
    db.rows('setores_despesa').push({ id: uuid(9021), nome: 'Setor inativo', ativo: false });
    await rejectWithoutWrite(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: uuid(11), setor: 'Setor inativo' });
  });

  it('receita edita setor e responsável, mantendo ID e confirmação em duas etapas', async () => {
    const before = { ...db.rows('receitas')[0] };
    const prep = await result(TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'receita', id: uuid(1), setor: null, responsavel: 'Nova responsável', recorrente: true });
    expect(prep.status).toBe('pending');
    expect(db.rows('receitas')[0]).toEqual(before);
    const pending = await result(TOOL.OBTER_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(pending.status).toBe('pending');
    await result(TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('receitas')[0]).toEqual({ ...before, setor_id: null, responsavel: 'Nova responsável', recorrente: true, versao: 2 });
    expect((await call(TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id })).isError).toBe(true);
    expect(db.rows('receitas')[0].versao).toBe(2);
  });

  it('grupo próprio de subcategoria só muda após confirmação', async () => {
    const before = { ...db.rows('subcategorias_despesa')[0] };
    const prep = await result(TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA, { id: SUB, grupo_dre: 'despesas_comerciais' });
    expect(db.rows('subcategorias_despesa')[0]).toEqual(before);
    expect(prep.alteracoes).toContainEqual({ campo: 'grupo_dre', antes: 'custos_variaveis', depois: 'despesas_comerciais' });
    await result(TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('subcategorias_despesa')[0]).toMatchObject({ id: SUB, categoria_id: CAT.despesas_fixas, grupo_dre: 'despesas_comerciais' });
  });
});
