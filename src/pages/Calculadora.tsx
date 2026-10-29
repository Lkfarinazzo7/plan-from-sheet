import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useCustoFixoMes } from '@/hooks/useFinancialData';
import { calcularBreakEven, BREAK_EVEN_PADRAO } from '@/lib/breakEven';
import { formatCurrency, getCurrentMonthYear, getMonthName } from '@/lib/format';
import { RotateCcw } from 'lucide-react';

const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

export default function Calculadora() {
  const cur = getCurrentMonthYear();
  const [modo, setModo] = useState<'mes' | 'simular'>('mes');
  const [month, setMonth] = useState(cur.month);
  const [year, setYear] = useState(cur.year);
  const [simulado, setSimulado] = useState('');
  const [mult, setMult] = useState(String(BREAK_EVEN_PADRAO.multiplicadorComissao));
  const [corretor, setCorretor] = useState(String(BREAK_EVEN_PADRAO.pctCorretor));
  const [supervisor, setSupervisor] = useState(String(BREAK_EVEN_PADRAO.pctSupervisor));
  const [lead, setLead] = useState(String(BREAK_EVEN_PADRAO.pctLead));
  const { data: fixoMes, isLoading } = useCustoFixoMes(year, month, modo === 'mes');

  const custoFixo = modo === 'mes' ? fixoMes?.total ?? 0 : num(simulado);
  const r = calcularBreakEven({ custoFixo, multiplicadorComissao: num(mult), pctCorretor: num(corretor), pctSupervisor: num(supervisor), pctLead: num(lead) });

  const restaurar = () => {
    setMult(String(BREAK_EVEN_PADRAO.multiplicadorComissao)); setCorretor(String(BREAK_EVEN_PADRAO.pctCorretor));
    setSupervisor(String(BREAK_EVEN_PADRAO.pctSupervisor)); setLead(String(BREAK_EVEN_PADRAO.pctLead));
  };

  const Linha = ({ l, v, neg, bold }: { l: string; v: number; neg?: boolean; bold?: boolean }) => (
    <div className={`flex justify-between py-1.5 border-b last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground">{l}</span>
      <span className={neg ? 'text-destructive' : ''}>{neg ? '− ' : ''}{formatCurrency(v)}</span>
    </div>
  );

  return (
    <div className="space-y-6 font-body max-w-5xl">
      <h2 className="font-heading text-2xl font-bold">Calculadora de ponto de equilíbrio</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">1. Custo fixo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={modo} onValueChange={v => setModo(v as 'mes' | 'simular')}>
              <TabsList className="w-full"><TabsTrigger value="mes" className="flex-1">Puxar de um mês</TabsTrigger><TabsTrigger value="simular" className="flex-1">Simular valor</TabsTrigger></TabsList>
            </Tabs>
            {modo === 'mes' ? (
              <div className="space-y-2">
                <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
                <p className="text-2xl font-bold">{isLoading ? '…' : formatCurrency(fixoMes?.total ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{fixoMes?.quantidade ?? 0} despesas fixas em {getMonthName(month)} {year} (sem canceladas)</p>
              </div>
            ) : (
              <div className="space-y-1"><Label htmlFor="sim">Custo fixo mensal (R$)</Label><Input id="sim" inputMode="decimal" placeholder="Ex.: 34000" value={simulado} onChange={e => setSimulado(e.target.value)} /></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="font-heading text-base">2. Premissas</CardTitle>
            <Button variant="ghost" size="sm" onClick={restaurar}><RotateCcw className="h-4 w-4 mr-1" />Restaurar padrões</Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2"><Label htmlFor="mult">Comissão média recebida (x valor do contrato)</Label><Input id="mult" inputMode="decimal" value={mult} onChange={e => setMult(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="cor">Corretor (%)</Label><Input id="cor" inputMode="decimal" value={corretor} onChange={e => setCorretor(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="sup">Supervisor (%)</Label><Input id="sup" inputMode="decimal" value={supervisor} onChange={e => setSupervisor(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="lead">Lead (%)</Label><Input id="lead" inputMode="decimal" value={lead} onChange={e => setLead(e.target.value)} /></div>
            <p className="col-span-2 text-xs text-muted-foreground">Percentuais calculados sobre o valor do contrato.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">3. Resultado</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {r.possivel ? (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Produção necessária por mês para empatar</p>
                <p className="text-4xl font-bold text-primary">{formatCurrency(r.producaoNecessaria)}</p>
                <p className="text-sm text-muted-foreground mt-1">Sobram R$ {r.margemPorReal.toFixed(2).replace('.', ',')} de margem a cada R$ 1,00 produzido.</p>
              </div>
              <div className="text-sm max-w-md">
                <Linha l="Produção (valor de contratos)" v={r.producaoNecessaria ?? 0} />
                <Linha l="Comissão recebida" v={r.comissaoRecebida} />
                <Linha l="Corretor" v={r.corretor} neg />
                <Linha l="Supervisor" v={r.supervisor} neg />
                <Linha l="Lead" v={r.lead} neg />
                <Linha l="Margem" v={r.margem} bold />
                <Linha l="Custo fixo" v={custoFixo} neg />
                <Linha l="Resultado" v={r.margem - custoFixo} bold />
              </div>
            </>
          ) : (
            <p role="alert" className="text-destructive font-medium">Com essas premissas os pagamentos são maiores ou iguais à comissão recebida, então não existe ponto de equilíbrio.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
