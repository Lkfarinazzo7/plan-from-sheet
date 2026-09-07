// Registro único e tipado dos nomes das tools do MCP Financeiro Odisseia.
// Toda referência a nome de tool (registerTool, despacho de confirmar_operacao,
// testes e documentação) DEVE usar estas constantes.

export const SERVER_NAME = 'financeiro-odisseia';
export const SERVER_VERSION = '1.2.0';

export const TOOL = {
  CONSULTAR_DASHBOARD: 'consultar_dashboard',
  GERAR_DRE: 'gerar_dre',
  GERAR_DRE_COMPETENCIA: 'gerar_dre_competencia',
  CONSULTAR_FLUXO_CAIXA: 'consultar_fluxo_caixa',
  LISTAR_RECEITAS: 'listar_receitas',
  LISTAR_DESPESAS: 'listar_despesas',
  BUSCAR_CONTRATO: 'buscar_contrato',
  LISTAR_CONTRATOS: 'listar_contratos',
  OBTER_CONTRATO: 'obter_contrato',
  LISTAR_RECEITAS_POR_CONTRATO: 'listar_receitas_por_contrato',
  RELATORIO_CONTRATOS: 'relatorio_contratos',
  CONSULTAR_COMISSOES: 'consultar_comissoes',
  LISTAR_CADASTROS: 'listar_cadastros',
  LISTAR_CATEGORIAS: 'listar_categorias',
  LISTAR_SERIES: 'listar_series',
  OBTER_OPERACAO: 'obter_operacao',
  PREPARAR_CRIACAO_RECEITA: 'preparar_criacao_receita',
  PREPARAR_CRIACAO_DESPESA: 'preparar_criacao_despesa',
  PREPARAR_ALTERACAO_LANCAMENTO: 'preparar_alteracao_lancamento',
  PREPARAR_ALTERACAO_LOTE: 'preparar_alteracao_lote',
  PREPARAR_MARCACAO_STATUS: 'preparar_marcacao_status',
  PREPARAR_CANCELAMENTO_LANCAMENTO: 'preparar_cancelamento_lancamento',
  PREPARAR_CRIACAO_CATEGORIA: 'preparar_criacao_categoria',
  PREPARAR_ALTERACAO_CATEGORIA: 'preparar_alteracao_categoria',
  PREPARAR_CRIACAO_SUBCATEGORIA: 'preparar_criacao_subcategoria',
  PREPARAR_ALTERACAO_SUBCATEGORIA: 'preparar_alteracao_subcategoria',
  PREPARAR_CRIACAO_SERIE: 'preparar_criacao_serie',
  PREPARAR_ENCERRAMENTO_SERIE: 'preparar_encerramento_serie',
  CONFIRMAR_OPERACAO: 'confirmar_operacao',
  CANCELAR_OPERACAO: 'cancelar_operacao',
} as const;

export type ToolName = (typeof TOOL)[keyof typeof TOOL];

/** Lista canônica (ordem de registro). */
export const TOOL_NAMES: ToolName[] = Object.values(TOOL);

/** Tools somente leitura. */
export const READ_ONLY_TOOLS: ToolName[] = [
  TOOL.CONSULTAR_DASHBOARD,
  TOOL.GERAR_DRE,
  TOOL.GERAR_DRE_COMPETENCIA,
  TOOL.CONSULTAR_FLUXO_CAIXA,
  TOOL.LISTAR_RECEITAS,
  TOOL.LISTAR_DESPESAS,
  TOOL.BUSCAR_CONTRATO,
  TOOL.LISTAR_CONTRATOS,
  TOOL.OBTER_CONTRATO,
  TOOL.LISTAR_RECEITAS_POR_CONTRATO,
  TOOL.RELATORIO_CONTRATOS,
  TOOL.CONSULTAR_COMISSOES,
  TOOL.LISTAR_CADASTROS,
  TOOL.LISTAR_CATEGORIAS,
  TOOL.LISTAR_SERIES,
  TOOL.OBTER_OPERACAO,
];

/** Tools "preparar_*" cujo resultado é executado por confirmar_operacao. */
export const PREPARE_TOOLS: ToolName[] = [
  TOOL.PREPARAR_CRIACAO_RECEITA,
  TOOL.PREPARAR_CRIACAO_DESPESA,
  TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
  TOOL.PREPARAR_ALTERACAO_LOTE,
  TOOL.PREPARAR_MARCACAO_STATUS,
  TOOL.PREPARAR_CANCELAMENTO_LANCAMENTO,
  TOOL.PREPARAR_CRIACAO_CATEGORIA,
  TOOL.PREPARAR_ALTERACAO_CATEGORIA,
  TOOL.PREPARAR_CRIACAO_SUBCATEGORIA,
  TOOL.PREPARAR_ALTERACAO_SUBCATEGORIA,
  TOOL.PREPARAR_CRIACAO_SERIE,
  TOOL.PREPARAR_ENCERRAMENTO_SERIE,
];

/** Grupos canônicos do DRE (independentes de setor, unidade, Fixo/Variável e recorrência). */
export const GRUPOS_DRE = [
  'receita_operacional',
  'deducoes_receita',
  'custos_variaveis',
  'despesas_fixas',
  'despesas_comerciais',
  'resultado_financeiro',
  'depreciacao_amortizacao',
  'tributos_lucro',
  'fora_dre',
] as const;

export type GrupoDRE = (typeof GRUPOS_DRE)[number];
