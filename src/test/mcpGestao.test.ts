/**
 * Testes do MCP para categorias/subcategorias, edição completa, lote atômico,
 * cancelamento lógico e encerramento de série. Tudo em memória — nunca toca produção.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../../supabase/functions/odisseia-mcp/server';
import { SERVER_VERSION, TOOL, TOOL_NAMES } from '../../supabase/functions/odisseia-mcp/tools';
import { FakeDb } from './fakeSupabase';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CAT_FIXA = '44444444-4444-4444-8444-444444444444';
const CAT_COM = '44444444-4444-4444-8444-444444444445';
const SUB_1 = '55555555-5555-4555-8555-555555555501';
const SETOR = '66666666-6666-4666-8666-666666666601';
const D1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const D2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const D_PAGA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const R1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const SERIE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

function despesa(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: USER_ID,
    data: '2026-08-10',
    descricao: `Despesa ${id.slice(-1)}`,
    valor: 400,
    tipo: 'Variável',
    status: 'A pagar',
    categoria_id: CAT_FIXA,
    subcategoria_id: null,
    setor_id: null,
    unidade_negocio: 'Odisseia',
    responsavel: null,
    recorrente: false,
    observacoes: null,
    competencia: null,
    vencimento: null,
    data_pagamento: null,
    cancelado: false,
    cancelado_em: null,
    motivo_cancelamento: null,
    serie_id: null,
    versao: 1,
    ...extra,
  };
}

function seed(comPapel = true) {
  return new FakeDb({
    operadoras: [{ id: '22222222-2222-4222-8222-222222222222', nome: 'Amil', ativa: true }],
    vendedores: [{ id: '33333333-3333-4333-8333-333333333333', nome: 'Rhayssa', ativo: true }],
    setores_despesa: [{ id: SETOR, nome: 'Pré-vendas', ativo: true }],
    categorias_despesa: [
      { id: CAT_FIXA, nome: 'Escritório', tipo_dre: 'operacional', grupo_dre: 'despesas_fixas', ativo: true },
      { id: CAT_COM, nome: 'Marketing', tipo_dre: 'operacional', grupo_dre: null, ativo: true },
    ],
    subcategorias_despesa: [{ id: SUB_1, categoria_id: CAT_FIXA, nome: 'Aluguel', ativo: true }],
    series_recorrencia: [
      { id: SERIE, user_id: USER_ID, tipo: 'despesa', nome: 'Seguro RC Profissional', ativa: true, encerrada_em: null, motivo_encerramento: null, unidade_negocio: 'Odisseia', categoria_id: CAT_FIXA, subcategoria_id: null, setor_id: null },
    ],
    despesas: [despesa(D1), despesa(D2, { valor: 900 }), despesa(D_PAGA, { status: 'Pago', data_pagamento: '2026-08-11', valor: 406.53 })],
    receitas: [
      { id: R1, user_id: USER_ID, data: '2026-08-01', descricao: 'Contrato X', valor: 1000, status: 'Aguardando', categoria: 'Plano de Saúde', categoria_id: null, subcategoria_id: null, competencia: null, vencimento: null, data_recebimento: null, cancelado: false, unidade_negocio: 'Odisseia', versao: 1 },
    ],
    mcp_operacoes: [],
    user_roles: comPapel ? [{ id: '77777777-7777-4777-8777-777777777701', user_id: USER_ID, role: 'gestor' }] : [],
  }, USER_ID);
}

async function connect(db: FakeDb) {
  const server = buildServer({ supabase: db.client(), userId: USER_ID, email: null });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

const payload = (r: any) => JSON.parse(r.content[0].text);
const call = (c: any, name: string, args: any = {}) => c.callTool({ name, arguments: args });

let db: FakeDb;
let client: Awaited<ReturnType<typeof connect>>;

beforeEach(async () => {
  db = seed();
  client = await connect(db);
});

describe('registro de tools', () => {
  it('expõe 30 tools sem duplicatas na versão 1.2.0', async () => {
    const nomes = (await client.listTools()).tools.map((t) => t.name);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(nomes.sort()).toEqual([...TOOL_NAMES].sort());
    expect(nomes).toHaveLength(30);
    expect(SERVER_VERSION).toBe('1.2.0');
    expect(client.getServerVersion()?.version).toBe('1.2.0');
  });
});

describe('categorias e subcategorias', () => {
  it('listar_categorias mostra grupo de DRE e pendências de classificação', async () => {
    const out = payload(await call(client, TOOL.LISTAR_CATEGORIAS));
    expect(out.total).toBe(2);
    expect(out.sem_grupo_dre).toBe(1);
    const escritorio = out.itens.find((c: any) => c.nome === 'Escritório');
    expect(escritorio.grupo_dre).toBe('despesas_fixas');
    expect(escritorio.subcategorias[0].nome).toBe('Aluguel');
  });

  it('cria categoria em duas etapas e preserva as existentes', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_CRIACAO_CATEGORIA, { nome: 'Ajuda de custo aos prestadores', grupo_dre: 'custos_variaveis' }));
    expect(db.rows('categorias_despesa')).toHaveLength(2);
    const ok = payload(await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id }));
    expect(ok.status).toBe('executed');
    const cats = db.rows('categorias_despesa');
    expect(cats).toHaveLength(3);
    expect(cats[2].grupo_dre).toBe('custos_variaveis');
    expect(cats[0].id).toBe(CAT_FIXA);
  });

  it('recusa categoria duplicada sem criar operação', async () => {
    const r: any = await call(client, TOOL.PREPARAR_CRIACAO_CATEGORIA, { nome: 'escritório', grupo_dre: 'despesas_fixas' });
    expect(r.isError).toBe(true);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });

  it('grupo de DRE inválido é rejeitado pelo schema', async () => {
    const r: any = await call(client, TOOL.PREPARAR_CRIACAO_CATEGORIA, { nome: 'X', grupo_dre: 'inventado' });
    expect(r.isError).toBe(true);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });

  it('classifica categoria legada sem transformar as demais', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_CATEGORIA, { id: CAT_COM, grupo_dre: 'despesas_comerciais' }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('categorias_despesa').find((c) => c.id === CAT_COM)!.grupo_dre).toBe('despesas_comerciais');
    expect(db.rows('categorias_despesa').find((c) => c.id === CAT_FIXA)!.grupo_dre).toBe('despesas_fixas');
  });

  it('inativa categoria sem apagar (ID preservado)', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_CATEGORIA, { id: CAT_COM, ativo: false }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const cat = db.rows('categorias_despesa').find((c) => c.id === CAT_COM)!;
    expect(cat.ativo).toBe(false);
    expect(db.rows('categorias_despesa')).toHaveLength(2);
  });

  it('cria subcategoria vinculada à categoria e recusa duplicada', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_CRIACAO_SUBCATEGORIA, { categoria_id: CAT_FIXA, nome: 'Energia' }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('subcategorias_despesa')).toHaveLength(2);
    const dup: any = await call(client, TOOL.PREPARAR_CRIACAO_SUBCATEGORIA, { categoria_id: CAT_FIXA, nome: 'energia' });
    expect(dup.isError).toBe(true);
  });

  it('inativa subcategoria e recusa categoria-pai inexistente', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA, { id: SUB_1, ativo: false }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('subcategorias_despesa')[0].ativo).toBe(false);
    const r: any = await call(client, TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA, { id: SUB_1, categoria_id: '99999999-9999-4999-8999-999999999999' });
    expect(r.isError).toBe(true);
  });
});

describe('permissão em cadastros compartilhados', () => {
  it('usuário sem admin/gestor não consegue preparar mudança de categoria', async () => {
    const semPapel = seed(false);
    const c = await connect(semPapel);
    const r: any = await call(c, TOOL.PREPARAR_ALTERACAO_CATEGORIA, { id: CAT_COM, grupo_dre: 'despesas_comerciais' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/administrador ou gestor/i);
    expect(semPapel.rows('mcp_operacoes')).toHaveLength(0);
    expect(semPapel.rows('categorias_despesa').find((c: any) => c.id === CAT_COM).grupo_dre).toBeNull();
  });

  it('preparo de alteração de categoria mostra o impacto no histórico compartilhado', async () => {
    const r = payload(await call(client, TOOL.PREPARAR_ALTERACAO_CATEGORIA, { id: CAT_FIXA, grupo_dre: 'custos_variaveis' }));
    expect(r.impacto.despesas_vinculadas.quantidade).toBe(3);
    expect(r.impacto.despesas_vinculadas.liquidados).toBe(1);
    expect(r.impacto.subcategorias).toBe(1);
    expect(r.impacto.aviso).toMatch(/compartilhado/i);
  });
});

describe('alteração completa de lançamento', () => {
  it('altera um único campo preservando todos os demais', async () => {
    const antes = { ...db.rows('despesas')[0] };
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, responsavel: 'Bruno' }));
    expect(prep.alteracoes).toEqual([{ campo: 'responsavel', antes: null, depois: 'Bruno' }]);
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('despesas')[0]).toEqual({ ...antes, responsavel: 'Bruno', versao: 2 });
  });

  it('define competência, vencimento e pagamento efetivo sem inventar datas', async () => {
    const prep = payload(
      await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, {
        tipo_lancamento: 'despesa',
        id: D1,
        competencia: '2026-08-01',
        vencimento: '2026-08-15',
        data_efetiva: '2026-08-16',
      }),
    );
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const d = db.rows('despesas')[0];
    expect([d.competencia, d.vencimento, d.data_pagamento]).toEqual(['2026-08-01', '2026-08-15', '2026-08-16']);
  });

  it('data_efetiva de receita grava em data_recebimento', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'receita', id: R1, data_efetiva: '2026-08-20' }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('receitas')[0].data_recebimento).toBe('2026-08-20');
  });

  it('null limpa o campo e omitido preserva', async () => {
    db.rows('despesas')[0].observacoes = 'nota antiga';
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, observacoes: null }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(db.rows('despesas')[0].observacoes).toBeNull();
    expect(db.rows('despesas')[0].descricao).toBe('Despesa 1');
  });

  it('subcategoria fora da categoria é recusada sem criar operação', async () => {
    const r: any = await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, categoria_id: CAT_COM, subcategoria_id: SUB_1 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/não pertence à categoria/i);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });

  it('campos exclusivos de despesa são recusados em receita', async () => {
    for (const campo of [{ setor: 'Pré-vendas' }, { responsavel: 'Bruno' }, { recorrente: true }]) {
      const r: any = await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'receita', id: R1, ...campo });
      expect(r.isError).toBe(true);
    }
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });

  it('conflito de versão entre preparo e confirmação impede a execução', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, valor: 500 }));
    db.rows('despesas')[0].versao = 7; // alteração concorrente
    const r: any = await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/alterado depois do preparo/i);
    expect(db.rows('despesas')[0].valor).toBe(400);
  });
});

describe('lote atômico', () => {
  const itens = [
    { tipo_lancamento: 'despesa', id: D1, status: 'Pago', data_efetiva: '2026-08-12' },
    { tipo_lancamento: 'despesa', id: D2, status: 'Pago', data_efetiva: '2026-08-12' },
  ];

  it('prévia individual com um único confirmation_id e sem alterar nada', async () => {
    const out = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LOTE, { itens }));
    expect(out.total_itens).toBe(2);
    expect(out.previa).toHaveLength(2);
    expect(out.previa[0].alteracoes.length).toBeGreaterThan(0);
    expect(db.rows('despesas')[0].status).toBe('A pagar');
    expect(db.rows('mcp_operacoes')).toHaveLength(1);
  });

  it('confirmação aplica todos e incrementa a versão', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LOTE, { itens }));
    const ok = payload(await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id }));
    expect(ok.itens_aplicados).toBe(2);
    expect(db.rows('despesas').slice(0, 2).map((d) => [d.status, d.versao])).toEqual([['Pago', 2], ['Pago', 2]]);
  });

  it('falha em um item não deixa metade aplicada (rollback)', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LOTE, { itens }));
    db.rows('despesas')[1].versao = 9; // conflito só no segundo item
    const r: any = await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(r.isError).toBe(true);
    expect(db.rows('despesas')[0].status).toBe('A pagar');
    expect(db.rows('despesas')[1].status).toBe('A pagar');
  });

  it('replay do lote é idempotente: a segunda confirmação falha', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ALTERACAO_LOTE, { itens }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const replay: any = await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(replay.isError).toBe(true);
    expect(db.rows('despesas')[0].versao).toBe(2);
  });

  it('IDs repetidos ou inexistentes no lote não criam operação', async () => {
    const dup: any = await call(client, TOOL.PREPARAR_ALTERACAO_LOTE, { itens: [itens[0], itens[0]] });
    expect(dup.isError).toBe(true);
    const inex: any = await call(client, TOOL.PREPARAR_ALTERACAO_LOTE, {
      itens: [{ tipo_lancamento: 'despesa', id: '99999999-9999-4999-8999-999999999999', valor: 1 }],
    });
    expect(inex.isError).toBe(true);
    expect(db.rows('mcp_operacoes')).toHaveLength(0);
  });
});

describe('cancelamento lógico', () => {
  it('cancela sem excluir, preservando o UUID', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, motivo: 'Cobrança indevida' }));
    expect(db.rows('despesas')[0].cancelado).toBe(false);
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const d = db.rows('despesas').find((x) => x.id === D1)!;
    expect(d.cancelado).toBe(true);
    expect(d.motivo_cancelamento).toBe('Cobrança indevida');
    expect(db.rows('despesas')).toHaveLength(3);
  });

  it('recusa cancelar lançamento já pago', async () => {
    const r: any = await call(client, TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D_PAGA, motivo: 'teste' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/não pode ser cancelado/i);
    expect(db.rows('despesas').find((x) => x.id === D_PAGA)!.cancelado).toBe(false);
  });

  it('recusa cancelar duas vezes', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, motivo: 'Cobrança indevida' }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const r: any = await call(client, TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO, { tipo_lancamento: 'despesa', id: D1, motivo: 'de novo' });
    expect(r.isError).toBe(true);
  });
});

describe('séries de recorrência', () => {
  it('cria série por IDs explícitos e recusa lançamento já vinculado', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_CRIACAO_SERIE, { nome: 'Anúncios Facebook', tipo: 'despesa', unidade_negocio: 'Odisseia', lancamento_ids: [D1, D2] }));
    const conf: any = await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    expect(conf.isError, conf.content[0].text).toBeFalsy();
    const novaSerie = db.rows('series_recorrencia').find((s) => s.nome === 'Anúncios Facebook')!;
    expect(db.rows('despesas')[0].serie_id).toBe(novaSerie.id);
    const r: any = await call(client, TOOL.PREPARAR_CRIACAO_SERIE, { nome: 'Outra', tipo: 'despesa', lancamento_ids: [D1] });
    expect(r.isError).toBe(true);
  });

  it('encerra a série e impede encerrar de novo, preservando os pagos', async () => {
    const prep = payload(await call(client, TOOL.PREPARAR_ENCERRAMENTO_SERIE, { serie_id: SERIE, encerrada_em: '2026-08-01', motivo: 'Seguro cancelado' }));
    await call(client, TOOL.CONFIRMAR_OPERACAO, { confirmation_id: prep.confirmation_id });
    const s = db.rows('series_recorrencia')[0];
    expect([s.ativa, s.encerrada_em]).toEqual([false, '2026-08-01']);
    expect(db.rows('despesas').find((x) => x.id === D_PAGA)!.status).toBe('Pago');
    const r: any = await call(client, TOOL.PREPARAR_ENCERRAMENTO_SERIE, { serie_id: SERIE, encerrada_em: '2026-09-01', motivo: 'x' });
    expect(r.isError).toBe(true);
  });

  it('listar_series mostra o estado das séries', async () => {
    const out = payload(await call(client, TOOL.LISTAR_SERIES, { apenas_ativas: true }));
    expect(out.total).toBe(1);
    expect(out.itens[0].nome).toBe('Seguro RC Profissional');
  });
});

describe('DRE pelo protocolo MCP', () => {
  beforeEach(async () => {
    db = seed();
    db.rows('despesas')[0].competencia = '2026-08-05';
    db.rows('receitas')[0].categoria_id = CAT_COM;
    db.rows('receitas')[0].competencia = '2026-08-02';
    client = await connect(db);
  });

  it('competência soma o reconhecido e reporta pendências de data e grupo', async () => {
    const out = payload(await call(client, TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026 }));
    expect(out.regime).toBe('competencia');
    expect(out.receita_bruta).toBe(1000);
    expect(out.despesas_fixas).toBe(400);
    expect(out.pendencias.sem_data_do_regime.quantidade).toBeGreaterThan(0);
    expect(out.pendencias.cobertura_percentual).not.toBeNull();
  });

  it('realizado só conta o efetivamente pago com data efetiva', async () => {
    const out = payload(await call(client, TOOL.GERAR_DRE_COMPETENCIA, { mes: 8, ano: 2026, regime: 'realizado' }));
    expect(out.despesas_fixas).toBe(406.53);
    expect(out.receita_bruta).toBe(0);
  });
});
