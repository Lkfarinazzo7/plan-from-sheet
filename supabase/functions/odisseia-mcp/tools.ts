// Registro único e tipado dos nomes das tools do MCP Financeiro Odisseia.
// Toda referência a nome de tool (registerTool, despacho de confirmar_operacao,
// testes e documentação) DEVE usar estas constantes.

export const SERVER_NAME = 'financeiro-odisseia';
export const SERVER_VERSION = '1.0.1';

export const TOOL = {
  CONSULTAR_DASHBOARD: 'consultar_dashboard',
  GERAR_DRE: 'gerar_dre',
  CONSULTAR_FLUXO_CAIXA: 'consultar_fluxo_caixa',
  LISTAR_RECEITAS: 'listar_receitas',
  LISTAR_DESPESAS: 'listar_despesas',
  BUSCAR_CONTRATO: 'buscar_contrato',
  CONSULTAR_COMISSOES: 'consultar_comissoes',
  LISTAR_CADASTROS: 'listar_cadastros',
  OBTER_OPERACAO: 'obter_operacao',
  PREPARAR_CRIACAO_RECEITA: 'preparar_criacao_receita',
  PREPARAR_CRIACAO_DESPESA: 'preparar_criacao_despesa',
  PREPARAR_ALTERACAO_LANCAMENTO: 'preparar_alteracao_lancamento',
  PREPARAR_MARCACAO_STATUS: 'preparar_marcacao_status',
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
  TOOL.CONSULTAR_FLUXO_CAIXA,
  TOOL.LISTAR_RECEITAS,
  TOOL.LISTAR_DESPESAS,
  TOOL.BUSCAR_CONTRATO,
  TOOL.CONSULTAR_COMISSOES,
  TOOL.LISTAR_CADASTROS,
  TOOL.OBTER_OPERACAO,
];

/** Tools "preparar_*" cujo resultado é executado por confirmar_operacao. */
export const PREPARE_TOOLS: ToolName[] = [
  TOOL.PREPARAR_CRIACAO_RECEITA,
  TOOL.PREPARAR_CRIACAO_DESPESA,
  TOOL.PREPARAR_ALTERACAO_LANCAMENTO,
  TOOL.PREPARAR_MARCACAO_STATUS,
];
