/**
 * Testes das tools de contratos do MCP (listar_contratos, obter_contrato,
 * listar_receitas_por_contrato, relatorio_contratos) via protocolo MCP real
 * contra um Supabase in-memory. Nenhum dado de produção é tocado.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../../supabase/functions/odisseia-mcp/server';
import { READ_ONLY_TOOLS, SERVER_VERSION, TOOL, TOOL_NAMES } from '../../supabase/functions/odisseia-mcp/tools';
import { calcularPareto, mediana } from '../../supabase/functions/odisseia-mcp/metrics';
import { FakeDb } from './fakeSupabase';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OUTRO_USER = '99999999-9999-4999-8999-999999999999';

const C1 = 'aaaaaaaa-0000-4000-8000-000000000001'; // Alfa — parcial
const C2 = 'aaaaaaaa-0000-4000-8000-000000000002'; // Beta — aguardando
const C3 = 'aaaaaaaa-0000-4000-8000-000000000003'; // Alfa (homônimo) — recebido
const C4 = 'aaaaaaaa-0000-4000-8000-000000000004'; // Gama — sem lançamentos
const C5 = 'aaaaaaaa-0000-4000-8000-000000000005'; // de outro usuário

function contratos() {
  return [
    {
      id: C1, user_id: USER_ID, nome: 'Alfa', unidade_negocio: 'Odisseia', data_implantacao: '2026-03-10',
      valor_contrato: 10000, observacoes: null,
      operadoras: { nome: 'Amil' }, corretor: { nome: 'Rhayssa' }, sa: { nome: 'Bruno' }, sb: null,
      supervisor_a_id: 'sup-a', supervisor_a_percentual: 5, supervisor_a_valor: null, supervisor_a_pago: true,
      supervisor_b_id: null, supervisor_b_percentual: 10, supervisor_b_valor: 999, supervisor_b_pago: true,
      corretor_id: 'ven-1', corretor_percentual: 10, corretor_valor: null, corretor_pago: true,
    },
    {
      id: C2, user_id: USER_ID, nome: 'Beta', unidade_negocio: 'Socios', data_implantacao: '2026-02-01',
      valor_contrato: 5000, observacoes: null,
      operadoras: { nome: 'Bradesco' }, corretor: null, sa: { nome: 'Welington' }, sb: null,
      supervisor_a_id: 'sup-b', supervisor_a_percentual: 5, supervisor_a_valor: 700, supervisor_a_pago: false,
      supervisor_b_id: null, supervisor_b_percentual: null, supervisor_b_valor: null, supervisor_b_pago: false,
      corretor_id: null, corretor_percentual: null, corretor_valor: null, corretor_pago: false,
    },
    {
      id: C3, user_id: USER_ID, nome: 'Alfa', unidade_negocio: null, data_implantacao: '2026-01-15',
      valor_contrato: 2000, observacoes: null,
      operadoras: { nome: 'Amil' }, corretor: { nome: 'Rhayssa' }, sa: null, sb: null,
      supervisor_a_id: null, supervisor_a_percentual: null, supervisor_a_valor: null, supervisor_a_pago: false,
      supervisor_b_id: null, supervisor_b_percentual: null, supervisor_b_valor: null, supervisor_b_pago: false,
      corretor_id: null, corretor_percentual: null, corretor_valor: null, corretor_pago: false,
    },
    {
      id: C4, user_id: USER_ID, nome: 'Gama', unidade_negocio: 'Odisseia', data_implantacao: null,
      valor_contrato: 500, observacoes: null,
      operadoras: null, corretor: null, sa: null, sb: null,
      supervisor_a_id: null, supervisor_b_id: null, corretor_id: null,
      supervisor_a_pago: false, supervisor_b_pago: false, corretor_pago: false,
    },
    {
      id: C5, user_id: OUTRO_USER, nome: 'Contrato de outro usuário', valor_contrato: 999999,
      data_implantacao: '2026-04-01', operadoras: null, corretor: null, sa: null, sb: null,
      supervisor_a_id: null, supervisor_b_id: null, corretor_id: null,
      supervisor_a_pago: false, supervisor_b_pago: false, corretor_pago: false,
    },
  ];
}

function receitas() {
  return ([
    { id: 'r1', user_id: USER_ID, contrato_id: C1, data: '2026-03-20', descricao: 'Alfa 1', valor: 6000, status: 'Recebido', operadoras: { nome: 'Amil' } },
    { id: 'r2', user_id: USER_ID, contrato_id: C1, data: '2026-04-20', descricao: 'Alfa 2', valor: 4000, status: 'Aguardando', operadoras: { nome: 'Amil' } },
    { id: 'r3', user_id: USER_ID, contrato_id: C2, data: '2026-02-10', descricao: 'Beta 1', valor: 5000, status: 'Aguardando', operadoras: { nome: 'Bradesco' } },
    { id: 'r4', user_id: USER_ID, contrato_id: C3, data: '2026-01-20', descricao: 'Alfa homônimo', valor: 2000, status: 'Recebido', operadoras: { nome: 'Amil' } },
    { id: 'r5', user_id: USER_ID, contrato_id: null, data: '2026-05-01', descricao: 'Sem contrato', valor: 1234, status: 'Recebido', operadoras: null },
    { id: 'r6', user_id: OUTRO_USER, contrato_id: C5, data: '2026-04-05', descricao: 'De outro', valor: 777, status: 'Recebido', operadoras: null },
    // Cancelado: nunca pode entrar em nenhum total de contrato.
    { id: 'r7', user_id: USER_ID, contrato_id: C1, data: '2026-05-20', descricao: 'Alfa cancelada', valor: 9999, status: 'Aguardando', operadoras: { nome: 'Amil' }, cancelado: true },
  ] as any[]).map((r) => ({ cancelado: false, ...r }));
}

function seed(extra: Record<string, any[]> = {}) {
  return new FakeDb({
    contratos: contratos(),
    receitas: receitas(),
    operadoras: [{ id: 'op-1', nome: 'Amil', ativa: true }],
    vendedores: [{ id: 'ven-1', nome: 'Rhayssa', ativo: true }],
    mcp_operacoes: [],
    ...extra,
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

let db: FakeDb;
let client: Awaited<ReturnType<typeof connect>>;

beforeEach(async () => {
  db = seed();
  client = await connect(db);
});

describe('registro das novas tools', () => {
  it('expõe 30 tools sem duplicatas e a versão canônica em initialize', async () => {
    const { tools } = await client.listTools();
    const nomes = tools.map((t) => t.name);
    expect(new Set(nomes).size).toBe(30);
    expect(nomes.sort()).toEqual([...TOOL_NAMES].sort());
    expect(client.getServerVersion()?.version).toBe(SERVER_VERSION);
  });

  it('as 4 novas tools são read-only com annotations corretas', async () => {
    const { tools } = await client.listTools();
    const novas = [TOOL.LISTAR_CONTRATOS, TOOL.OBTER_CONTRATO, TOOL.LISTAR_RECEITAS_POR_CONTRATO, TOOL.RELATORIO_CONTRATOS];
    for (const nome of novas) {
      const t = tools.find((x) => x.name === nome)!;
      expect(t, nome).toBeTruthy();
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(READ_ONLY_TOOLS).toContain(nome);
      expect(t.inputSchema).toBeTruthy();
    }
  });

  it('listar_contratos não exige id nem nome', async () => {
    const req = (await client.listTools()).tools.find((t) => t.name === TOOL.LISTAR_CONTRATOS)!.inputSchema.required ?? [];
    expect(req).toHaveLength(0);
  });
});

describe('listar_contratos', () => {
  it('lista todos os contratos do usuário, ordenados por implantação DESC NULLS LAST', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: {} }));
    expect(out.total).toBe(4);
    expect(out.has_more).toBe(false);
    expect(out.itens.map((i: any) => i.id)).toEqual([C1, C2, C3, C4]);
    expect(out.itens.every((i: any) => i.user_id === undefined)).toBe(true);
    expect(out.itens[0].producao).toBe(10000);
    expect(out.itens[0].producao_formatado).toContain('10.000');
    expect(out.producao_fonte).toBe('contratos.valor_contrato');
  });

  it('pagina com limit/offset sem misturar o total', async () => {
    const p1 = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { limit: 2 } }));
    expect(p1.itens).toHaveLength(2);
    expect(p1.has_more).toBe(true);
    const p2 = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { limit: 2, offset: 2 } }));
    expect(p2.total).toBe(4);
    expect(p2.has_more).toBe(false);
    expect(p2.itens.map((i: any) => i.id)).toEqual([C3, C4]);
  });

  it('filtra por operadora, corretor, supervisor, unidade e período', async () => {
    const op = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { operadora: 'amil' } }));
    expect(op.itens.map((i: any) => i.id)).toEqual([C1, C3]);
    const cor = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { corretor: 'Rhayssa' } }));
    expect(cor.total).toBe(2);
    const sup = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { supervisor: 'Welington' } }));
    expect(sup.itens.map((i: any) => i.id)).toEqual([C2]);
    const uni = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { unidade_negocio: 'Odisseia' } }));
    expect(uni.itens.map((i: any) => i.id)).toEqual([C1, C4]);
    const semUni = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { unidade_negocio: 'none' } }));
    expect(semUni.itens.map((i: any) => i.id)).toEqual([C3]);
    const periodo = payload(
      await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { data_implantacao_inicio: '2026-02-01', data_implantacao_fim: '2026-12-31' } }),
    );
    expect(periodo.itens.map((i: any) => i.id)).toEqual([C1, C2]);
  });

  it('deriva os 4 status financeiros e filtra por eles', async () => {
    const todos = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: {} }));
    const porId = Object.fromEntries(todos.itens.map((i: any) => [i.id, i.financeiro.status_financeiro]));
    expect(porId[C1]).toBe('parcial');
    expect(porId[C2]).toBe('aguardando');
    expect(porId[C3]).toBe('recebido');
    expect(porId[C4]).toBe('sem_lancamentos');
    for (const st of ['parcial', 'aguardando', 'recebido', 'sem_lancamentos']) {
      const f = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { status: st } }));
      expect(f.total).toBe(1);
      expect(f.itens[0].financeiro.status).toBe(st);
    }
  });

  it('homônimos com UUIDs diferentes não misturam receitas', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { operadora: 'Amil' } }));
    const alfa1 = out.itens.find((i: any) => i.id === C1);
    const alfa2 = out.itens.find((i: any) => i.id === C3);
    expect(alfa1.nome).toBe(alfa2.nome);
    expect(alfa1.financeiro.receita_prevista).toBe(10000);
    expect(alfa2.financeiro.receita_prevista).toBe(2000);
  });

  it('receita sem contrato_id não é atribuída a nenhum contrato', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: {} }));
    const soma = out.itens.reduce((a: number, i: any) => a + i.financeiro.receita_prevista, 0);
    expect(soma).toBe(17000); // 1234 da receita órfã fica de fora
  });

  it('calcula comissões, margens e percentual recebido', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: {} }));
    const c1 = out.itens.find((i: any) => i.id === C1);
    // Supervisor A: 5% de 10000 = 500 (pago); Supervisor B: sem pessoa = 0 mesmo com valor salvo;
    // Corretor: 10% de 10000 = 1000 (pago)
    expect(c1.comissoes.comissoes_previstas_total).toBe(1500);
    expect(c1.comissoes.comissoes_pagas_supervisores).toBe(500);
    expect(c1.comissoes.comissoes_pagas_corretor).toBe(1000);
    expect(c1.comissoes.comissoes_pagas_total).toBe(1500);
    expect(c1.comissoes.comissoes_pendentes).toBe(0);
    expect(c1.margens.margem_bruta_corretora).toBe(4500); // 6000 recebido - 1500
    expect(c1.margens.margem_bruta_prevista).toBe(8500);
    expect(c1.financeiro.percentual_recebido).toBe(60);

    const c2 = out.itens.find((i: any) => i.id === C2);
    // Valor salvo (700) prevalece sobre o percentual e não está pago
    expect(c2.comissoes.comissoes_previstas_total).toBe(700);
    expect(c2.comissoes.comissoes_pagas_total).toBe(0);
    expect(c2.comissoes.comissoes_pendentes).toBe(700);
    expect(c2.margens.margem_bruta_corretora).toBe(0);
    expect(c2.margens.margem_bruta_prevista).toBe(4300);

    const c4 = out.itens.find((i: any) => i.id === C4);
    expect(c4.financeiro.percentual_recebido).toBeNull();
  });
});

describe('obter_contrato e listar_receitas_por_contrato', () => {
  it('obter_contrato traz histórico ligado por UUID, ordenado por data DESC', async () => {
    const out = payload(await client.callTool({ name: TOOL.OBTER_CONTRATO, arguments: { id: C1 } }));
    expect(out.contrato.id).toBe(C1);
    expect(out.receitas.total).toBe(2);
    expect(out.receitas.itens.map((i: any) => i.receita_id)).toEqual(['r2', 'r1']);
    expect(out.receitas.itens[0].parcela).toBeNull();
    expect(out.receitas.itens[0].contrato_id).toBe(C1);
    expect(out.receitas.total_recebido).toBe(6000);
    expect(out.receitas.total_pendente).toBe(4000);
  });

  it('rejeita contrato de outro usuário', async () => {
    const r: any = await client.callTool({ name: TOOL.OBTER_CONTRATO, arguments: { id: C5 } });
    expect(r.isError).toBe(true);
  });

  it('listar_receitas_por_contrato mantém totais globais mesmo paginando', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_RECEITAS_POR_CONTRATO, arguments: { contrato_id: C1, limit: 1 } }));
    expect(out.itens).toHaveLength(1);
    expect(out.total).toBe(2);
    expect(out.has_more).toBe(true);
    expect(out.totais.receita_prevista).toBe(10000);
    expect(out.totais.receita_recebida).toBe(6000);
    expect(out.totais.status_financeiro).toBe('parcial');
  });

  it('não retorna receitas de contrato homônimo', async () => {
    const out = payload(await client.callTool({ name: TOOL.LISTAR_RECEITAS_POR_CONTRATO, arguments: { contrato_id: C3 } }));
    expect(out.itens.map((i: any) => i.receita_id)).toEqual(['r4']);
  });
});

describe('relatorio_contratos', () => {
  it('consolida sobre todo o conjunto filtrado, com faixas e Pareto', async () => {
    const out = payload(await client.callTool({ name: TOOL.RELATORIO_CONTRATOS, arguments: { limit: 1 } }));
    expect(out.consolidado.quantidade_contratos).toBe(4);
    expect(out.consolidado.producao_total).toBe(17500);
    expect(out.consolidado.producao_mediana).toBe(3500); // (2000+5000)/2
    expect(out.consolidado.receita_recebida_total).toBe(8000);
    expect(out.consolidado.receita_pendente_total).toBe(9000);
    expect(out.consolidado.comissoes_pagas_total).toBe(1500);
    expect(out.consolidado.margem_bruta_corretora).toBe(6500);
    expect(out.detalhes.itens).toHaveLength(1);
    expect(out.detalhes.total).toBe(4);

    const faixa0 = out.faixas[0];
    expect(faixa0.rotulo).toBe('[0, 1000)');
    expect(faixa0.quantidade).toBe(1); // Gama, 500
    const ultima = out.faixas[out.faixas.length - 1];
    expect(ultima.max).toBeNull();
    expect(out.faixas.reduce((a: number, f: any) => a + f.quantidade, 0)).toBe(4);

    expect(out.pareto.base).toBe('receita_recebida');
    expect(out.pareto.total).toBe(8000);
    expect(out.pareto.itens[0].contrato_id).toBe(C1);
    expect(out.pareto.itens[0].participacao).toBe(75);
    expect(out.pareto.pareto_80.quantidade).toBe(2); // 75% + 25% cruza os 80%
  });

  it('bordas de faixa são meia-abertas [atual, próxima)', async () => {
    const out = payload(await client.callTool({ name: TOOL.RELATORIO_CONTRATOS, arguments: { faixas_valor: [0, 500, 2000] } }));
    expect(out.faixas.map((f: any) => f.quantidade)).toEqual([0, 1, 3]); // 500 entra na 2ª; 2000 na última
  });

  it('rejeita faixas não crescentes', async () => {
    const r: any = await client.callTool({ name: TOOL.RELATORIO_CONTRATOS, arguments: { faixas_valor: [0, 5000, 1000] } });
    expect(r.isError).toBe(true);
  });

  it('conjunto vazio devolve zeros, percentuais nulos e sem Pareto', async () => {
    const out = payload(await client.callTool({ name: TOOL.RELATORIO_CONTRATOS, arguments: { operadora: 'Inexistente' } }));
    expect(out.consolidado.quantidade_contratos).toBe(0);
    expect(out.consolidado.producao_mediana).toBe(0);
    expect(out.pareto.total).toBe(0);
    expect(out.pareto.pareto_80).toBeNull();
    expect(out.faixas[0].percentual_contratos).toBeNull();
    expect(out.faixas[0].percentual_receita).toBeNull();
  });

  it('base de Pareto configurável e qualidade de dados', async () => {
    const out = payload(await client.callTool({ name: TOOL.RELATORIO_CONTRATOS, arguments: { base_pareto: 'producao' } }));
    expect(out.pareto.itens.map((i: any) => i.contrato_id)).toEqual([C1, C2, C3, C4]);
    expect(out.qualidade_dados.receitas_sem_contrato).toBe(1);
    expect(out.qualidade_dados.avisos.length).toBeGreaterThanOrEqual(4);
  });

  it('margem negativa é preservada', async () => {
    db.rows('receitas').forEach((r) => {
      if (r.contrato_id === C1 && r.status === 'Recebido') r.valor = 100;
    });
    const out = payload(await client.callTool({ name: TOOL.LISTAR_CONTRATOS, arguments: { status: 'parcial' } }));
    expect(out.itens[0].margens.margem_bruta_corretora).toBe(-1400);
  });
});

describe('funções puras de métrica', () => {
  it('mediana ímpar e par', () => {
    expect(mediana([1, 3, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });

  it('Pareto desempata por contrato_id e trata total zero', () => {
    const mk = (id: string, v: number) => ({ contrato_id: id, receita_recebida: v, receita_prevista: v, producao: v, saida: { nome: id } } as any);
    const p = calcularPareto([mk('b', 10), mk('a', 10)], 'receita_recebida');
    expect(p.itens.map((i) => i.contrato_id)).toEqual(['a', 'b']);
    const zero = calcularPareto([mk('a', 0), mk('b', 0)], 'receita_recebida');
    expect(zero.itens[0].participacao).toBeNull();
    expect(zero.pareto_80).toBeNull();
  });
});

describe('preparar_criacao_receita com contrato_id', () => {
  const base = {
    data: '2026-08-10',
    descricao: 'Nova receita ligada',
    categoria: 'Plano de Saúde',
    operadora: 'Amil',
    vendedor: 'Rhayssa',
    valor: 1500,
  };

  it('só persiste após a confirmação e grava o contrato_id', async () => {
    const antes = db.rows('receitas').length;
    const prep = payload(await client.callTool({ name: TOOL.PREPARAR_CRIACAO_RECEITA, arguments: { ...base, contrato_id: C1 } }));
    expect(prep.depois.contrato_id).toBe(C1);
    expect(db.rows('receitas')).toHaveLength(antes);
    const ok = payload(await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } }));
    expect(ok.status).toBe('executed');
    const nova = db.rows('receitas').find((r) => r.descricao === base.descricao);
    expect(nova.contrato_id).toBe(C1);

    const lista = payload(await client.callTool({ name: TOOL.LISTAR_RECEITAS_POR_CONTRATO, arguments: { contrato_id: C1 } }));
    expect(lista.total).toBe(3);
  });

  it('contrato inexistente ou de outro usuário é rejeitado sem criar operação', async () => {
    const ops = db.rows('mcp_operacoes').length;
    const r1: any = await client.callTool({ name: TOOL.PREPARAR_CRIACAO_RECEITA, arguments: { ...base, contrato_id: C5 } });
    expect(r1.isError).toBe(true);
    const r2: any = await client.callTool({
      name: TOOL.PREPARAR_CRIACAO_RECEITA,
      arguments: { ...base, contrato_id: 'bbbbbbbb-0000-4000-8000-000000000009' },
    });
    expect(r2.isError).toBe(true);
    expect(db.rows('mcp_operacoes')).toHaveLength(ops);
  });

  it('chamada antiga sem contrato_id continua funcionando', async () => {
    const prep = payload(await client.callTool({ name: TOOL.PREPARAR_CRIACAO_RECEITA, arguments: base }));
    expect(prep.depois.contrato_id).toBeNull();
    const ok = payload(await client.callTool({ name: TOOL.CONFIRMAR_OPERACAO, arguments: { confirmation_id: prep.confirmation_id } }));
    expect(ok.status).toBe('executed');
  });
});
