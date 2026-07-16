import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { DREResult } from '@/hooks/useFinancialData';

interface Props {
  dre: DREResult | null | undefined;
  isLoading?: boolean;
}

/**
 * DRE em cascata (waterfall).
 * Barras positivas em verde, negativas em vermelho, totalizadores em azul.
 */
export function DREWaterfall({ dre, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">DRE — Cascata</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-center py-8">Carregando…</p></CardContent>
      </Card>
    );
  }
  if (!dre) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">DRE — Cascata</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-center py-8">Selecione um período para ver o DRE.</p></CardContent>
      </Card>
    );
  }

  const { receitaBruta, despesasOperacionais, margemOperacional, custosFixos, margemContribuicao, impostos, resultadoLiquido } = dre;

  // Cada item vira uma barra "floating" com [base, top]. Positivos crescem, negativos descem.
  type Row = { name: string; base: number; top: number; delta: number; kind: 'in' | 'out' | 'total' };
  const rows: Row[] = [];
  let running = 0;
  const add = (name: string, delta: number, kind: Row['kind']) => {
    if (kind === 'total') {
      rows.push({ name, base: 0, top: delta, delta, kind });
      running = delta;
    } else if (kind === 'in') {
      rows.push({ name, base: running, top: running + delta, delta, kind });
      running += delta;
    } else {
      rows.push({ name, base: running - delta, top: running, delta: -delta, kind });
      running -= delta;
    }
  };
  add('Receita Bruta', receitaBruta, 'in');
  add('(-) Despesas Op.', despesasOperacionais, 'out');
  add('Margem Operacional', margemOperacional, 'total');
  add('(-) Custos Fixos', custosFixos, 'out');
  add('Margem Contribuição', margemContribuicao, 'total');
  add('(-) Impostos', impostos, 'out');
  add('Resultado Líquido', resultadoLiquido, 'total');

  // Recharts: usamos stacked bars — base transparente + delta colorido
  const data = rows.map(r => ({
    name: r.name,
    base: Math.min(r.base, r.top),
    valor: Math.abs(r.top - r.base),
    delta: r.delta,
    kind: r.kind,
  }));

  const colorFor = (r: Row) => {
    if (r.kind === 'total') return r.delta >= 0 ? 'hsl(215, 80%, 48%)' : 'hsl(0, 72%, 51%)';
    if (r.kind === 'in') return 'hsl(142, 71%, 45%)';
    return 'hsl(0, 72%, 51%)';
  };

  const pct = (v: number) => (receitaBruta > 0 ? `${((v / receitaBruta) * 100).toFixed(1)}%` : '—');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DRE — Cascata</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada barra mostra o impacto sobre o resultado. Totalizadores em azul.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-15} textAnchor="end" height={60} interval={0} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(_val, _name, entry: any) => {
                const r = entry.payload;
                return [`${formatCurrency(r.delta)} (${pct(Math.abs(r.delta))})`, r.name];
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="valor" stackId="a" radius={[4, 4, 0, 0]}>
              {rows.map((r, i) => <Cell key={i} fill={colorFor(r)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Tabela resumo abaixo do gráfico */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric label="Receita Bruta" value={receitaBruta} tone="in" />
          <Metric label="Margem Op." value={margemOperacional} pct={pct(margemOperacional)} tone="total" />
          <Metric label="Margem Contrib." value={margemContribuicao} pct={pct(margemContribuicao)} tone="total" />
          <Metric label="Resultado Líquido" value={resultadoLiquido} pct={pct(resultadoLiquido)} tone={resultadoLiquido >= 0 ? 'total' : 'out'} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, pct, tone }: { label: string; value: number; pct?: string; tone: 'in' | 'out' | 'total' }) {
  const cls = tone === 'in' ? 'text-success' : tone === 'out' ? 'text-destructive' : value >= 0 ? 'text-primary' : 'text-destructive';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${cls}`}>{formatCurrency(value)}</p>
      {pct && <p className="text-xs text-muted-foreground">{pct} da receita</p>}
    </div>
  );
}
