import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { carregarLancamentosRelatorio, dataLocal, fetchAllRows } from '@/lib/financialReporting';
import { formatCurrency } from '@/lib/format';
import { qualidadeFinanceira, type LancamentoExec } from '@/lib/painelExecutivo';

const percentual = (valor: number | null | undefined) => valor == null ? '—' : `${valor.toFixed(1)}%`;

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0"><span className="text-sm text-muted-foreground">{rotulo}</span><span className="font-semibold tabular-nums">{valor}</span></div>;
}

export function QualidadeFinanceira() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['qualidade-financeira'],
    queryFn: async () => {
      const [lancamentos, series] = await Promise.all([
        carregarLancamentosRelatorio(supabase) as Promise<LancamentoExec[]>,
        fetchAllRows((from, to) => supabase.from('series_recorrencia').select('id,nome,tipo,ativa').order('id').range(from, to)),
      ]);
      return qualidadeFinanceira(lancamentos, series as any);
    },
  });
  const encerrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('series_recorrencia').update({
        ativa: false,
        encerrada_em: dataLocal(new Date()),
        motivo_encerramento: 'Série duplicada (painel de qualidade)',
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualidade-financeira'] });
      toast.success('Série encerrada. Nada foi apagado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
          <div>
            <CardTitle className="text-base">Qualidade financeira</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Cobertura {percentual(data?.cobertura_pct)} · {data?.seriesDuplicadas.length ?? 0} série(s) para revisar</p>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={open ? 'Recolher Qualidade financeira' : 'Expandir Qualidade financeira'}>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="grid gap-x-8 border-t pt-4 md:grid-cols-2">
            {!data ? <p className="text-sm text-muted-foreground">Carregando qualidade financeira…</p> : <>
              <Linha rotulo="Sem competência" valor={String(data.itens.sem_competencia.quantidade)} />
              <Linha rotulo="Pagos/recebidos sem data efetiva" valor={String(data.itens.liquidados_sem_data_efetiva.quantidade)} />
              <Linha rotulo="Abertos sem vencimento" valor={String(data.itens.abertos_sem_vencimento.quantidade)} />
              <Linha rotulo="Sem grupo DRE" valor={String(data.itens.sem_grupo_dre.quantidade)} />
              <Linha rotulo="Datas preenchidas por regra de legado" valor={String(data.itens.datas_de_legado.quantidade)} />
              <Linha rotulo="Séries recorrentes possivelmente duplicadas" valor={String(data.seriesDuplicadas.length)} />
              <Linha rotulo="Séries com 2+ lançamentos no mesmo mês" valor={String(data.ocorrenciasRepetidas.length)} />
              {data.seriesDuplicadas.length > 0 && <div className="pt-4 md:col-span-2">
                <p className="mb-2 text-xs text-muted-foreground">Séries com o mesmo nome podem gerar a mesma despesa duas vezes. Encerrar interrompe apenas os próximos meses.</p>
                <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Série</TableHead><TableHead className="text-right">Último valor</TableHead><TableHead>Último mês</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>{data.seriesDuplicadas.flatMap(grupo => grupo.series).map(serie => (
                    <TableRow key={serie.id}><TableCell>{serie.nome}</TableCell><TableCell className="text-right">{serie.valor == null ? '—' : formatCurrency(serie.valor)}</TableCell><TableCell>{serie.ultimo_mes ? serie.ultimo_mes.split('-').reverse().join('/') : '—'}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={encerrar.isPending} onClick={() => { if (confirm(`Encerrar a série "${serie.nome}"? Os lançamentos já feitos continuam.`)) encerrar.mutate(serie.id); }}>Encerrar esta série</Button></TableCell></TableRow>
                  ))}</TableBody>
                </Table></div>
              </div>}
            </>}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}