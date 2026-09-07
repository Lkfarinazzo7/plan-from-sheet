// Registro das tools do MCP Financeiro Odisseia.
// Isolado do handler HTTP para permitir testes por protocolo com dependências injetadas.
import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js';
import { z } from 'npm:zod@3.23.8';

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  assertNoIdentityArgs,
  buildDiff,
  canConfirm,
  clampLimit,
  clampOffset,
  dateFields,
  describeDiff,
  expiresAtFrom,
  MSG_DATA_INVALIDA,
  formatDateBR,
  isDataValida,
  money,
  resolveRange,
  sanitize,
} from './logic.ts';
import {
  AVISOS_QUALIDADE,
  type BasePareto,
  type ContratoRow,
  FAIXAS_PADRAO,
  PRODUCAO_FONTE,
  type ReceitaRow,
  STATUS_FINANCEIRO,
  calcularFaixas,
  calcularPareto,
  media,
  mediana,
  moneyPair,
  montarContrato,
  num,
  ordenarContratos,
  ordenarReceitas,
  receitaItem,
  round2,
} from './metrics.ts';
import { GRUPOS_DRE, STATUS_CANCELADO, type LancamentoDRE, type Regime, calcularDRE, calcularFluxoCaixa, grupoDeCategoria, grupoEfetivo } from './dre.ts';
import { SERVER_NAME, SERVER_VERSION, TOOL } from './tools.ts';
import { passaFiltros, cancelado, liquidado, emAberto, statusIndefinido } from './dre.ts';

/** Cliente Supabase (injetável — em testes usamos um adapter in-memory). */
// deno-lint-ignore no-explicit-any
export type SupabaseLike = any;

export type Ctx = { supabase: SupabaseLike; userId: string; email: string | null };

const text = (data: unknown) => ({
  content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});

const fail = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: `Erro: ${message}` }],
});

const RO = { readOnlyHint: true, openWorldHint: false } as const;
const RO_STRICT = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const RW_PREP = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const RW_CONFIRM = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

/** Data de calendário real (a regex sozinha aceitaria 2026-02-31). */
const dataStr = (desc: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDataValida, MSG_DATA_INVALIDA).describe(desc);

const periodoShape = {
  mes: z.number().int().min(1).max(12).optional().describe('Mês (1-12). Use junto com "ano".'),
  ano: z.number().int().min(2000).max(2100).optional().describe('Ano (ex.: 2026).'),
  data_inicio: dataStr('Data inicial YYYY-MM-DD.').optional(),
  data_fim: dataStr('Data final YYYY-MM-DD.').optional(),
};
const unidadeShape = {
  unidade: z.string().optional().describe('Unidade de negócio. Use "none" para lançamentos sem unidade.'),
};
const pageShape = {
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Máx. ${MAX_LIMIT} (padrão ${DEFAULT_LIMIT}).`),
  offset: z.number().int().min(0).optional().describe('Deslocamento para paginação.'),
};

function applyPeriodo(q: any, args: any, coluna = 'data') {
  const r = resolveRange(args);
  if (r) q = q.gte(coluna, r.sd).lte(coluna, r.ed);
  return q;
}
function applyUnidade(q: any, unidade?: string) {
  if (!unidade || unidade === 'all') return q;
  if (unidade === 'none') return q.is('unidade_negocio', null);
  return q.eq('unidade_negocio', unidade);
}

async function todos<T>(q: any): Promise<T[]> {
  const rows: T[] = [];
  q = q.order('id', { ascending: true });
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await q.range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

type PlanoInsert = { tabela: string; row: Record<string, unknown>; ref?: string; refs?: Record<string, string> };
type PlanoUpdate = { tabela: string; id: string; versao: number | null; patch: Record<string, unknown>; refs?: Record<string, string> };
type Plano = { inserts: PlanoInsert[]; updates: PlanoUpdate[] };

/**
 * Traduz o payload da PRÉVIA no plano de gravação. Roda no PREPARO e é persistido:
 * a confirmação nunca aceita conteúdo vindo do cliente.
 */
export function planoDaOperacao(tool: string, after: any, userId: string): Plano {
  const plano: Plano = { inserts: [], updates: [] };
  if (tool === TOOL.PREPARAR_ALTERACAO_LOTE) {
    plano.updates = (after?.itens ?? []).map((i: any) => ({ tabela: i.tabela, id: i.id, versao: i.versao ?? null, patch: i.patch }));
  } else if (tool === TOOL.PREPARAR_CRIACAO_RECEITA) {
    plano.inserts.push({ tabela: 'receitas', row: { ...after, comissao: 0, user_id: userId } });
  } else if (tool === TOOL.PREPARAR_CRIACAO_DESPESA) {
    plano.inserts.push({ tabela: 'despesas', row: { ...after, user_id: userId } });
  } else if (
    tool === TOOL.PREPARAR_ALTERACAO_LANCAMENTO ||
    tool === TOOL.PREPARAR_MARCACAO_STATUS ||
    tool === TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO ||
    tool === TOOL.PREPARAR_ALTERACAO_CATEGORIA ||
    tool === TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA ||
    tool === TOOL.PREPARAR_ENCERRAMENTO_SERIE
  ) {
    plano.updates.push({ tabela: after.tabela, id: after.id, versao: after.versao ?? null, patch: after.updates });
  } else if (tool === TOOL.PREPARAR_CRIACAO_CATEGORIA || tool === TOOL.PREPARAR_CRIACAO_SUBCATEGORIA) {
    plano.inserts.push({ tabela: after.tabela, row: after.payload });
  } else if (tool === TOOL.PREPARAR_CRIACAO_SERIE) {
    plano.inserts.push({ tabela: 'series_recorrencia', row: { ...after.payload, user_id: userId }, ref: 'serie' });
    for (const item of after.lancamentos ?? []) {
      plano.updates.push({ tabela: item.tabela, id: item.id, versao: item.versao ?? null, patch: {}, refs: { serie_id: 'serie' } });
    }
  } else {
    throw new Error(`Tipo de operação não suportado: ${tool}`);
  }
  const total = plano.inserts.length + plano.updates.length;
  if (total === 0) throw new Error('Nada a executar: a prévia ficou vazia.');
  if (total > 200) throw new Error(`Prévia com ${total} itens excede o limite de 200.`);
  const vistos = new Set<string>();
  for (const u of plano.updates) {
    if (!u.id) throw new Error('Alteração sem identificador na prévia.');
    const chave = `${u.tabela}:${u.id}`;
    if (vistos.has(chave)) throw new Error(`Registro repetido na prévia: ${u.id}.`);
    vistos.add(chave);
  }
  return plano;
}

/** Cancelado é histórico: nunca entra em soma, ranking, contrato ou fluxo. */
function semCancelados(q: any) {
  return q.eq('cancelado', false);
}

async function registrarOperacao(
  ctx: Ctx,
  toolName: string,
  args: Record<string, unknown>,
  before: unknown,
  after: unknown,
  summary: string,
) {
  const expires_at = expiresAtFrom();
  // O plano vai gravado junto com a prévia e é imutável (a coluna não pode ser alterada por quem confirma).
  const plano = planoDaOperacao(toolName, after, ctx.userId);
  const { data, error } = await ctx.supabase
    .from('mcp_operacoes')
    .insert({
      user_id: ctx.userId,
      tool_name: toolName,
      status: 'pending',
      arguments: args as any,
      before_data: (before ?? null) as any,
      after_data: (after ?? null) as any,
      plano: plano as any,
      item_count: plano.inserts.length + plano.updates.length,
      summary,
      expires_at,
    })
    .select('id, tool_name, status, summary, expires_at, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------------------------------------ registro tools

export function buildServer(ctx: Ctx) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Servidor MCP do sistema Financeiro Odisseia (corretora de seguros, pt-BR, valores em BRL). ' +
        'SEMPRE consulte os dados (listar/consultar/buscar) antes de propor qualquer alteração. ' +
        'NUNCA execute uma mudança sem confirmação explícita do usuário: use as ferramentas "preparar_*" para gerar ' +
        'um resumo antes/depois com um confirmation_id, apresente esse resumo ao usuário e só então chame ' +
        '"confirmar_operacao" com o confirmation_id, depois de o usuário concordar de forma clara. ' +
        'Operações pendentes expiram em 10 minutos. Não existe exclusão de lançamentos nesta versão. ' +
        'Datas são strings YYYY-MM-DD (horário local do Brasil, sem conversão UTC).',
    },
  );

  // ============================ LEITURA ============================

  server.registerTool(
    TOOL.CONSULTAR_DASHBOARD,
    {
      title: 'Consultar dashboard financeiro',
      description: 'Totais cadastrais por data original, separados do caixa realizado por data efetiva. Cancelados excluídos; desconhecidos sinalizados e nunca considerados pendentes.',
      inputSchema: { ...periodoShape, ...unidadeShape, setor: z.string().optional().describe('Setor, ou none para ausência.') },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const r = resolveRange(args);
        if (!r) return fail('Informe mes+ano ou data_inicio+data_fim.');
        const lancamentos = await carregarLancamentos();
        const filtros = { unidade: args.unidade ?? null, setor: args.setor ?? null };
        const fluxo = calcularFluxoCaixa(lancamentos, { inicio: r.sd, fim: r.ed, filtros });
        const cadastros = lancamentos.filter(l => passaFiltros(l, filtros) && !cancelado(l) && l.data_legada && l.data_legada >= r.sd && l.data_legada <= r.ed);
        const receitas = cadastros.filter(l => l.origem === 'receita'), despesas = cadastros.filter(l => l.origem === 'despesa');
        const soma = (arr: LancamentoDRE[]) => round2(arr.reduce((a, x) => a + num(x.valor), 0));
        const desconhecidos = (arr: LancamentoDRE[]) => {
          const rows = arr.filter(statusIndefinido);
          return { quantidade: rows.length, valor: soma(rows) };
        };
        const totalReceitas = soma(receitas), totalDespesas = soma(despesas);
        return text({
          periodo: { inicio: r.sd, fim: r.ed, inicio_formatado: formatDateBR(r.sd), fim_formatado: formatDateBR(r.ed) },
          unidade: args.unidade ?? 'all', setor: args.setor ?? 'all',
          base_temporal: {
            totais_e_pendentes_cadastrais: 'data original do lançamento; não é competência nem caixa realizado',
            recebido_pago_e_saldo_realizado: 'data_recebimento ou data_pagamento efetivamente cadastrada',
          },
          receitas: {
            total: money(totalReceitas), recebido: money(fluxo.entradas_realizadas),
            recebido_dos_cadastros: money(soma(receitas.filter(liquidado))),
            pendente: money(soma(receitas.filter(emAberto))), quantidade: receitas.length,
          },
          despesas: {
            total: money(totalDespesas), pago: money(fluxo.saidas_realizadas),
            pago_dos_cadastros: money(soma(despesas.filter(liquidado))),
            pendente: money(soma(despesas.filter(emAberto))), quantidade: despesas.length,
          },
          saldo: money(totalReceitas - totalDespesas), saldo_realizado: money(fluxo.saldo_realizado),
          qualidade_dados: {
            ...fluxo.pendencias,
            status_indefinido_nos_cadastros: { receitas: desconhecidos(receitas), despesas: desconhecidos(despesas) },
            aviso: 'Totais de cadastro e caixa realizado possuem bases temporais distintas. Sem data efetiva, não entra no realizado; status desconhecido nunca vira pendência presumida.',
          },
        });
      } catch (e) { return fail((e as Error).message); }
    },
  );

  const dreShape = {
    ...periodoShape, ...unidadeShape,
    regime: z.enum(['competencia', 'realizado', 'projetado']).optional().describe('Padrão: competencia. Cada regime usa sua data específica.'),
    setor: z.string().optional().describe('Nome do setor, ou none para ausência. Filtra receitas e despesas.'),
    usar_data_legada: z.boolean().optional().describe('Compatibilidade explícita, padrão false. Não grava datas; os valores inferidos são sinalizados.'),
    usar_classificacao_legada: z.boolean().optional().describe('Compatibilidade explícita, padrão false. Não reclassifica o banco.'),
  };

  async function cadastrosFinanceiros() {
    const [categorias, subcategorias, setores] = await Promise.all([
      todos<any>(ctx.supabase.from('categorias_despesa').select('*')),
      todos<any>(ctx.supabase.from('subcategorias_despesa').select('*')),
      todos<any>(ctx.supabase.from('setores_despesa').select('*')),
    ]);
    const map = (rows: any[]) => new Map(rows.map(x => [x.id, x]));
    return { categorias: map(categorias), subcategorias: map(subcategorias), setores: map(setores) };
  }

  async function carregarLancamentos(usarLegado = false): Promise<LancamentoDRE[]> {
    const [cad, receitas, despesas] = await Promise.all([
      cadastrosFinanceiros(),
      todos<any>(ctx.supabase.from('receitas').select('*')),
      todos<any>(ctx.supabase.from('despesas').select('*')),
    ]);
    const transformar = (x: any, origem: 'receita' | 'despesa'): LancamentoDRE => {
      const cat = cad.categorias.get(x.categoria_id) ?? x.categorias_despesa;
      const sub = cad.subcategorias.get(x.subcategoria_id) ?? x.subcategorias_despesa;
      return {
        id: x.id, origem, valor: x.valor, status: x.status, cancelado: x.cancelado ?? false,
        competencia: x.competencia ?? null, vencimento: x.vencimento ?? null,
        data_efetiva: (origem === 'receita' ? x.data_recebimento : x.data_pagamento) ?? null,
        data_legada: x.data ?? null,
        grupo: grupoEfetivo(cat, sub) ?? (usarLegado && origem === 'despesa' ? grupoDeCategoria(cat, true) : null),
        unidade_negocio: x.unidade_negocio ?? null,
        setor: cad.setores.get(x.setor_id)?.nome ?? x.setores_despesa?.nome ?? null,
      };
    };
    return [...receitas.map(x => transformar(x, 'receita')), ...despesas.map(x => transformar(x, 'despesa'))];
  }

  async function gerarDre(args: any) {
    try {
      assertNoIdentityArgs(args);
      const range = resolveRange(args);
      if (!range) return fail('Informe mes+ano ou data_inicio+data_fim.');
      const resultado = calcularDRE(await carregarLancamentos(args.usar_classificacao_legada === true), {
        regime: (args.regime ?? 'competencia') as Regime, inicio: range.sd, fim: range.ed,
        filtros: { unidade: args.unidade ?? null, setor: args.setor ?? null },
        fallbackDataLegada: args.usar_data_legada === true,
      });
      return text(sanitize({ ...resultado, unidade: args.unidade ?? 'all', setor: args.setor ?? 'all',
        classificacao_legada_solicitada: args.usar_classificacao_legada === true }));
    } catch (e) { return fail((e as Error).message); }
  }

  server.registerTool(TOOL.GERAR_DRE, {
    title: 'Gerar DRE do período',
    description: 'DRE gerencial por competência (padrão), caixa realizado ou projetado. Mesmo motor de gerar_dre_competencia e da tela. Dados sem data/grupo são pendências; contribuição vem antes dos fixos.',
    inputSchema: dreShape, annotations: RO_STRICT,
  }, gerarDre);

  server.registerTool(TOOL.CONSULTAR_FLUXO_CAIXA, {
    title: 'Consultar fluxo de caixa',
    description: 'Caixa realizado por pagamento/recebimento efetivo e projetado por vencimento em aberto. Vencidos anteriores separados, cancelados excluídos, ausências sinalizadas. Inclui investimentos e principal fora do DRE.',
    inputSchema: { ...periodoShape, ...unidadeShape,
      setor: z.string().optional(),
      visao: z.enum(['realizado', 'projetado']).optional().describe('Padrão realizado. Nunca substitui competência ou data efetiva por data legada.'),
    }, annotations: RO_STRICT,
  }, async (args) => {
    try {
      assertNoIdentityArgs(args);
      const range = resolveRange(args);
      if (!range) return fail('Informe mes+ano ou data_inicio+data_fim.');
      const fluxo = calcularFluxoCaixa(await carregarLancamentos(), {
        inicio: range.sd, fim: range.ed, filtros: { unidade: args.unidade ?? null, setor: args.setor ?? null },
      });
      return text({ ...fluxo, unidade: args.unidade ?? 'all', setor: args.setor ?? 'all',
        visao: args.visao ?? 'realizado',
        entradas_realizadas: money(fluxo.entradas_realizadas), saidas_realizadas: money(fluxo.saidas_realizadas),
        saldo_realizado: money(fluxo.saldo_realizado),
        entradas_previstas: money(fluxo.entradas_previstas), saidas_previstas: money(fluxo.saidas_previstas),
        saldo_projetado: money(fluxo.saldo_total),
      });
    } catch (e) { return fail((e as Error).message); }
  });

  const filtrosLancamento = {
    ...periodoShape, ...unidadeShape, ...pageShape,
    status: z.string().optional(),
    categoria: z.string().optional().describe('Nome parcial da categoria.'),
    subcategoria: z.string().optional().describe('Nome parcial da subcategoria.'),
    setor: z.string().optional().describe('Nome parcial do setor, ou none.'),
    responsavel: z.string().optional(),
    busca: z.string().optional().describe('Texto na descrição.'),
    incluir_cancelados: z.boolean().optional().describe('Padrão false. true permite revisar o histórico cancelado.'),
  };

  async function listarLancamentos(origem: 'receita' | 'despesa', args: any) {
    try {
      assertNoIdentityArgs(args);
      const tabela = origem === 'receita' ? 'receitas' : 'despesas';
      const select = origem === 'receita' ? '*, vendedores(nome), operadoras(nome)' : '*';
      let q = applyUnidade(applyPeriodo(ctx.supabase.from(tabela).select(select), args), args.unidade);
      if (args.status) q = q.eq('status', args.status);
      if (args.tipo) q = q.eq('tipo', args.tipo);
      if (args.responsavel) q = q.ilike('responsavel', '%' + args.responsavel + '%');
      if (args.busca) q = q.ilike('descricao', '%' + args.busca + '%');
      const [rows, cad] = await Promise.all([todos<any>(q), cadastrosFinanceiros()]);
      let itens = rows.filter(x => args.incluir_cancelados === true || (!x.cancelado && !STATUS_CANCELADO.includes(String(x.status))))
        .map(x => {
          const cat = cad.categorias.get(x.categoria_id) ?? x.categorias_despesa;
          const sub = cad.subcategorias.get(x.subcategoria_id) ?? x.subcategorias_despesa;
          return {
            ...x, ...dateFields(x.data), ...money(x.valor),
            categoria: cat?.nome ?? (origem === 'receita' ? x.categoria : null) ?? null,
            categoria_id: x.categoria_id ?? null, subcategoria_id: x.subcategoria_id ?? null,
            subcategoria: sub?.nome ?? null, grupo_dre: grupoEfetivo(cat, sub),
            tipo_dre: cat?.tipo_dre ?? null,
            setor_id: x.setor_id ?? null, setor: cad.setores.get(x.setor_id)?.nome ?? x.setores_despesa?.nome ?? null,
            responsavel: x.responsavel ?? null, recorrente: x.recorrente ?? false,
            competencia: x.competencia ?? null, vencimento: x.vencimento ?? null,
            data_pagamento: x.data_pagamento ?? null, data_recebimento: x.data_recebimento ?? null,
            data_efetiva: (origem === 'receita' ? x.data_recebimento : x.data_pagamento) ?? null,
            cancelado: x.cancelado ?? false, serie_id: x.serie_id ?? null, ocorrencia: x.ocorrencia ?? null, versao: x.versao ?? null,
            contrato_id: x.contrato_id ?? null,
            vendedor: x.vendedores?.nome ?? null, operadora: x.operadoras?.nome ?? null,
          };
        });
      // Filtros por referência são aplicados ANTES da contagem e da paginação.
      for (const key of ['categoria', 'subcategoria', 'setor', 'vendedor', 'operadora']) {
        if (!args[key] || args[key] === 'all') continue;
        itens = itens.filter(x => args[key] === 'none' ? !x[key] : String(x[key] ?? '').toLocaleLowerCase('pt-BR').includes(String(args[key]).toLocaleLowerCase('pt-BR')));
      }
      itens.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')) || String(a.id).localeCompare(String(b.id)));
      const total = itens.length, limit = clampLimit(args.limit), offset = clampOffset(args.offset);
      return text({ total_encontrado: total, limit, offset, itens: sanitize(itens.slice(offset, offset + limit)) });
    } catch (e) { return fail((e as Error).message); }
  }

  server.registerTool(TOOL.LISTAR_RECEITAS, {
    title: 'Listar receitas', description: 'Lista receitas com categoria/subcategoria/grupo, setor/unidade, datas explícitas, vínculo por contrato_id e estado de cancelamento. Filtros precedem paginação.',
    inputSchema: { ...filtrosLancamento, vendedor: z.string().optional(), operadora: z.string().optional() }, annotations: RO_STRICT,
  }, args => listarLancamentos('receita', args));

  server.registerTool(TOOL.LISTAR_DESPESAS, {
    title: 'Listar despesas', description: 'Lista despesas incluindo tipo Fixo/Variável, categoria/subcategoria/grupo, setor/unidade, datas explícitas, recorrência e versão. Filtros precedem paginação.',
    inputSchema: { ...filtrosLancamento, tipo: z.string().optional() }, annotations: RO_STRICT,
  }, args => listarLancamentos('despesa', args));

  server.registerTool(
    TOOL.BUSCAR_CONTRATO,
    {
      title: 'Buscar contrato',
      description: 'Busca contratos por id ou nome, com operadora, corretor, supervisores, valores e status das comissões.',
      inputSchema: {
        id: z.string().uuid().optional().describe('ID do contrato.'),
        nome: z.string().optional().describe('Nome (parcial) do contrato/cliente.'),
        ...pageShape,
      },
      annotations: RO,
    },
    async (args) => {
      assertNoIdentityArgs(args);
      if (!args.id && !args.nome) return fail('Informe "id" ou "nome".');
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      let q = ctx.supabase
        .from('contratos')
        .select('*, operadoras(nome), corretor:vendedores!contratos_corretor_id_fkey(nome), sa:supervisores!contratos_supervisor_a_id_fkey(nome), sb:supervisores!contratos_supervisor_b_id_fkey(nome)', { count: 'exact' })
        .order('data_implantacao', { ascending: false });
      if (args.id) q = q.eq('id', args.id);
      if (args.nome) q = q.ilike('nome', `%${args.nome}%`);
      const { data, error, count } = await q.range(offset, offset + limit - 1);
      if (error) return fail(error.message);
      const itens = (data || []).map((c: any) => ({
        id: c.id,
        nome: c.nome,
        operadora: c.operadoras?.nome ?? null,
        unidade_negocio: c.unidade_negocio,
        data_implantacao: c.data_implantacao,
        data_implantacao_formatada: formatDateBR(c.data_implantacao),
        valor_contrato: money(c.valor_contrato),
        observacoes: c.observacoes,
        comissoes: [
          { papel: 'Supervisor A', pessoa: c.sa?.nome ?? null, percentual: c.supervisor_a_percentual, ...money(c.supervisor_a_valor), pago: c.supervisor_a_pago },
          { papel: 'Supervisor B', pessoa: c.sb?.nome ?? null, percentual: c.supervisor_b_percentual, ...money(c.supervisor_b_valor), pago: c.supervisor_b_pago },
          { papel: 'Corretor', pessoa: c.corretor?.nome ?? null, percentual: c.corretor_percentual, ...money(c.corretor_valor), pago: c.corretor_pago },
        ].filter((x) => x.pessoa),
      }));
      return text({ total_encontrado: count ?? itens.length, limit, offset, itens: sanitize(itens) });
    },
  );

  // ================= CONTRATOS (vínculo por receitas.contrato_id) =================

  const CONTRATO_SELECT =
    'id, nome, unidade_negocio, data_implantacao, valor_contrato, observacoes, ' +
    'supervisor_a_id, supervisor_a_percentual, supervisor_a_valor, supervisor_a_pago, ' +
    'supervisor_b_id, supervisor_b_percentual, supervisor_b_valor, supervisor_b_pago, ' +
    'corretor_id, corretor_percentual, corretor_valor, corretor_pago, ' +
    'operadoras(nome), corretor:vendedores!contratos_corretor_id_fkey(nome), ' +
    'sa:supervisores!contratos_supervisor_a_id_fkey(nome), sb:supervisores!contratos_supervisor_b_id_fkey(nome)';

  const RECEITA_SELECT = 'id, contrato_id, data, competencia, vencimento, data_recebimento, descricao, valor, status, cancelado, operadoras(nome)';

  const BATCH = 1000;

  /**
   * Lê em lotes para nunca esbarrar no teto de 1000 linhas do PostgREST.
   * O builder DEVE aplicar uma ordem estável (ex.: .order('id')) — caso contrário
   * a paginação acima de 1000 linhas pode repetir ou perder registros.
   */
  async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
    const out: any[] = [];
    for (let from = 0; ; from += BATCH) {
      const { data, error } = await build(from, from + BATCH - 1);
      if (error) throw new Error(error.message);
      const rows = data || [];
      out.push(...rows);
      if (rows.length < BATCH) break;
    }
    return out;
  }

  function mapContrato(c: any): ContratoRow {
    return {
      id: c.id,
      nome: c.nome,
      unidade_negocio: c.unidade_negocio ?? null,
      data_implantacao: c.data_implantacao ?? null,
      valor_contrato: c.valor_contrato ?? 0,
      observacoes: c.observacoes ?? null,
      operadora_nome: c.operadoras?.nome ?? null,
      corretor_nome: c.corretor?.nome ?? null,
      supervisor_a_nome: c.sa?.nome ?? null,
      supervisor_b_nome: c.sb?.nome ?? null,
      supervisor_a_id: c.supervisor_a_id ?? null,
      supervisor_a_percentual: c.supervisor_a_percentual ?? null,
      supervisor_a_valor: c.supervisor_a_valor ?? null,
      supervisor_a_pago: !!c.supervisor_a_pago,
      supervisor_b_id: c.supervisor_b_id ?? null,
      supervisor_b_percentual: c.supervisor_b_percentual ?? null,
      supervisor_b_valor: c.supervisor_b_valor ?? null,
      supervisor_b_pago: !!c.supervisor_b_pago,
      corretor_id: c.corretor_id ?? null,
      corretor_percentual: c.corretor_percentual ?? null,
      corretor_valor: c.corretor_valor ?? null,
      corretor_pago: !!c.corretor_pago,
    };
  }

  function mapReceita(r: any): ReceitaRow {
    return {
      id: r.id,
      contrato_id: r.contrato_id ?? null,
      cancelado: r.cancelado ?? false,
      competencia: r.competencia ?? null,
      vencimento: r.vencimento ?? null,
      data_recebimento: r.data_recebimento ?? null,
      data: r.data ?? null,
      descricao: r.descricao ?? null,
      valor: num(r.valor),
      status: r.status ?? null,
      operadora_nome: r.operadoras?.nome ?? null,
    };
  }

  const contem = (valor: string | null | undefined, filtro?: string) =>
    !filtro || String(valor ?? '').toLowerCase().includes(filtro.toLowerCase());

  const contratoFiltrosShape = {
    data_implantacao_inicio: dataStr('Data inicial de implantação (YYYY-MM-DD).').optional(),
    data_implantacao_fim: dataStr('Data final de implantação (YYYY-MM-DD).').optional(),
    operadora: z.string().optional().describe('Nome (parcial) da operadora.'),
    corretor: z.string().optional().describe('Nome (parcial) do corretor.'),
    supervisor: z.string().optional().describe('Nome (parcial) do supervisor (A ou B).'),
    unidade_negocio: z.string().optional().describe('Unidade de negócio. Use "none" para contratos sem unidade.'),
    status: z.enum(['sem_lancamentos', 'aguardando', 'parcial', 'recebido']).optional()
      .describe('Status FINANCEIRO derivado dos lançamentos ligados (não é campo cadastral).'),
  };

  /** Carrega todos os contratos do usuário que atendem aos filtros (antes de paginar). */
  async function carregarContratosFiltrados(args: any) {
    const contratos = (
      await fetchAll((from, to) => {
        let q = ctx.supabase.from('contratos').select(CONTRATO_SELECT).eq('user_id', ctx.userId);
        if (args.data_implantacao_inicio) q = q.gte('data_implantacao', args.data_implantacao_inicio);
        if (args.data_implantacao_fim) q = q.lte('data_implantacao', args.data_implantacao_fim);
        if (args.unidade_negocio === 'none') q = q.is('unidade_negocio', null);
        else if (args.unidade_negocio) q = q.eq('unidade_negocio', args.unidade_negocio);
        // Ordem estável obrigatória: sem ela, páginas > 1000 podem repetir ou pular linhas.
        return q.order('id', { ascending: true }).range(from, to);
      })
    ).map(mapContrato);

    const filtrados = contratos.filter(
      (c) =>
        contem(c.operadora_nome, args.operadora) &&
        contem(c.corretor_nome, args.corretor) &&
        (!args.supervisor || contem(c.supervisor_a_nome, args.supervisor) || contem(c.supervisor_b_nome, args.supervisor)),
    );

    const receitas = (
      await fetchAll((from, to) =>
        ctx.supabase.from('receitas').select(RECEITA_SELECT).eq('user_id', ctx.userId).eq('cancelado', false).not('contrato_id', 'is', null).order('id', { ascending: true }).range(from, to),
      )
    ).filter(x => !x.cancelado && !STATUS_CANCELADO.includes(String(x.status))).map(mapReceita);

    const porContrato = new Map<string, ReceitaRow[]>();
    for (const r of receitas) {
      if (!r.contrato_id) continue;
      const cur = porContrato.get(r.contrato_id) || [];
      cur.push(r);
      porContrato.set(r.contrato_id, cur);
    }

    let metricas = ordenarContratos(filtrados).map((c) => montarContrato(c, porContrato.get(c.id) || []));
    if (args.status) metricas = metricas.filter((m) => m.status_financeiro === args.status);
    return metricas;
  }

  async function contarReceitasSemContrato(): Promise<number> {
    const rows = await todos<any>(ctx.supabase.from('receitas').select('id, status, cancelado')
      .eq('user_id', ctx.userId).is('contrato_id', null));
    return rows.filter(r => !cancelado({ ...r, origem: 'receita' })).length;
  }

  async function carregarContrato(id: string): Promise<ContratoRow | null> {
    const { data, error } = await ctx.supabase
      .from('contratos')
      .select(CONTRATO_SELECT)
      .eq('user_id', ctx.userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapContrato(data) : null;
  }

  async function carregarReceitasDoContrato(contratoId: string): Promise<ReceitaRow[]> {
    const rows = await fetchAll((from, to) =>
      ctx.supabase.from('receitas').select(RECEITA_SELECT).eq('user_id', ctx.userId).eq('cancelado', false).eq('contrato_id', contratoId).order('id', { ascending: true }).range(from, to),
    );
    return ordenarReceitas(rows.filter(x => !x.cancelado && !STATUS_CANCELADO.includes(String(x.status))).map(mapReceita));
  }

  server.registerTool(
    TOOL.LISTAR_CONTRATOS,
    {
      title: 'Listar contratos com métricas financeiras',
      description:
        'Lista contratos (sem exigir id ou nome) com filtros opcionais, produção, receita prevista/recebida/pendente, ' +
        'comissões e margens. O vínculo com receitas é feito exclusivamente por contrato_id.',
      inputSchema: { ...contratoFiltrosShape, ...pageShape },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const limit = clampLimit(args.limit);
        const offset = clampOffset(args.offset);
        const metricas = await carregarContratosFiltrados(args);
        const pagina = metricas.slice(offset, offset + limit);
        return text({
          total: metricas.length,
          limit,
          offset,
          has_more: offset + pagina.length < metricas.length,
          producao_fonte: PRODUCAO_FONTE,
          status_disponiveis: STATUS_FINANCEIRO,
          itens: sanitize(pagina.map((m) => m.saida)),
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.OBTER_CONTRATO,
    {
      title: 'Obter contrato',
      description: 'Detalha um contrato: cadastro, resumo financeiro, comissões e histórico de receitas ligadas por contrato_id.',
      inputSchema: { id: z.string().uuid().describe('ID do contrato.') },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const contrato = await carregarContrato(args.id);
        if (!contrato) return fail('Contrato não encontrado ou sem acesso.');
        const receitas = await carregarReceitasDoContrato(args.id);
        const m = montarContrato(contrato, receitas);
        return text({
          contrato: sanitize(m.saida),
          receitas: {
            total: receitas.length,
            ...moneyPair('total_valor', round2(receitas.reduce((a, r) => a + num(r.valor), 0))),
            ...moneyPair('total_recebido', m.receita_recebida),
            ...moneyPair('total_pendente', m.receita_pendente),
            itens: sanitize(receitas.map(receitaItem)),
          },
          avisos: AVISOS_QUALIDADE,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.LISTAR_RECEITAS_POR_CONTRATO,
    {
      title: 'Listar receitas de um contrato',
      description: 'Lista os lançamentos de receita ligados a um contrato por contrato_id (nunca por texto), com totais globais.',
      inputSchema: { contrato_id: z.string().uuid().describe('ID do contrato.'), ...pageShape },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const contrato = await carregarContrato(args.contrato_id);
        if (!contrato) return fail('Contrato não encontrado ou sem acesso.');
        const limit = clampLimit(args.limit);
        const offset = clampOffset(args.offset);
        const receitas = await carregarReceitasDoContrato(args.contrato_id);
        const m = montarContrato(contrato, receitas);
        const pagina = receitas.slice(offset, offset + limit);
        return text({
          contrato_id: args.contrato_id,
          contrato: contrato.nome,
          total: receitas.length,
          limit,
          offset,
          has_more: offset + pagina.length < receitas.length,
          totais: {
            ...moneyPair('receita_prevista', m.receita_prevista),
            ...moneyPair('receita_recebida', m.receita_recebida),
            ...moneyPair('receita_pendente', m.receita_pendente),
            status_financeiro: m.status_financeiro,
          },
          itens: sanitize(pagina.map(receitaItem)),
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.RELATORIO_CONTRATOS,
    {
      title: 'Relatório analítico de contratos',
      description:
        'Consolidados, faixas de valor e curva de Pareto sobre TODO o conjunto filtrado de contratos (limit/offset só afetam os detalhes).',
      inputSchema: {
        ...contratoFiltrosShape,
        ...pageShape,
        faixas_valor: z.array(z.number().nonnegative()).min(1).optional().describe('Cortes crescentes das faixas de produção.'),
        base_pareto: z.enum(['receita_recebida', 'receita_prevista', 'producao']).optional().describe('Padrão: receita_recebida.'),
      },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const faixas = (args.faixas_valor ?? FAIXAS_PADRAO).map(Number);
        for (let i = 1; i < faixas.length; i++) {
          if (faixas[i] <= faixas[i - 1]) return fail('"faixas_valor" deve ser estritamente crescente.');
        }
        const base = (args.base_pareto ?? 'receita_recebida') as BasePareto;
        const limit = clampLimit(args.limit);
        const offset = clampOffset(args.offset);
        const metricas = await carregarContratosFiltrados(args);

        const producoes = metricas.map((m) => m.producao);
        const prevista = round2(metricas.reduce((a, m) => a + m.receita_prevista, 0));
        const recebida = round2(metricas.reduce((a, m) => a + m.receita_recebida, 0));
        const pendente = round2(metricas.reduce((a, m) => a + m.receita_pendente, 0));
        const comissoesPagas = round2(metricas.reduce((a, m) => a + m.comissoes_pagas_total, 0));
        const comissoesPrevistas = round2(metricas.reduce((a, m) => a + m.comissoes_previstas_total, 0));

        const pagina = metricas.slice(offset, offset + limit);
        return text({
          filtros_aplicados: {
            data_implantacao_inicio: args.data_implantacao_inicio ?? null,
            data_implantacao_fim: args.data_implantacao_fim ?? null,
            operadora: args.operadora ?? null,
            corretor: args.corretor ?? null,
            supervisor: args.supervisor ?? null,
            unidade_negocio: args.unidade_negocio ?? null,
            status: args.status ?? null,
          },
          consolidado: {
            quantidade_contratos: metricas.length,
            ...moneyPair('producao_total', round2(producoes.reduce((a, x) => a + x, 0))),
            ...moneyPair('producao_media', media(producoes)),
            ...moneyPair('producao_mediana', mediana(producoes)),
            ...moneyPair('receita_prevista_total', prevista),
            ...moneyPair('receita_recebida_total', recebida),
            ...moneyPair('receita_pendente_total', pendente),
            ...moneyPair('receita_recebida_media', media(metricas.map((m) => m.receita_recebida))),
            ...moneyPair('comissoes_pagas_total', comissoesPagas),
            ...moneyPair('comissoes_previstas_total', comissoesPrevistas),
            ...moneyPair('margem_bruta_corretora', round2(recebida - comissoesPagas)),
            ...moneyPair('margem_bruta_prevista', round2(prevista - comissoesPrevistas)),
            producao_fonte: PRODUCAO_FONTE,
          },
          faixas: calcularFaixas(metricas, faixas),
          pareto: calcularPareto(metricas, base),
          qualidade_dados: {
            receitas_sem_contrato: await contarReceitasSemContrato(),
            avisos: AVISOS_QUALIDADE,
          },
          detalhes: { total: metricas.length, limit, offset, has_more: offset + pagina.length < metricas.length, itens: sanitize(pagina.map((m) => m.saida)) },
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );


  server.registerTool(
    TOOL.CONSULTAR_COMISSOES,
    {
      title: 'Consultar comissões',
      description: 'Comissões de supervisores e corretores, com filtro por período, pessoa, unidade e situação de pagamento.',
      inputSchema: {
        ...periodoShape,
        ...unidadeShape,
        pessoa: z.string().optional().describe('Nome (parcial) do supervisor ou corretor.'),
        situacao: z.enum(['pago', 'pendente', 'todos']).optional().describe('Padrão: todos.'),
        ...pageShape,
      },
      annotations: RO,
    },
    async (args) => {
      assertNoIdentityArgs(args);
      const limit = clampLimit(args.limit);
      let q = ctx.supabase
        .from('contratos')
        .select('id, nome, unidade_negocio, data_implantacao, valor_contrato, supervisor_a_percentual, supervisor_a_valor, supervisor_a_pago, supervisor_b_percentual, supervisor_b_valor, supervisor_b_pago, corretor_percentual, corretor_valor, corretor_pago, corretor:vendedores!contratos_corretor_id_fkey(nome), sa:supervisores!contratos_supervisor_a_id_fkey(nome), sb:supervisores!contratos_supervisor_b_id_fkey(nome)');
      q = applyUnidade(applyPeriodo(q, args, 'data_implantacao'), args.unidade);
      const rows = await todos<any>(q);
      const situacao = args.situacao ?? 'todos';
      let itens: any[] = [];
      for (const c of rows) {
        const slots = [
          { papel: 'Supervisor A', pessoa: c.sa?.nome, percentual: c.supervisor_a_percentual, valor: c.supervisor_a_valor, pago: c.supervisor_a_pago },
          { papel: 'Supervisor B', pessoa: c.sb?.nome, percentual: c.supervisor_b_percentual, valor: c.supervisor_b_valor, pago: c.supervisor_b_pago },
          { papel: 'Corretor', pessoa: c.corretor?.nome, percentual: c.corretor_percentual, valor: c.corretor_valor, pago: c.corretor_pago },
        ];
        for (const s of slots) {
          if (!s.pessoa) continue;
          if (situacao === 'pago' && !s.pago) continue;
          if (situacao === 'pendente' && s.pago) continue;
          if (args.pessoa && !String(s.pessoa).toLowerCase().includes(args.pessoa.toLowerCase())) continue;
          itens.push({
            contrato_id: c.id,
            contrato: c.nome,
            unidade_negocio: c.unidade_negocio,
            data_implantacao: c.data_implantacao,
            data_implantacao_formatada: formatDateBR(c.data_implantacao),
            papel: s.papel,
            pessoa: s.pessoa,
            percentual: s.percentual,
            ...money(s.valor),
            pago: s.pago,
          });
        }
      }
      const total = itens.reduce((a, x) => a + x.valor, 0);
      const totalPago = itens.filter((x) => x.pago).reduce((a, x) => a + x.valor, 0);
      const offset = clampOffset(args.offset);
      return text({
        total_encontrado: itens.length,
        limit,
        offset,
        resumo: { total: money(total), pago: money(totalPago), pendente: money(total - totalPago) },
        itens: itens.slice(offset, offset + limit),
      });
    },
  );

  server.registerTool(
    TOOL.LISTAR_CADASTROS,
    {
      title: 'Listar cadastros base',
      description: 'Lista vendedores, operadoras, categorias de despesa, setores ou supervisores.',
      inputSchema: {
        tipo: z.enum(['vendedores', 'operadoras', 'categorias', 'setores', 'supervisores']).describe('Cadastro desejado.'),
        ...pageShape,
      },
      annotations: RO,
    },
    async (args) => {
      assertNoIdentityArgs(args);
      const map: Record<string, { tabela: string; campos: string }> = {
        vendedores: { tabela: 'vendedores', campos: 'id, nome, ativo' },
        operadoras: { tabela: 'operadoras', campos: 'id, nome, ativa' },
        categorias: { tabela: 'categorias_despesa', campos: 'id, nome, tipo_dre, grupo_dre, ativo, versao' },
        setores: { tabela: 'setores_despesa', campos: 'id, nome, ativo' },
        supervisores: { tabela: 'supervisores', campos: 'id, nome, ativo' },
      };
      const cfg = map[args.tipo];
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);
      const { data, error, count } = await ctx.supabase
        .from(cfg.tabela)
        .select(cfg.campos, { count: 'exact' })
        .order('nome')
        .range(offset, offset + limit - 1);
      if (error) return fail(error.message);
      return text({ tipo: args.tipo, total_encontrado: count ?? 0, limit, offset, itens: sanitize(data || []) });
    },
  );

  server.registerTool(
    TOOL.OBTER_OPERACAO,
    {
      title: 'Obter operação MCP',
      description: 'Consulta uma operação MCP (pendente, executada, cancelada ou expirada) pelo confirmation_id.',
      inputSchema: { confirmation_id: z.string().uuid().describe('ID retornado por uma ferramenta "preparar_*".') },
      annotations: RO,
    },
    async (args) => {
      assertNoIdentityArgs(args);
      const { data, error } = await ctx.supabase
        .from('mcp_operacoes')
        .select('id, tool_name, status, arguments, before_data, after_data, plano, resultado, summary, error, expires_at, executed_at, created_at')
        .eq('id', args.confirmation_id)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail('Operação não encontrada.');
      return text(sanitize(data));
    },
  );

  // ======================= ESCRITA EM DUAS ETAPAS =======================

  async function resolverId(tabela: string, nome: string | undefined, rotulo: string) {
    if (!nome?.trim()) return null;
    const rows = await todos<any>(ctx.supabase.from(tabela).select('*').ilike('nome', '%' + nome.trim() + '%'));
    const ativos = rows.filter(x => x.ativo !== false && x.ativa !== false);
    const exatos = ativos.filter(x => String(x.nome).toLocaleLowerCase('pt-BR') === nome.trim().toLocaleLowerCase('pt-BR'));
    const candidatos = exatos.length ? exatos : ativos;
    if (!candidatos.length) throw new Error(rotulo + ' não encontrado(a) ou inativo(a): "' + nome + '".');
    if (candidatos.length !== 1) throw new Error(rotulo + ' ambíguo(a). Informe o nome exato.');
    return candidatos[0].id as string;
  }

  async function referenciaAtiva(tabela: string, id: string, rotulo: string) {
    const { data, error } = await ctx.supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.ativo === false || data.ativa === false) throw new Error(rotulo + ' não encontrado(a) ou inativo(a).');
    return data;
  }

  function validarStatus(origem: 'receita' | 'despesa', novo: string, atual?: string) {
    const permitidos = origem === 'receita' ? ['Recebido', 'Aguardando', 'Previsto', 'Atrasado'] : ['Pago', 'A pagar', 'Previsto', 'Atrasado'];
    if (!permitidos.includes(novo)) throw new Error('Status inválido. Para cancelamento, use preparar_cancelamento_lancamento.');
    const liquidado = origem === 'receita' ? 'Recebido' : 'Pago';
    if (atual === liquidado && novo !== liquidado) throw new Error('Pagamento histórico não pode voltar a aberto ou ser cancelado.');
  }

  server.registerTool(
    TOOL.PREPARAR_CRIACAO_RECEITA,
    {
      title: 'Preparar criação de receita',
      description: 'Valida os dados e cria uma operação PENDENTE para lançar uma receita. Não altera nada até "confirmar_operacao".',
      inputSchema: {
        data: dataStr('Data do lançamento (YYYY-MM-DD).'),
        descricao: z.string().trim().min(1).max(300),
        categoria: z.string().trim().min(1).describe('Categoria da receita (texto livre do sistema).'),
        operadora: z.string().trim().min(1).describe('Nome da operadora cadastrada.'),
        vendedor: z.string().trim().min(1).describe('Nome do vendedor cadastrado.'),
        valor: z.number().nonnegative(),
        status: z.string().optional().describe('Padrão: "Aguardando".'),
        unidade_negocio: z.string().optional(),
        observacoes: z.string().max(2000).optional(),
        contrato_id: z.string().uuid().optional().describe('Opcional: ID do contrato ao qual esta receita pertence.'),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        validarStatus('receita', args.status ?? 'Aguardando');
        const operadora_id = await resolverId('operadoras', args.operadora, 'Operadora');
        const vendedor_id = await resolverId('vendedores', args.vendedor, 'Vendedor');
        let contrato_id: string | null = null;
        if (args.contrato_id) {
          const contrato = await carregarContrato(args.contrato_id);
          if (!contrato) return fail('Contrato não encontrado ou sem acesso. Nenhuma operação foi criada.');
          contrato_id = contrato.id;
        }
        const after = {
          data: args.data,
          descricao: args.descricao,
          categoria: args.categoria,
          operadora_id,
          vendedor_id,
          contrato_id,
          valor: args.valor,
          status: args.status ?? 'Aguardando',
          unidade_negocio: args.unidade_negocio ?? null,
          observacoes: args.observacoes ?? null,
        };
        const summary = `Criar receita "${args.descricao}" de ${money(args.valor).valor_formatado} em ${formatDateBR(args.data)} (${args.operadora} / ${args.vendedor}, status ${after.status}).`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_CRIACAO_RECEITA, args as any, null, after, summary);
        return text({
          confirmation_id: op.id,
          expires_at: op.expires_at,
          status: 'pending',
          resumo: summary,
          antes: null,
          depois: after,
          proximo_passo: 'Apresente este resumo ao usuário e, com o aceite explícito dele, chame confirmar_operacao com o confirmation_id.',
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_CRIACAO_DESPESA,
    {
      title: 'Preparar criação de despesa',
      description: 'Valida os dados e cria uma operação PENDENTE para lançar uma despesa. Não altera nada até "confirmar_operacao".',
      inputSchema: {
        data: dataStr('Data do lançamento (YYYY-MM-DD).'),
        descricao: z.string().trim().min(1).max(300),
        categoria: z.string().trim().min(1).describe('Nome da categoria de despesa cadastrada.'),
        tipo: z.enum(['Fixo', 'Variável']).describe('Tipo da despesa, independente da recorrência e grupo DRE.'),
        valor: z.number().nonnegative(),
        status: z.string().optional().describe('Padrão: "A pagar".'),
        setor: z.string().optional().describe('Nome do setor cadastrado.'),
        responsavel: z.string().optional(),
        unidade_negocio: z.string().optional(),
        recorrente: z.boolean().optional(),
        observacoes: z.string().max(2000).optional(),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        validarStatus('despesa', args.status ?? 'A pagar');
        const categoria_id = await resolverId('categorias_despesa', args.categoria, 'Categoria');
        const setor_id = args.setor ? await resolverId('setores_despesa', args.setor, 'Setor') : null;
        const after = {
          data: args.data,
          descricao: args.descricao,
          categoria_id,
          setor_id,
          tipo: args.tipo,
          valor: args.valor,
          status: args.status ?? 'A pagar',
          responsavel: args.responsavel ?? null,
          unidade_negocio: args.unidade_negocio ?? null,
          recorrente: args.recorrente ?? false,
          observacoes: args.observacoes ?? null,
        };
        const summary = `Criar despesa "${args.descricao}" de ${money(args.valor).valor_formatado} em ${formatDateBR(args.data)} (categoria ${args.categoria}, status ${after.status}).`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_CRIACAO_DESPESA, args as any, null, after, summary);
        return text({
          confirmation_id: op.id,
          expires_at: op.expires_at,
          status: 'pending',
          resumo: summary,
          antes: null,
          depois: after,
          proximo_passo: 'Peça a confirmação explícita do usuário antes de chamar confirmar_operacao.',
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  const TABELA = { receita: 'receitas', despesa: 'despesas' } as const;
  const DATA_EFETIVA = { receita: 'data_recebimento', despesa: 'data_pagamento' } as const;

  /** Campos aceitos na alteração (individual e em lote). Omitido preserva; null limpa. */
  const alteracaoShape = {
    tipo_lancamento: z.enum(['receita', 'despesa']),
    id: z.string().uuid().describe('ID do lançamento.'),
    data: dataStr('Data legada do lançamento.').optional(),
    descricao: z.string().trim().min(1).max(300).optional(),
    valor: z.number().nonnegative().optional(),
    status: z.string().optional(),
    unidade_negocio: z.string().nullable().optional(),
    observacoes: z.string().max(2000).nullable().optional(),
    competencia: dataStr('Data de competência (reconhecimento no DRE).').nullable().optional(),
    vencimento: dataStr('Data de vencimento (fluxo projetado).').nullable().optional(),
    data_efetiva: dataStr('Data efetiva de pagamento (despesa) ou recebimento (receita).').nullable().optional(),
    categoria_id: z.string().uuid().nullable().optional(),
    subcategoria_id: z.string().uuid().nullable().optional().describe('Deve pertencer à categoria do lançamento.'),
    tipo: z.enum(['Fixo', 'Variável']).optional().describe('Somente despesas: tipo da despesa.'),
    categoria: z.string().optional().describe('Nome da categoria (resolvido para categoria_id).'),
    subcategoria: z.string().optional().describe('Nome da subcategoria dentro da categoria resultante.'),
    setor: z.string().nullable().optional().describe('Nome do setor. null limpa. Receita ou despesa.'),
    setor_id: z.string().uuid().nullable().optional(),
    responsavel: z.string().nullable().optional().describe('Responsável pelo lançamento.'),
    recorrente: z.boolean().optional().describe('Independente do tipo; encerrar série requer a ferramenta específica.'),
    operadora: z.string().optional().describe('Somente receitas: nome da operadora.'),
    vendedor: z.string().optional().describe('Somente receitas: nome do vendedor.'),
  };

  async function resolverSubcategoria(nome: string, categoriaId: string | null) {
    if (!categoriaId) throw new Error('Informe a categoria antes da subcategoria.');
    const rows = await todos<any>(ctx.supabase.from('subcategorias_despesa').select('*').eq('categoria_id', categoriaId).ilike('nome', '%' + nome.trim() + '%'));
    const ativos = rows.filter(x => x.ativo !== false);
    const exatos = ativos.filter(x => String(x.nome).toLocaleLowerCase('pt-BR') === nome.trim().toLocaleLowerCase('pt-BR'));
    const candidatos = exatos.length ? exatos : ativos;
    if (candidatos.length !== 1) throw new Error('Subcategoria inexistente, inativa ou ambígua nesta categoria.');
    return candidatos[0].id as string;
  }

  /** Campo omitido preserva; null limpa apenas o campo explicitamente informado. */
  async function montarUpdates(args: Record<string, any>, atual: Record<string, any>) {
    if (atual.cancelado || STATUS_CANCELADO.includes(String(atual.status))) throw new Error('Lançamento cancelado é histórico.');
    const isDespesa = args.tipo_lancamento === 'despesa';
    const dataEfetiva = atual[DATA_EFETIVA[args.tipo_lancamento as 'receita' | 'despesa']];
    const liquidado = atual.status === (isDespesa ? 'Pago' : 'Recebido') || dataEfetiva != null;
    if (liquidado && args.valor === 0 && Number(atual.valor) > 0) throw new Error('Não é permitido zerar pagamento histórico.');
    if (dataEfetiva != null && args.data_efetiva === null) throw new Error('Não é permitido apagar a data efetiva histórica.');
    if (dataEfetiva != null && args.status !== undefined && args.status !== atual.status) throw new Error('Status com liquidação histórica exige revisão; não pode ser reescrito.');
    const updates: Record<string, any> = {};
    if (args.status !== undefined) validarStatus(args.tipo_lancamento, args.status, atual.status);
    for (const campo of ['data', 'descricao', 'valor', 'status', 'unidade_negocio', 'observacoes', 'competencia', 'vencimento', 'responsavel', 'recorrente']) {
      if (args[campo] !== undefined) updates[campo] = args[campo];
    }
    if (args.data_efetiva !== undefined) updates[DATA_EFETIVA[args.tipo_lancamento as 'receita' | 'despesa']] = args.data_efetiva;
    if (args.categoria_id !== undefined) updates.categoria_id = args.categoria_id;
    if (args.categoria !== undefined) {
      const id = await resolverId('categorias_despesa', args.categoria, 'Categoria');
      if (!id) throw new Error('Categoria vazia. Use categoria_id:null para limpar.');
      if (args.categoria_id !== undefined && args.categoria_id !== id) throw new Error('Nome e ID de categoria divergem.');
      updates.categoria_id = id;
    }
    const categoriaId = updates.categoria_id !== undefined ? updates.categoria_id : atual.categoria_id;
    if (updates.categoria_id && updates.categoria_id !== atual.categoria_id) await referenciaAtiva('categorias_despesa', updates.categoria_id, 'Categoria');
    if (args.subcategoria_id !== undefined) updates.subcategoria_id = args.subcategoria_id;
    if (args.subcategoria !== undefined) {
      const id = await resolverSubcategoria(args.subcategoria, categoriaId ?? null);
      if (args.subcategoria_id !== undefined && args.subcategoria_id !== id) throw new Error('Nome e ID de subcategoria divergem.');
      updates.subcategoria_id = id;
    }
    const subId = updates.subcategoria_id !== undefined ? updates.subcategoria_id : atual.subcategoria_id;
    if (subId && (updates.categoria_id !== undefined || updates.subcategoria_id !== undefined)) {
      const { data: sub, error } = await ctx.supabase.from('subcategorias_despesa').select('*').eq('id', subId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!sub || !categoriaId || sub.categoria_id !== categoriaId) throw new Error('A subcategoria não pertence à categoria resultante. Informe a correta ou null.');
      if (sub.ativo === false && subId !== atual.subcategoria_id) throw new Error('Subcategoria inativa.');
    }
    if (args.setor_id !== undefined) updates.setor_id = args.setor_id;
    if (args.setor !== undefined) {
      const id = args.setor === null ? null : await resolverId('setores_despesa', args.setor, 'Setor');
      if (args.setor_id !== undefined && args.setor_id !== id) throw new Error('Nome e ID do setor divergem.');
      updates.setor_id = id;
    }
    if (updates.setor_id && updates.setor_id !== atual.setor_id) await referenciaAtiva('setores_despesa', updates.setor_id, 'Setor');
    if (isDespesa) {
      if (args.tipo !== undefined) updates.tipo = args.tipo;
      if (args.operadora !== undefined || args.vendedor !== undefined) throw new Error('Operadora e vendedor só se aplicam a receitas.');
    } else {
      if (args.tipo !== undefined) throw new Error('O campo "tipo" só se aplica a despesas. Nenhuma operação foi criada.');
      if (args.operadora) updates.operadora_id = await resolverId('operadoras', args.operadora, 'Operadora');
      if (args.vendedor) updates.vendedor_id = await resolverId('vendedores', args.vendedor, 'Vendedor');
    }
    return updates;
  }

  server.registerTool(
    TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
    {
      title: 'Preparar alteração de lançamento',
      description: 'Lê o lançamento atual e cria uma operação PENDENTE com o comparativo antes/depois. Não altera nada até "confirmar_operacao".',
      inputSchema: { ...alteracaoShape },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const tabela = TABELA[args.tipo_lancamento];
        const { data: atual, error } = await ctx.supabase.from(tabela).select('*').eq('id', args.id).maybeSingle();
        if (error) return fail(error.message);
        if (!atual) return fail('Lançamento não encontrado.');
        const updates = await montarUpdates(args as any, atual);
        if (!Object.keys(updates).length) return fail('Informe ao menos um campo para alterar.');
        const before = sanitize(atual) as Record<string, unknown>;
        const diff = buildDiff(before, updates);
        if (!diff.length) return fail('Os valores informados já são os atuais. Nenhuma alteração necessária.');
        const summary = `Alterar ${args.tipo_lancamento} "${atual.descricao}" — ${describeDiff(diff)}`;
        const op = await registrarOperacao(
          ctx,
          TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
          args as any,
          before,
          { tabela, id: args.id, updates, versao: atual.versao ?? null },
          summary,
        );
        return text({
          confirmation_id: op.id,
          expires_at: op.expires_at,
          status: 'pending',
          resumo: summary,
          antes: before,
          depois: sanitize({ ...atual, ...updates }) as Record<string, unknown>,
          alteracoes: diff,
          proximo_passo: 'Peça a confirmação explícita do usuário antes de chamar confirmar_operacao.',
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_MARCACAO_STATUS,
    {
      title: 'Preparar marcação de status',
      description: 'Prepara a mudança de status de um lançamento (ex.: receita para "Recebido", despesa para "Pago"). Não altera nada até "confirmar_operacao".',
      inputSchema: {
        tipo_lancamento: z.enum(['receita', 'despesa']),
        id: z.string().uuid(),
        novo_status: z.string().trim().min(1).describe('Receitas: "Recebido"/"Aguardando". Despesas: "Pago"/"A pagar"/"Atrasado".'),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const tabela = TABELA[args.tipo_lancamento];
        const { data: atual, error } = await ctx.supabase.from(tabela).select('*').eq('id', args.id).maybeSingle();
        if (error) return fail(error.message);
        if (!atual) return fail('Lançamento não encontrado.');
        validarStatus(args.tipo_lancamento, args.novo_status, atual.status);
        if (atual[DATA_EFETIVA[args.tipo_lancamento]] != null && args.novo_status !== atual.status) return fail('Status com liquidação histórica exige revisão; não pode ser reescrito.');
        if (atual.cancelado) return fail('Lançamento cancelado é histórico.');
        if (atual.status === args.novo_status) return fail(`O lançamento já está com status "${args.novo_status}".`);
        const before = sanitize(atual) as Record<string, unknown>;
        const summary = `Alterar status de ${args.tipo_lancamento} "${atual.descricao}" (${money(atual.valor).valor_formatado}) de "${atual.status}" para "${args.novo_status}".`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_MARCACAO_STATUS, args as any, before, { tabela, id: args.id, versao: atual.versao ?? null, updates: { status: args.novo_status } }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: { status: atual.status }, depois: { status: args.novo_status } });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.CONFIRMAR_OPERACAO,
    {
      title: 'Confirmar operação pendente',
      description: 'EXECUTA de fato a operação preparada. Só chame após o usuário confirmar explicitamente. Uma operação nunca é executada duas vezes.',
      inputSchema: { confirmation_id: z.string().uuid().describe('ID retornado por uma ferramenta "preparar_*".') },
      annotations: RW_CONFIRM,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const { data: op, error: opErr } = await ctx.supabase
          .from('mcp_operacoes')
          .select('*')
          .eq('id', args.confirmation_id)
          .maybeSingle();
        if (opErr) return fail(opErr.message);
        const check = canConfirm(op as any);
        if (!check.ok) return fail((check as { ok: false; reason: string }).reason);

        // Um ÚNICO RPC faz reserva + validação + gravação + auditoria na MESMA transação,
        // lendo SOMENTE o plano persistido na prévia. Nada do cliente entra aqui.
        const { data: exec, error: execErr } = await ctx.supabase.rpc('mcp_executar_operacao', {
          _op_id: args.confirmation_id,
        });
        if (execErr) {
          // A transação foi desfeita: nada foi gravado. Registramos a falha à parte.
          await ctx.supabase.from('mcp_operacoes').update({ status: 'failed', error: execErr.message }).eq('id', args.confirmation_id).eq('status', 'pending');
          return fail(execErr.message);
        }
        const limpo = sanitize(exec) as any;
        return text({
          status: 'executed',
          confirmation_id: args.confirmation_id,
          resumo: op!.summary,
          itens_aplicados: limpo?.itens ?? op!.item_count,
          resultado: limpo,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.CANCELAR_OPERACAO,
    {
      title: 'Cancelar operação pendente',
      description: 'Cancela uma operação preparada que ainda não foi executada.',
      inputSchema: { confirmation_id: z.string().uuid() },
      annotations: RW_PREP,
    },
    async (args) => {
      assertNoIdentityArgs(args);
      const { data, error } = await ctx.supabase
        .from('mcp_operacoes')
        .update({ status: 'cancelled' })
        .eq('id', args.confirmation_id)
        .eq('status', 'pending')
        .select('id, status, summary')
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail('Operação não encontrada ou já processada.');
      return text({ status: 'cancelled', confirmation_id: data.id, resumo: data.summary });
    },
  );

  // ======================= CATEGORIAS, SÉRIES, LOTE E DRE =======================

  async function mapaCategorias() {
    const rows = await todos<any>(ctx.supabase.from('categorias_despesa').select('id, nome, grupo_dre, tipo_dre, ativo, versao'));
    const byId = new Map<string, any>();
    for (const c of rows) byId.set(c.id, c);
    return { rows, byId };
  }

  async function mapaSetores() {
    const rows = await todos<any>(ctx.supabase.from('setores_despesa').select('id, nome, ativo'));
    const byId = new Map<string, any>();
    for (const s of rows) byId.set(s.id, s);
    return byId;
  }

  /** Cadastros (categorias/subcategorias) são GLOBAIS: só admin ou gestor podem alterá-los. */
  async function exigirPapelCadastros(): Promise<string | null> {
    const { data, error } = await ctx.supabase.from('user_roles').select('role').eq('user_id', ctx.userId);
    if (error) return `Não foi possível verificar suas permissões: ${error.message}`;
    const papeis = (data || []).map((r: any) => r.role);
    if (papeis.includes('admin') || papeis.includes('gestor')) return null;
    return 'Categorias e subcategorias são cadastros compartilhados: apenas administrador ou gestor podem alterá-los. Nenhuma operação foi criada.';
  }

  /** Só retorna agregados globais autorizados, nunca linhas de outros usuários. */
  async function impactoCategoria(categoriaId: string, subcategoriaId?: string | null) {
    const { data, error } = await ctx.supabase.rpc('mcp_impacto_categoria', {
      _categoria_id: categoriaId, _subcategoria_id: subcategoriaId ?? null,
    });
    if (error || !data) throw new Error('Não foi possível verificar o impacto global: ' + (error?.message ?? 'sem resultado'));
    return { ...data, aviso: 'Cadastro compartilhado: altera a leitura de todo o histórico vinculado, inclusive pagos. Nenhum valor, data ou vínculo é alterado nesta preparação.' };
  }

  server.registerTool(
    TOOL.LISTAR_CATEGORIAS,
    {
      title: 'Listar categorias e subcategorias',
      description: 'Lista as categorias de despesa com o grupo de DRE e, opcionalmente, suas subcategorias.',
      inputSchema: {
        incluir_inativas: z.boolean().optional().describe('Padrão: false.'),
        incluir_subcategorias: z.boolean().optional().describe('Padrão: true.'),
        grupo_dre: z.enum(GRUPOS_DRE).optional().describe('Filtra por grupo de DRE.'),
        sem_grupo: z.boolean().optional().describe('Somente categorias ainda sem grupo de DRE definido.'),
      },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const { rows } = await mapaCategorias();
        let cats = rows;
        if (!args.incluir_inativas) cats = cats.filter((c) => c.ativo !== false);
        if (args.grupo_dre) cats = cats.filter((c) => c.grupo_dre === args.grupo_dre);
        if (args.sem_grupo) cats = cats.filter((c) => !c.grupo_dre);
        let subs: any[] = [];
        if (args.incluir_subcategorias !== false) {
          subs = await todos<any>(ctx.supabase.from('subcategorias_despesa').select('id, categoria_id, nome, grupo_dre, ativo, versao'));
          if (!args.incluir_inativas) subs = subs.filter((s) => s.ativo !== false);
        }
        return text({
          total: cats.length,
          grupos_disponiveis: GRUPOS_DRE,
          sem_grupo_dre: rows.filter((c) => !c.grupo_dre).length,
          itens: sanitize(
            cats.map((c) => ({
              id: c.id,
              nome: c.nome,
              grupo_dre: c.grupo_dre ?? null,
              tipo_dre_legado: c.tipo_dre ?? null,
              ativo: c.ativo !== false,
              subcategorias: subs.filter((s) => s.categoria_id === c.id).map((s) => ({ id: s.id, nome: s.nome, ativo: s.ativo !== false, grupo_dre: s.grupo_dre ?? null, grupo_dre_efetivo: grupoEfetivo(c, s), versao: s.versao ?? null })),
            })),
          ),
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.LISTAR_SERIES,
    {
      title: 'Listar séries de recorrência',
      description: 'Lista as séries de recorrência (identidade real, nunca inferida por semelhança de texto) e seu estado.',
      inputSchema: {
        apenas_ativas: z.boolean().optional().describe('Padrão: false (lista todas).'),
        tipo: z.enum(['receita', 'despesa']).optional(),
      },
      annotations: RO_STRICT,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        let q: any = ctx.supabase
          .from('series_recorrencia')
          .select('id, tipo, nome, ativa, encerrada_em, motivo_encerramento, unidade_negocio, categoria_id, subcategoria_id, setor_id, created_at');
        if (args.apenas_ativas) q = q.eq('ativa', true);
        if (args.tipo) q = q.eq('tipo', args.tipo);
        const rows = await todos<any>(q);
        return text({ total: rows.length, itens: sanitize(rows) });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(TOOL.GERAR_DRE_COMPETENCIA, {
    title: 'DRE por competência, realizado ou projetado',
    description: 'DRE gerencial com contribuição antes dos fixos, resultado financeiro assinado e fora_dre separado. Mesmo cálculo de gerar_dre. Pendências visíveis; datas e grupos não são presumidos.',
    inputSchema: dreShape, annotations: RO_STRICT,
  }, gerarDre);

  server.registerTool(
    TOOL.PREPARAR_ALTERACAO_LOTE,
    {
      title: 'Preparar alteração em lote',
      description:
        'Prepara a alteração de vários lançamentos com prévia individual e UM único confirmation_id. ' +
        'A confirmação aplica tudo numa única transação no banco: se um item falhar, nenhum é alterado.',
      inputSchema: {
        itens: z
          .array(z.object(alteracaoShape as any))
          .min(1)
          .max(MAX_LIMIT)
          .describe('Cada item usa os mesmos campos de preparar_alteracao_lancamento.'),
        motivo: z.string().max(500).optional(),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const vistos = new Set<string>();
        const previa: any[] = [];
        const itens: any[] = [];
        for (const item of args.itens as any[]) {
          const chave = `${item.tipo_lancamento}:${item.id}`;
          if (vistos.has(chave)) return fail(`O lançamento ${item.id} aparece mais de uma vez no lote. Nenhuma operação foi criada.`);
          vistos.add(chave);
          const tabela = TABELA[item.tipo_lancamento as 'receita' | 'despesa'];
          const { data: atual, error } = await ctx.supabase.from(tabela).select('*').eq('id', item.id).maybeSingle();
          if (error) return fail(error.message);
          if (!atual) return fail(`Lançamento ${item.id} não encontrado ou sem acesso. Nenhuma operação foi criada.`);
          const updates = await montarUpdates(item, atual);
          if (!Object.keys(updates).length) return fail(`Nenhum campo informado para o lançamento ${item.id}.`);
          const before = sanitize(atual) as Record<string, unknown>;
          const diff = buildDiff(before, updates);
          if (!diff.length) return fail(`Os valores informados para ${item.id} já são os atuais. Nenhuma operação foi criada.`);
          itens.push({ tabela, id: item.id, versao: atual.versao ?? null, patch: updates });
          previa.push({ tabela, id: item.id, descricao: atual.descricao, alteracoes: diff, resumo: describeDiff(diff) });
        }
        const summary = `Alterar ${itens.length} lançamento(s) em lote${args.motivo ? ` — ${args.motivo}` : ''}.`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_ALTERACAO_LOTE, args as any, previa, { itens }, summary);
        return text({
          confirmation_id: op.id,
          expires_at: op.expires_at,
          status: 'pending',
          resumo: summary,
          total_itens: itens.length,
          previa,
          proximo_passo: 'Mostre a prévia item a item e só chame confirmar_operacao após o aceite explícito. A aplicação é atômica.',
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO,
    {
      title: 'Preparar cancelamento lógico de lançamento',
      description:
        'Prepara o cancelamento LÓGICO de um lançamento (nunca exclusão). Lançamentos já pagos/recebidos são recusados para preservar o histórico.',
      inputSchema: {
        tipo_lancamento: z.enum(['receita', 'despesa']),
        id: z.string().uuid(),
        motivo: z.string().min(3).max(500).describe('Motivo do cancelamento (auditoria).'),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const tabela = TABELA[args.tipo_lancamento];
        const { data: atual, error } = await ctx.supabase.from(tabela).select('*').eq('id', args.id).maybeSingle();
        if (error) return fail(error.message);
        if (!atual) return fail('Lançamento não encontrado.');
        if (atual.cancelado) return fail('Este lançamento já está cancelado.');
        const liquidados = args.tipo_lancamento === 'receita' ? ['Recebido'] : ['Pago'];
        if (liquidados.includes(String(atual.status)) || atual[DATA_EFETIVA[args.tipo_lancamento]] != null) {
          return fail(`Lançamento com status "${atual.status}" não pode ser cancelado — o histórico de pagamentos é preservado.`);
        }
        const updates = {
          cancelado: true,
          cancelado_em: new Date().toISOString(),
          motivo_cancelamento: args.motivo,
        };
        const before = sanitize(atual) as Record<string, unknown>;
        const summary = `Cancelar (lógico) ${args.tipo_lancamento} "${atual.descricao}" de ${money(atual.valor).valor_formatado} em ${formatDateBR(atual.data)} — motivo: ${args.motivo}.`;
        const op = await registrarOperacao(
          ctx,
          TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO,
          args as any,
          before,
          { tabela, id: args.id, updates, versao: atual.versao ?? null },
          summary,
        );
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: before, depois: sanitize({ ...atual, ...updates }) });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_CRIACAO_CATEGORIA,
    {
      title: 'Preparar criação de categoria',
      description: 'Prepara a criação de uma categoria de despesa/receita com grupo de DRE. Não altera nada até "confirmar_operacao".',
      inputSchema: {
        nome: z.string().trim().min(1).max(120),
        grupo_dre: z.enum(GRUPOS_DRE).describe('Grupo canônico do DRE.'),
        ativo: z.boolean().optional().describe('Padrão: true.'),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const semPermissao = await exigirPapelCadastros();
        if (semPermissao) return fail(semPermissao);
        const { rows } = await mapaCategorias();
        if (rows.some((c) => String(c.nome).trim().toLowerCase() === args.nome.trim().toLowerCase())) {
          return fail(`Já existe uma categoria chamada "${args.nome}". Nenhuma operação foi criada.`);
        }
        const payload = { nome: args.nome.trim(), grupo_dre: args.grupo_dre, ativo: args.ativo ?? true };
        const summary = `Criar categoria "${payload.nome}" no grupo ${payload.grupo_dre}.`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_CRIACAO_CATEGORIA, args as any, null, { tabela: 'categorias_despesa', payload }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: null, depois: payload });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_ALTERACAO_CATEGORIA,
    {
      title: 'Preparar alteração de categoria',
      description:
        'Prepara a alteração de nome, grupo de DRE ou inativação de uma categoria. O ID é preservado e nenhuma referência histórica é perdida — não existe exclusão.',
      inputSchema: {
        id: z.string().uuid(),
        nome: z.string().trim().min(1).max(120).optional(),
        grupo_dre: z.enum(GRUPOS_DRE).optional(),
        ativo: z.boolean().optional().describe('false inativa a categoria sem apagá-la.'),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const semPermissao = await exigirPapelCadastros();
        if (semPermissao) return fail(semPermissao);
        const { data: atual, error } = await ctx.supabase.from('categorias_despesa').select('*').eq('id', args.id).maybeSingle();
        if (error) return fail(error.message);
        if (!atual) return fail('Categoria não encontrada.');
        const updates: Record<string, unknown> = {};
        if (args.nome !== undefined) updates.nome = args.nome.trim();
        if (args.grupo_dre !== undefined) updates.grupo_dre = args.grupo_dre;
        if (args.ativo !== undefined) updates.ativo = args.ativo;
        if (!Object.keys(updates).length) return fail('Informe ao menos um campo para alterar.');
        const before = sanitize(atual) as Record<string, unknown>;
        const diff = buildDiff(before, updates);
        if (!diff.length) return fail('Os valores informados já são os atuais.');
        const impacto = await impactoCategoria(args.id);
        const summary = `Alterar categoria "${atual.nome}" — ${describeDiff(diff)} (impacto: ${impacto.despesas_vinculadas.quantidade} despesa(s) e ${impacto.receitas_vinculadas.quantidade} receita(s) vinculadas).`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_ALTERACAO_CATEGORIA, args as any, { antes: before, impacto }, { tabela: 'categorias_despesa', id: args.id, versao: atual.versao ?? null, updates }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: before, depois: sanitize({ ...atual, ...updates }), alteracoes: diff, impacto });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_CRIACAO_SUBCATEGORIA,
    {
      title: 'Preparar criação de subcategoria',
      description: 'Prepara a criação de uma subcategoria dentro de uma categoria existente. Não altera nada até "confirmar_operacao".',
      inputSchema: {
        categoria_id: z.string().uuid(),
        nome: z.string().trim().min(1).max(120),
        grupo_dre: z.enum(GRUPOS_DRE).nullable().optional().describe('Grupo próprio; null ou omitido herda a categoria-pai.'),
        ativo: z.boolean().optional(),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const semPermissao = await exigirPapelCadastros();
        if (semPermissao) return fail(semPermissao);
        const { data: cat, error } = await ctx.supabase.from('categorias_despesa').select('id, nome, ativo').eq('id', args.categoria_id).maybeSingle();
        if (error) return fail(error.message);
        if (!cat || cat.ativo === false) return fail('Categoria não encontrada ou inativa. Nenhuma operação foi criada.');
        const existentes = await todos<any>(ctx.supabase.from('subcategorias_despesa').select('id, nome, categoria_id').eq('categoria_id', args.categoria_id));
        if (existentes.some((s) => String(s.nome).trim().toLowerCase() === args.nome.trim().toLowerCase())) {
          return fail(`Já existe a subcategoria "${args.nome}" nesta categoria.`);
        }
        const payload = { categoria_id: args.categoria_id, nome: args.nome.trim(), grupo_dre: args.grupo_dre ?? null, ativo: args.ativo ?? true };
        const summary = `Criar subcategoria "${payload.nome}" em "${cat.nome}".`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_CRIACAO_SUBCATEGORIA, args as any, null, { tabela: 'subcategorias_despesa', payload }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: null, depois: payload });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA,
    {
      title: 'Preparar alteração de subcategoria',
      description: 'Prepara a alteração de nome, categoria-pai ou inativação de uma subcategoria. Não existe exclusão.',
      inputSchema: {
        id: z.string().uuid(),
        nome: z.string().trim().min(1).max(120).optional(),
        categoria_id: z.string().uuid().optional(),
        grupo_dre: z.enum(GRUPOS_DRE).nullable().optional().describe('null restaura a herança da categoria-pai.'),
        ativo: z.boolean().optional(),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const semPermissao = await exigirPapelCadastros();
        if (semPermissao) return fail(semPermissao);
        const { data: atual, error } = await ctx.supabase.from('subcategorias_despesa').select('*').eq('id', args.id).maybeSingle();
        if (error) return fail(error.message);
        if (!atual) return fail('Subcategoria não encontrada.');
        const updates: Record<string, unknown> = {};
        if (args.nome !== undefined) updates.nome = args.nome.trim();
        if (args.grupo_dre !== undefined) updates.grupo_dre = args.grupo_dre;
        if (args.ativo !== undefined) updates.ativo = args.ativo;
        if (args.categoria_id !== undefined) {
          const { data: cat } = await ctx.supabase.from('categorias_despesa').select('id, ativo').eq('id', args.categoria_id).maybeSingle();
          if (!cat || cat.ativo === false) return fail('Categoria de destino não encontrada ou inativa.');
          updates.categoria_id = args.categoria_id;
        }
        if (!Object.keys(updates).length) return fail('Informe ao menos um campo para alterar.');
        const before = sanitize(atual) as Record<string, unknown>;
        const diff = buildDiff(before, updates);
        if (!diff.length) return fail('Os valores informados já são os atuais.');
        const impacto = await impactoCategoria(atual.categoria_id, args.id);
        if (args.categoria_id !== undefined && args.categoria_id !== atual.categoria_id &&
            (impacto.despesas_vinculadas.quantidade + impacto.receitas_vinculadas.quantidade + (impacto.series_vinculadas ?? 0)) > 0) {
          return fail('Subcategoria vinculada ao histórico não pode trocar de pai. Reclassifique os lançamentos explicitamente, preservando seus IDs.');
        }
        const summary = `Alterar subcategoria "${atual.nome}" — ${describeDiff(diff)} (impacto: ${impacto.despesas_vinculadas.quantidade} despesa(s) e ${impacto.receitas_vinculadas.quantidade} receita(s) vinculadas).`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA, args as any, { antes: before, impacto }, { tabela: 'subcategorias_despesa', id: args.id, versao: atual.versao ?? null, updates }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: before, depois: sanitize({ ...atual, ...updates }), alteracoes: diff, impacto });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_CRIACAO_SERIE,
    {
      title: 'Preparar criação de série de recorrência',
      description:
        'Cria a identidade REAL de uma série de recorrência e vincula os lançamentos informados por ID. ' +
        'Nunca agrupa por semelhança de texto. Não altera nada até "confirmar_operacao".',
      inputSchema: {
        nome: z.string().trim().min(1).max(200),
        tipo: z.enum(['receita', 'despesa']),
        unidade_negocio: z.string().nullable().optional().describe('Unidade vigente da série.'),
        categoria_id: z.string().uuid().nullable().optional(),
        subcategoria_id: z.string().uuid().nullable().optional(),
        setor_id: z.string().uuid().nullable().optional(),
        lancamento_ids: z.array(z.string().uuid()).min(1).max(MAX_LIMIT - 1).describe('Até 199 IDs explícitos dos lançamentos da série.'),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        if (new Set(args.lancamento_ids).size !== args.lancamento_ids.length) return fail('IDs duplicados na série.');
        if (args.categoria_id) await referenciaAtiva('categorias_despesa', args.categoria_id, 'Categoria');
        if (args.setor_id) await referenciaAtiva('setores_despesa', args.setor_id, 'Setor');
        if (args.subcategoria_id) {
          const sub = await referenciaAtiva('subcategorias_despesa', args.subcategoria_id, 'Subcategoria');
          if (!args.categoria_id || sub.categoria_id !== args.categoria_id) return fail('Subcategoria não pertence à categoria da série.');
        }
        const tabela = TABELA[args.tipo];
        const lancamentos: any[] = [];
        for (const id of args.lancamento_ids) {
          const { data: row, error } = await ctx.supabase.from(tabela).select('id, descricao, data, valor, status, cancelado, serie_id, versao').eq('id', id).maybeSingle();
          if (error) return fail(error.message);
          if (!row) return fail(`Lançamento ${id} não encontrado ou sem acesso. Nenhuma operação foi criada.`);
          if (row.cancelado || STATUS_CANCELADO.includes(String(row.status))) return fail('Lançamento cancelado é histórico e não pode ser vinculado a nova série.');
          if (row.serie_id) return fail(`O lançamento ${id} já pertence a uma série (${row.serie_id}). Nenhuma operação foi criada.`);
          lancamentos.push({ tabela, id: row.id, versao: row.versao ?? null, descricao: row.descricao, data: row.data, valor: row.valor, status: row.status });
        }
        const payload = {
          nome: args.nome.trim(),
          tipo: args.tipo,
          ativa: true,
          unidade_negocio: args.unidade_negocio ?? null,
          categoria_id: args.categoria_id ?? null,
          subcategoria_id: args.subcategoria_id ?? null,
          setor_id: args.setor_id ?? null,
        };
        const summary = `Criar série "${payload.nome}" (${args.tipo}) e vincular ${lancamentos.length} lançamento(s) por ID.`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_CRIACAO_SERIE, args as any, null, { payload, lancamentos }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, depois: payload, lancamentos: sanitize(lancamentos) });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    TOOL.PREPARAR_ENCERRAMENTO_SERIE,
    {
      title: 'Preparar encerramento de série de recorrência',
      description:
        'Prepara o encerramento de uma série: nenhuma nova ocorrência é gerada a partir da data informada. ' +
        'Os lançamentos já pagos são preservados intactos.',
      inputSchema: {
        serie_id: z.string().uuid(),
        encerrada_em: dataStr('Data a partir da qual a série deixa de gerar ocorrências.'),
        motivo: z.string().min(3).max(500),
      },
      annotations: RW_PREP,
    },
    async (args) => {
      try {
        assertNoIdentityArgs(args);
        const { data: serie, error } = await ctx.supabase.from('series_recorrencia').select('*').eq('id', args.serie_id).maybeSingle();
        if (error) return fail(error.message);
        if (!serie) return fail('Série não encontrada ou sem acesso.');
        if (serie.ativa === false) return fail(`A série "${serie.nome}" já está encerrada em ${serie.encerrada_em ?? 'data não informada'}.`);
        const updates = { ativa: false, encerrada_em: args.encerrada_em, motivo_encerramento: args.motivo };
        const before = sanitize(serie) as Record<string, unknown>;
        const summary = `Encerrar a série "${serie.nome}" em ${formatDateBR(args.encerrada_em)} — motivo: ${args.motivo}. Pagamentos históricos permanecem.`;
        const op = await registrarOperacao(ctx, TOOL.PREPARAR_ENCERRAMENTO_SERIE, args as any, before, { tabela: 'series_recorrencia', id: args.serie_id, versao: serie.versao ?? null, updates }, summary);
        return text({ confirmation_id: op.id, expires_at: op.expires_at, status: 'pending', resumo: summary, antes: before, depois: sanitize({ ...serie, ...updates }) });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  return server;
}
