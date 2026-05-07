import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDate } from '@/lib/format';
import { RotateCw, Trash2 } from 'lucide-react';

export function DeclinadasDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from('pipeline_contratos')
      .select('*, operadora:operadoras(nome)')
      .eq('declinada', true)
      .order('declinada_em', { ascending: false });
    setItems((data as any) ?? []);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const restore = async (id: string) => {
    await supabase.from('pipeline_contratos').update({ declinada: false, declinada_em: null, motivo_declinio: null }).eq('id', id);
    toast({ title: 'Proposta restaurada' });
    load();
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir definitivamente?')) return;
    await supabase.from('pipeline_contratos').delete().eq('id', id);
    toast({ title: 'Proposta excluída' });
    load();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Propostas Declinadas</DialogTitle></DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma proposta declinada.</p>
        ) : (
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{i.cliente}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.operadora?.nome} · {formatCurrency(Number(i.valor_mensal) || 0)}
                    {i.declinada_em && ` · ${formatDate(i.declinada_em.slice(0, 10))}`}
                  </div>
                  {i.motivo_declinio && <div className="text-xs mt-1 italic">"{i.motivo_declinio}"</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => restore(i.id)}>
                    <RotateCw className="h-3.5 w-3.5" /> Restaurar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(i.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
