import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/format';
import { Trash2, CalendarDays, Users, CheckCircle2, AlertCircle, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTagColor, getTipoColor, tagStyle } from '@/lib/tagColor';
import { getPendencias } from '@/lib/pipelinePendencias';

export type PipelineItem = {
  id: string;
  cliente: string;
  numero_proposta?: string | null;
  tipo: string;
  valor_mensal: number;
  data_vigencia?: string | null;
  data_revisao?: string | null;
  observacoes?: string | null;
  etapa: string;
  operadora_id?: string | null;
  canal_id?: string | null;
  vendedor_id?: string | null;
  declinada?: boolean | null;
  motivo_declinio?: string | null;
  declinada_em?: string | null;
  operadora?: { nome: string } | null;
  canal?: { nome: string } | null;
  dados_proposta?: { vidas?: number; cnpj_cpf?: string } | null;
};

export function PipelineCard({
  item,
  onEdit,
  onDelete,
}: {
  item: PipelineItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { etapa: item.etapa },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  const tipoPalette = getTipoColor(item.tipo);
  const operadoraPalette = getTagColor(item.operadora?.nome);
  const canalPalette = getTagColor(item.canal?.nome);
  const pendencias = getPendencias(item);

  const revisao = (() => {
    if (!item.data_revisao) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = item.data_revisao.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: `Revisar há ${Math.abs(diff)}d`, cls: 'bg-destructive/15 text-destructive border-destructive/40', urgent: true };
    if (diff === 0) return { label: 'Revisar HOJE', cls: 'bg-warning text-warning-foreground border-warning shadow-sm', urgent: true };
    if (diff <= 7) return { label: `Revisar em ${diff}d`, cls: 'bg-primary/15 text-primary border-primary/30', urgent: false };
    return { label: formatDate(item.data_revisao), cls: 'bg-muted text-muted-foreground border-border', urgent: false };
  })();
  const isUrgent = !!revisao?.urgent;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onClick={() => { if (!isDragging) onEdit(); }}
      className={`group p-3 mb-2 rounded-xl cursor-pointer active:cursor-grabbing select-none border shadow-sm hover:shadow-md transition-all ${
        isUrgent ? 'border-warning/60 bg-warning/5 ring-2 ring-warning/40' : 'border-border/60 hover:border-primary/40'
      } ${isDragging ? 'ring-2 ring-primary/40 shadow-lg' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate leading-tight">{item.cliente}</div>
          {item.numero_proposta && (
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">#{item.numero_proposta}</div>
          )}
        </div>
        <span
          className="shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
          style={tagStyle(tipoPalette)}
        >
          {item.tipo}
        </span>
      </div>

      {revisao && (
        <div className="mt-2">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-bold ${revisao.cls} ${isUrgent ? 'text-[12px] uppercase' : 'text-[10.5px]'}`}>
            <CalendarClock className={isUrgent ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
            {revisao.label}
          </span>
        </div>
      )}

      {(item.operadora?.nome || item.canal?.nome) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.operadora?.nome && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold max-w-[160px] truncate" style={tagStyle(operadoraPalette)} title={item.operadora.nome}>
              {item.operadora.nome}
            </span>
          )}
          {item.canal?.nome && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold max-w-[160px] truncate" style={tagStyle(canalPalette)} title={item.canal.nome}>
              {item.canal.nome}
            </span>
          )}
        </div>
      )}

      {(item.data_vigencia || (item.dados_proposta?.vidas != null && item.dados_proposta.vidas > 0)) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {item.data_vigencia && (
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{formatDate(item.data_vigencia)}</span>
            </div>
          )}
          {item.dados_proposta?.vidas != null && item.dados_proposta.vidas > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span>{item.dados_proposta.vidas}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between">
        <span className="text-base font-semibold tabular-nums">{formatCurrency(Number(item.valor_mensal) || 0)}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-border/40">
        {pendencias.length === 0 ? (
          <div className="flex items-center gap-1 text-[10.5px] font-medium text-success">
            <CheckCircle2 className="h-3 w-3" />
            Tudo preenchido
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-[10.5px] font-semibold text-warning">
              <AlertCircle className="h-3 w-3" />
              Faltam {pendencias.length}:
            </div>
            <div className="text-[10.5px] text-muted-foreground leading-tight">
              {pendencias.slice(0, 3).join(' · ')}
              {pendencias.length > 3 && ` · +${pendencias.length - 3}`}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
