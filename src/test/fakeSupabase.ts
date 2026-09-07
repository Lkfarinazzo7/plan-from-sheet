/**
 * Adapter Supabase in-memory usado apenas em testes.
 * Não toca em produção: todos os dados vivem em memória neste processo.
 */

type Row = Record<string, any>;

function matches(row: Row, filters: Array<[string, string, any]>) {
  return filters.every(([op, col, val]) => {
    const v = row[col];
    if (op === 'eq') return v === val;
    if (op === 'is') return (v ?? null) === val;
    if (op === 'not_is') return (v ?? null) !== val;
    if (op === 'in') return Array.isArray(val) && val.includes(v);
    if (op === 'ilike') {
      const needle = String(val).replace(/%/g, '').toLowerCase();
      return String(v ?? '').toLowerCase().includes(needle);
    }
    if (op === 'gte') return String(v) >= String(val);
    if (op === 'lte') return String(v) <= String(val);
    return true;
  });
}

class Query implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Array<[string, string, any]> = [];
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | null = null;
  private limitN: number | null = null;
  private fromN = 0;


  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, _opts?: unknown) {
    if (this.mode === 'select') this.mode = 'select';
    return this;
  }
  insert(payload: Row) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push(['eq', col, val]);
    return this;
  }
  is(col: string, val: any) {
    this.filters.push(['is', col, val]);
    return this;
  }
  not(col: string, op: string, val: any) {
    if (op === 'is') this.filters.push(['not_is', col, val]);
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push(['in', col, vals]);
    return this;
  }
  ilike(col: string, val: any) {
    this.filters.push(['ilike', col, val]);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push(['gte', col, val]);
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push(['lte', col, val]);
    return this;
  }
  order() {
    return this;
  }
  range(from: number, to: number) {
    this.fromN = from;
    this.limitN = to - from + 1;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }


  private run() {
    const rows = this.db.rows(this.table);
    if (this.mode === 'insert') {
      // Defaults do banco para as colunas NOT NULL DEFAULT.
      const defaults =
        this.table === 'receitas' || this.table === 'despesas'
          ? { cancelado: false, versao: 1, recorrente: false }
          : {};
      const created = { id: this.db.nextId(), created_at: new Date().toISOString(), ...defaults, ...this.payload };
      rows.push(created);
      return { data: [created], error: null, count: 1 };
    }
    const hit = rows.filter((r) => matches(r, this.filters));
    if (this.mode === 'update') {
      hit.forEach((r) => Object.assign(r, this.payload));
      return { data: hit, error: null, count: hit.length };
    }
    const out = this.limitN === null ? hit.slice(this.fromN) : hit.slice(this.fromN, this.fromN + this.limitN);
    return { data: out, error: null, count: hit.length };
  }

  single() {
    const r = this.run();
    if (!r.data.length) return Promise.resolve({ data: null, error: { message: 'no rows' } });
    return Promise.resolve({ data: r.data[0], error: null });
  }
  maybeSingle() {
    const r = this.run();
    return Promise.resolve({ data: r.data[0] ?? null, error: null });
  }
  then<T1 = any, T2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

/** Mesma allowlist da função SQL mcp_executar_operacao. */
const CAMPOS_PERMITIDOS: Record<string, string[]> = {
  categorias_despesa: ['nome', 'grupo_dre', 'tipo_dre', 'ativo'],
  subcategorias_despesa: ['nome', 'categoria_id', 'grupo_dre', 'ativo'],
  series_recorrencia: ['nome', 'tipo', 'ativa', 'encerrada_em', 'motivo_encerramento', 'unidade_negocio', 'categoria_id', 'subcategoria_id', 'setor_id', 'user_id'],
  receitas: ['data', 'descricao', 'categoria', 'categoria_id', 'subcategoria_id', 'setor_id', 'responsavel', 'recorrente', 'operadora_id', 'vendedor_id', 'contrato_id', 'valor', 'comissao', 'status', 'unidade_negocio', 'observacoes', 'competencia', 'vencimento', 'data_recebimento', 'ocorrencia', 'serie_id', 'cancelado', 'cancelado_em', 'motivo_cancelamento', 'user_id'],
  despesas: ['data', 'descricao', 'categoria_id', 'subcategoria_id', 'setor_id', 'responsavel', 'recorrente', 'tipo', 'valor', 'status', 'unidade_negocio', 'observacoes', 'competencia', 'vencimento', 'data_pagamento', 'ocorrencia', 'serie_id', 'cancelado', 'cancelado_em', 'motivo_cancelamento', 'user_id'],
};

export class FakeDb {
  private tables = new Map<string, Row[]>();
  private seq = 0;
  /** Usuário da sessão (equivale a auth.uid() nas checagens da RPC). */
  userId: string;

  constructor(seed: Record<string, Row[]> = {}, userId?: string) {
    for (const [t, rows] of Object.entries(seed)) this.tables.set(t, rows.map((r) => ({ ...r })));
    this.userId =
      userId ??
      (Object.values(seed).flat().find((r) => typeof r.user_id === 'string')?.user_id as string) ??
      '';
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  nextId() {
    this.seq += 1;
    const n = String(this.seq).padStart(12, '0');
    return `00000000-0000-4000-8000-${n}`;
  }

  /** Cliente com a superfície usada pelo servidor MCP. */
  client() {
    const db = this;
    return {
      from: (table: string) => new Query(db, table),
      rpc: async (fn: string, params: Record<string, any>) => {
        const err = (message: string) => ({ data: null, error: { message } });
        if (fn === 'mcp_executar_operacao') {
          // Espelha a função SQL: plano PERSISTIDO, validação completa, gravação e auditoria numa transação única.
          if (Object.keys(params).some((k) => k !== '_op_id')) return err('Parâmetro não suportado: o plano vem da prévia.');
          const op = db.rows('mcp_operacoes').find((o) => o.id === params._op_id);
          if (!op) return err('Operação não encontrada');
          if (op.user_id !== db.userId) return err('Operação de outro usuário');
          if (op.status !== 'pending') return err(`Operação já processada (status: ${op.status})`);
          if (op.expires_at && new Date(op.expires_at).getTime() <= Date.now()) {
            op.status = 'expired';
            return err('Operação expirada');
          }
          const plano = op.plano;
          if (!plano || typeof plano !== 'object') return err('Operação sem plano persistido: refaça o preparo.');
          const inserts: any[] = plano.inserts || [];
          const updates: any[] = plano.updates || [];
          const total = inserts.length + updates.length;
          if (!total) return err('Plano vazio: nada a executar.');
          if (total > 200) return err(`Plano com ${total} itens excede o limite de 200.`);

          // Valida TUDO antes de tocar em qualquer linha.
          const alvos: Array<[Row, any]> = [];
          const vistos = new Set<string>();
          for (const it of [...inserts, ...updates]) {
            const permitidos = CAMPOS_PERMITIDOS[it.tabela];
            if (!permitidos) return err(`Tabela não permitida: ${it.tabela}`);
            const chaves = [...Object.keys(it.row || it.patch || {}), ...Object.keys(it.refs || {})];
            for (const k of chaves) {
              if (!permitidos.includes(k)) return err(`Campo não permitido em ${it.tabela}: ${k}`);
            }
          }
          for (const it of updates) {
            if (!it.id) return err(`Alteração sem identificador em ${it.tabela}`);
            const chave = `${it.tabela}:${it.id}`;
            if (vistos.has(chave)) return err(`Registro repetido no plano: ${it.id} em ${it.tabela}`);
            vistos.add(chave);
            if (!Object.keys(it.patch || {}).length && !Object.keys(it.refs || {}).length) {
              return err(`Alteração sem campos para o registro ${it.id} em ${it.tabela}`);
            }
            const row = db.rows(it.tabela).find((r) => r.id === it.id && (r.user_id === undefined || r.user_id === db.userId));
            if (!row) return err(`Registro ${it.id} não encontrado em ${it.tabela} (ou sem acesso)`);
            if ((row.versao ?? null) != null) {
              if (it.versao == null) return err(`Alteração de ${it.id} sem versão de referência: refaça o preparo.`);
              if (row.versao !== it.versao) {
                return err(`Registro ${it.id} foi alterado depois do preparo (versão ${row.versao} vs ${it.versao}). Refaça o preparo.`);
              }
            }
            alvos.push([row, it]);
          }

          const refs = new Map<string, string>();
          const inseridos: any[] = [];
          const auditar = (tabela: string, id: string, acao: string, antes: any, depois: any) =>
            db.rows('mcp_auditoria_registros').push({
              id: db.nextId(), operacao_id: op.id, user_id: db.userId, tabela, registro_id: id, acao, antes, depois,
              created_at: new Date().toISOString(),
            });

          for (const it of inserts) {
            const padroes =
              it.tabela === 'receitas' || it.tabela === 'despesas'
                ? { cancelado: false, versao: 1, recorrente: false }
                : {};
            const created = { id: db.nextId(), created_at: new Date().toISOString(), ...padroes, ...it.row };
            db.rows(it.tabela).push(created);
            if (it.ref) refs.set(it.ref, created.id);
            inseridos.push({ tabela: it.tabela, registro: { ...created } });
            auditar(it.tabela, created.id, 'insert', null, { ...created });
          }
          for (const it of updates) {
            for (const v of Object.values((it.refs || {}) as Record<string, string>)) {
              if (!refs.has(v)) return err(`Referência ${v} não resolvida no plano`);
            }
          }
          const atualizados: any[] = [];
          for (const [row, it] of alvos) {
            const antes = { ...row };
            const patch: Row = { ...(it.patch || {}) };
            for (const [k, v] of Object.entries((it.refs || {}) as Record<string, string>)) patch[k] = refs.get(v);
            Object.assign(row, patch);
            // Gatilho do banco: toda alteração incrementa a versão.
            if ((row.versao ?? null) != null) row.versao = Number(antes.versao) + 1;
            atualizados.push({ tabela: it.tabela, id: it.id, antes, depois: { ...row } });
            auditar(it.tabela, it.id, 'update', antes, { ...row });
          }
          op.status = 'executed';
          op.executed_at = new Date().toISOString();
          op.item_count = total;
          // O plano nunca é sobrescrito pelo resultado.
          op.before_data = { registros: atualizados.map((a) => a.antes) };
          op.after_data = { registros: [...inseridos.map((i) => i.registro), ...atualizados.map((a) => a.depois)] };
          return { data: { status: 'executed', itens: total, inserts: inseridos, updates: atualizados }, error: null };
        }
        return { data: null, error: { message: `rpc desconhecida: ${fn}` } };
      },
    };
  }
}
