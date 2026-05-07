import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Wallet, Layers, CalendarClock, Ban } from 'lucide-react';
import { PipelineColumn } from '@/components/pipeline/PipelineColumn';
import { PipelineItem } from '@/components/pipeline/PipelineCard';
import { PipelineForm, PipelineFormValues } from '@/components/pipeline/PipelineForm';
import { DeclinadasDialog } from '@/components/pipeline/DeclinadasDialog';
import { ReceitaPromoteDialog, ReceitaInitial } from '@/components/receitas/ReceitaPromoteDialog';
import { formatCurrency } from '@/lib/format';

const ETAPAS = [
  'Montagem de contrato',
  'Assinatura / Declaração de saúde',
  'Entrevista médica',
  'Em análise',
  'Pendências',
  'Aguardando vigência',
  'Implantado',
] as const;

const ETAPA_ACCENT: Record<string, string> = {
  'Montagem de contrato': 'bg-muted-foreground/40',
  'Assinatura / Declaração de saúde': 'bg-primary/70',
  'Entrevista médica': 'bg-primary',
  'Em análise': 'bg-warning/80',
  'Pendências': 'bg-destructive/70',
  'Aguardando vigência': 'bg-success/60',
  'Implantado': 'bg-success',
};

export default function Pipeline() {
  const { toast } = useToast();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineFormValues | null>(null);
  const [onlyRevisar, setOnlyRevisar] = useState(false);
  const [declinadasOpen, setDeclinadasOpen] = useState(false);
  const [declinadasCount, setDeclinadasCount] = useState(0);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoting, setPromoting] = useState<PipelineItem | null>(null);
  const [promoteInitial, setPromoteInitial] = useState<ReceitaInitial | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    const { data, error } = await supabase
      .from('pipeline_contratos')
      .select('*, operadora:operadoras(nome), canal:canais_venda(nome)')
      .neq('etapa', 'Implantado')
      .eq('declinada', false)
      .order('posicao');
    if (error) {
      toast({ title: 'Erro ao carregar pipeline', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((data as any) ?? []);
    const { count } = await supabase
      .from('pipeline_contratos')
      .select('id', { count: 'exact', head: true })
      .eq('declinada', true);
    setDeclinadasCount(count ?? 0);
  };

  useEffect(() => { document.title = 'Pipeline'; load(); }, []);

  const today = new Date().toISOString().slice(0, 10);

  const grouped = useMemo(() => {
    const map: Record<string, PipelineItem[]> = {};
    for (const e of ETAPAS) map[e] = [];
    const filtered = onlyRevisar ? items.filter((i) => i.data_revisao && i.data_revisao <= today) : items;
    for (const it of filtered) if (map[it.etapa]) map[it.etapa].push(it);
    for (const e of ETAPAS) {
      map[e].sort((a, b) => {
        const au = a.data_revisao && a.data_revisao <= today ? 0 : 1;
        const bu = b.data_revisao && b.data_revisao <= today ? 0 : 1;
        return au - bu;
      });
    }
    return map;
  }, [items, onlyRevisar, today]);

  const totalGeral = useMemo(() => items.reduce((s, i) => s + Number(i.valor_mensal || 0), 0), [items]);
  const revisarHoje = useMemo(
    () => items.filter((i) => i.data_revisao && i.data_revisao <= today).length,
    [items, today],
  );

  const handlePromote = (item: PipelineItem) => {
    setPromoting(item);
    setPromoteInitial({
      descricao: item.cliente,
      categoria: 'Bancária',
      operadora_id: item.operadora_id ?? null,
      vendedor_id: item.vendedor_id ?? null,
      valor: Number(item.valor_mensal) || 0,
      data: item.data_vigencia ?? today,
      status: 'Aguardando',
    });
    setPromoteOpen(true);
  };

  const onReceitaSaved = async () => {
    if (!promoting) return;
    await supabase.from('pipeline_contratos').update({ etapa: 'Implantado' as any }).eq('id', promoting.id);
    setPromoting(null);
    setPromoteInitial(null);
    toast({ title: 'Implantado!', description: 'Proposta movida e receita lançada.' });
    load();
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const id = e.active.id as string;
    const newEtapa = e.over?.id as string | undefined;
    if (!newEtapa) return;
    const item = items.find((i) => i.id === id);
    if (!item || item.etapa === newEtapa) return;

    if (newEtapa === 'Implantado') {
      handlePromote(item);
      return;
    }
    setItems((p) => p.map((i) => (i.id === id ? { ...i, etapa: newEtapa } : i)));
    const { error } = await supabase.from('pipeline_contratos').update({ etapa: newEtapa as any }).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao mover', description: error.message, variant: 'destructive' });
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta proposta do pipeline?')) return;
    await supabase.from('pipeline_contratos').delete().eq('id', id);
    toast({ title: 'Proposta excluída' });
    load();
  };

  const handleEdit = (item: PipelineItem) => {
    setEditing({
      id: item.id,
      cliente: item.cliente,
      numero_proposta: item.numero_proposta ?? null,
      tipo: item.tipo as any,
      operadora_id: item.operadora_id ?? null,
      canal_id: item.canal_id ?? null,
      vendedor_id: item.vendedor_id ?? null,
      valor_mensal: Number(item.valor_mensal) || 0,
      data_vigencia: item.data_vigencia ?? null,
      data_revisao: item.data_revisao ?? null,
      etapa: item.etapa,
      observacoes: item.observacoes ?? null,
      dados_proposta: (item as any).dados_proposta ?? null,
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Propostas em andamento até a implantação</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDeclinadasOpen(true)}>
            <Ban className="h-4 w-4" /> Declinadas
            {declinadasCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 min-w-5 h-5">
                {declinadasCount}
              </span>
            )}
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova proposta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total em pipeline</div>
            <div className="text-lg font-semibold tabular-nums">{formatCurrency(totalGeral)}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Propostas ativas</div>
            <div className="text-lg font-semibold tabular-nums">{items.length}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-warning/15 text-warning flex items-center justify-center">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Para revisar hoje</div>
              <div className="text-lg font-semibold tabular-nums">{revisarHoje}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="only-revisar" checked={onlyRevisar} onCheckedChange={setOnlyRevisar} />
            <Label htmlFor="only-revisar" className="text-xs cursor-pointer">Filtrar</Label>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ETAPAS.map((etapa) => (
            <PipelineColumn
              key={etapa}
              etapa={etapa}
              items={grouped[etapa]}
              accentClass={ETAPA_ACCENT[etapa]}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </DndContext>

      <PipelineForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={load} />
      <DeclinadasDialog open={declinadasOpen} onOpenChange={setDeclinadasOpen} onChanged={load} />
      {promoteInitial && (
        <ReceitaPromoteDialog
          open={promoteOpen}
          onOpenChange={(v) => {
            setPromoteOpen(v);
            if (!v) { setPromoting(null); setPromoteInitial(null); }
          }}
          initial={promoteInitial}
          onSaved={onReceitaSaved}
        />
      )}
    </div>
  );
}
