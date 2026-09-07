// Lógica pura do servidor MCP Financeiro Odisseia.
// Sem dependências de runtime (Deno/Supabase) para permitir testes unitários.

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const OPERATION_TTL_MS = 10 * 60 * 1000; // 10 minutos

export function clampLimit(limit?: number | null): number {
  if (limit === undefined || limit === null || Number.isNaN(Number(limit))) return DEFAULT_LIMIT;
  const n = Math.floor(Number(limit));
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

export function clampOffset(offset?: number | null): number {
  if (offset === undefined || offset === null || Number.isNaN(Number(offset))) return 0;
  const n = Math.floor(Number(offset));
  return n < 0 ? 0 : n;
}

export function formatBRL(value: number): string {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata YYYY-MM-DD como DD/MM/YYYY sem conversões de fuso. */
export function formatDateBR(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Valida uma data de CALENDÁRIO real em YYYY-MM-DD (regex sozinha aceitaria 2026-02-31).
 */
export function isDataValida(s: unknown): boolean {
  const v = String(s ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 1900 || ano > 2200) return false;
  if (mes < 1 || mes > 12) return false;
  if (dia < 1) return false;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

export const MSG_DATA_INVALIDA = 'Data inválida: use uma data real do calendário no formato YYYY-MM-DD.';

export function money(value: number | null | undefined) {
  const n = Number(value) || 0;
  return { valor: n, valor_formatado: formatBRL(n) };
}

export function dateFields(iso?: string | null) {
  return { data: iso ?? null, data_formatada: formatDateBR(iso) };
}

export type PeriodInput = {
  mes?: number | null;
  ano?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
};

export type Range = { sd: string; ed: string } | null;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Datas sempre em string local YYYY-MM-DD (sem UTC). */
export function resolveRange(input: PeriodInput): Range {
  if (input.data_inicio && input.data_fim) {
    if (!isDataValida(input.data_inicio) || !isDataValida(input.data_fim)) throw new Error(MSG_DATA_INVALIDA);
    if (input.data_inicio > input.data_fim) throw new Error('data_inicio não pode ser posterior a data_fim.');
    return { sd: input.data_inicio, ed: input.data_fim };
  }
  if (input.mes !== undefined && input.mes !== null && input.ano) {
    const mes = Number(input.mes);
    const ano = Number(input.ano);
    if (mes < 1 || mes > 12) throw new Error('Mês inválido: use 1 a 12');
    const lastDay = new Date(ano, mes, 0).getDate();
    return { sd: `${ano}-${pad(mes)}-01`, ed: `${ano}-${pad(mes)}-${pad(lastDay)}` };
  }
  return null;
}

export type DespesaDRE = { valor: number; tipo_dre?: string | null };

export type DREResultado = {
  receitaBruta: number;
  despesasOperacionais: number;
  margemOperacional: number;
  custosFixos: number;
  margemContribuicao: number;
  impostos: number;
  resultadoLiquido: number;
  margemOperacionalPercentual: number;
  margemContribuicaoPercentual: number;
  margemLiquidaPercentual: number;
};

/**
 * Mesma regra de cálculo usada pelo DRE da aplicação:
 * receita bruta considera apenas receitas recebidas (filtragem feita antes).
 */
export function computeDRE(receitas: { valor: number }[], despesas: DespesaDRE[]): DREResultado {
  const receitaBruta = receitas.reduce((a, x) => a + (Number(x.valor) || 0), 0);
  let despesasOperacionais = 0;
  let custosFixos = 0;
  let impostos = 0;
  for (const d of despesas) {
    const v = Number(d.valor) || 0;
    const t = d.tipo_dre || 'operacional';
    if (t === 'custo_fixo') custosFixos += v;
    else if (t === 'imposto') impostos += v;
    else despesasOperacionais += v;
  }
  const margemOperacional = receitaBruta - despesasOperacionais;
  const margemContribuicao = margemOperacional - custosFixos;
  const resultadoLiquido = margemContribuicao - impostos;
  const pct = (v: number) => (receitaBruta > 0 ? (v / receitaBruta) * 100 : 0);
  return {
    receitaBruta,
    despesasOperacionais,
    margemOperacional,
    custosFixos,
    margemContribuicao,
    impostos,
    resultadoLiquido,
    margemOperacionalPercentual: pct(margemOperacional),
    margemContribuicaoPercentual: pct(margemContribuicao),
    margemLiquidaPercentual: pct(resultadoLiquido),
  };
}

export const FORBIDDEN_ARG_KEYS = ['user_id', 'userid', 'usuario_id', 'owner_id', 'auth_uid', 'access_token', 'token', 'service_role', 'apikey'];

/** Nunca aceitar identidade ou credenciais vindas do cliente MCP. */
export function assertNoIdentityArgs(args: unknown): void {
  if (!args || typeof args !== 'object') return;
  for (const key of Object.keys(args as Record<string, unknown>)) {
    if (FORBIDDEN_ARG_KEYS.includes(key.toLowerCase())) {
      throw new Error(`Argumento não permitido: "${key}". A identidade do usuário é derivada do token de acesso.`);
    }
  }
}

const SENSITIVE_FIELDS = new Set(['user_id', 'access_token', 'refresh_token', 'token', 'apikey', 'password', 'senha']);

/** Remove campos sensíveis antes de devolver dados ao cliente MCP. */
export function sanitize<T>(row: T): T {
  if (Array.isArray(row)) return row.map((r) => sanitize(r)) as unknown as T;
  if (!row || typeof row !== 'object') return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(k.toLowerCase())) continue;
    out[k] = v && typeof v === 'object' ? sanitize(v) : v;
  }
  return out as T;
}

export type OperacaoStatus = 'pending' | 'executed' | 'cancelled' | 'expired' | 'failed';

export type OperacaoLike = {
  id: string;
  status: OperacaoStatus | string;
  expires_at: string;
};

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function expiresAtFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + OPERATION_TTL_MS).toISOString();
}

export type ConfirmCheck = { ok: true } | { ok: false; reason: string };

/** Impede replay: só operações pendentes e não expiradas podem ser confirmadas. */
export function canConfirm(op: OperacaoLike | null | undefined, now: Date = new Date()): ConfirmCheck {
  if (!op) return { ok: false, reason: 'Operação não encontrada ou pertence a outro usuário.' };
  if (op.status === 'executed') return { ok: false, reason: 'Esta operação já foi executada (não é possível repetir).' };
  if (op.status === 'cancelled') return { ok: false, reason: 'Esta operação foi cancelada.' };
  if (op.status === 'failed') return { ok: false, reason: 'Esta operação falhou e não pode ser confirmada novamente.' };
  if (op.status === 'expired') return { ok: false, reason: 'Esta operação expirou. Prepare a operação novamente.' };
  if (op.status !== 'pending') return { ok: false, reason: `Status inválido: ${op.status}.` };
  if (isExpired(op.expires_at, now)) return { ok: false, reason: 'Esta operação expirou (validade de 10 minutos). Prepare novamente.' };
  return { ok: true };
}

export type DiffLinha = { campo: string; antes: unknown; depois: unknown };

export function buildDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): DiffLinha[] {
  const linhas: DiffLinha[] = [];
  for (const [campo, depois] of Object.entries(after)) {
    const antes = before ? before[campo] : null;
    if (JSON.stringify(antes ?? null) !== JSON.stringify(depois ?? null)) {
      linhas.push({ campo, antes: antes ?? null, depois: depois ?? null });
    }
  }
  return linhas;
}

export function describeDiff(diff: DiffLinha[]): string {
  if (!diff.length) return 'Nenhuma alteração detectada.';
  return diff.map((d) => `${d.campo}: ${JSON.stringify(d.antes)} → ${JSON.stringify(d.depois)}`).join('; ');
}

/**
 * Guarda de transporte: detecta argumentos de identidade em um corpo JSON-RPC
 * antes que o schema da tool descarte chaves desconhecidas silenciosamente.
 */
export function findIdentityArgViolation(rawBody: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const msgs = Array.isArray(parsed) ? parsed : [parsed];
  for (const m of msgs as Array<Record<string, any>>) {
    if (m?.method !== 'tools/call') continue;
    const args = m?.params?.arguments;
    if (!args || typeof args !== 'object') continue;
    for (const key of Object.keys(args)) {
      if (FORBIDDEN_ARG_KEYS.includes(key.toLowerCase())) return key;
    }
  }
  return null;
}
