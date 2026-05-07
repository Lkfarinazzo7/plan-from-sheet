import { useDroppable } from '@dnd-kit/core';
import { PipelineCard, PipelineItem } from './PipelineCard';
import { Inbox } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

export function PipelineColumn({
  etapa,
  items,
  accentClass = 'bg-primary',
  onEdit,
  onDelete,
}: {
  etapa: string;
  items: PipelineItem[];
  accentClass?: string;
  onEdit: (item: PipelineItem) => void;
  onDelete: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: etapa });
  const total = items.reduce((s, i) => s + Number(i.valor_mensal || 0), 0);

  return (
    <div className="w-80 shrink-0 flex flex-col rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
      <div className={`h-1 w-full ${accentClass}`} />
      <div className="px-3 py-2.5 border-b border-border/50 bg-card/40">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight truncate">{etapa}</h3>
          <span className="text-[11px] font-medium text-muted-foreground bg-background/70 border border-border/60 rounded-full px-2 py-0.5 tabular-nums">
            {items.length}
          </span>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{formatCurrency(total)}</div>
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[240px] p-2 transition-colors ${isOver ? 'bg-accent/40 ring-2 ring-inset ring-primary/30' : ''}`}>
        {items.map((item) => (
          <PipelineCard key={item.id} item={item} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center text-xs text-muted-foreground/70 py-10 gap-2">
            <Inbox className="h-6 w-6" />
            <span>Arraste propostas aqui</span>
          </div>
        )}
      </div>
    </div>
  );
}
