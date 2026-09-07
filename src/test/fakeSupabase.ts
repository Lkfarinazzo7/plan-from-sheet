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
      const created = { id: this.db.nextId(), created_at: new Date().toISOString(), ...this.payload };
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

export class FakeDb {
  private tables = new Map<string, Row[]>();
  private seq = 0;

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables.set(t, rows.map((r) => ({ ...r })));
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
        if (fn !== 'mcp_claim_operacao') return { data: null, error: { message: `rpc desconhecida: ${fn}` } };
        const op = db.rows('mcp_operacoes').find((o) => o.id === params._id);
        if (!op || op.status !== 'pending') {
          return { data: null, error: { message: 'Operação não está pendente.' } };
        }
        op.status = 'executed';
        op.executed_at = new Date().toISOString();
        return { data: op.id, error: null };
      },
    };
  }
}
