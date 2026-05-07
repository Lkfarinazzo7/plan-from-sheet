import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateReceita, useVendedores, useOperadoras } from '@/hooks/useFinancialData';
import { useToast } from '@/hooks/use-toast';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import { Loader2 } from 'lucide-react';

export type ReceitaInitial = {
  data?: string;
  descricao?: string;
  categoria?: string;
  operadora_id?: string | null;
  vendedor_id?: string | null;
  valor?: number;
  status?: string;
  unidade_negocio?: string | null;
};

export function ReceitaPromoteDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ReceitaInitial;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createReceita = useCreateReceita();
  const { data: vendedores = [] } = useVendedores();
  const { data: operadoras = [] } = useOperadoras();
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [form, setForm] = useState({
    data: initial.data || today,
    descricao: initial.descricao || '',
    categoria: initial.categoria || 'Bancária',
    operadora_id: initial.operadora_id || '',
    vendedor_id: initial.vendedor_id || '',
    valor: String(initial.valor ?? ''),
    status: initial.status || 'Aguardando',
    unidade_negocio: initial.unidade_negocio || 'none',
  });

  useEffect(() => {
    if (open) {
      setForm({
        data: initial.data || today,
        descricao: initial.descricao || '',
        categoria: initial.categoria || 'Bancária',
        operadora_id: initial.operadora_id || '',
        vendedor_id: initial.vendedor_id || '',
        valor: String(initial.valor ?? ''),
        status: initial.status || 'Aguardando',
        unidade_negocio: initial.unidade_negocio || 'none',
      });
    }
    // eslint-disable-next-line
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.operadora_id || !form.vendedor_id) {
      toast({ title: 'Selecione operadora e vendedor', variant: 'destructive' });
      return;
    }
    try {
      await createReceita.mutateAsync({
        ...form,
        valor: parseFloat(form.valor) || 0,
        unidade_negocio: form.unidade_negocio === 'none' ? null : form.unidade_negocio,
      });
      toast({ title: 'Receita lançada com sucesso!' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Lançar Receita (Implantação)</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bancária">Bancária</SelectItem>
                  <SelectItem value="Vida">Vida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Operadora *</Label>
              <Select value={form.operadora_id} onValueChange={(v) => setForm({ ...form, operadora_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {operadoras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vendedor *</Label>
              <Select value={form.vendedor_id} onValueChange={(v) => setForm({ ...form, vendedor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Recebido">Recebido</SelectItem>
                  <SelectItem value="Aguardando">Aguardando</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Select value={form.unidade_negocio} onValueChange={(v) => setForm({ ...form, unidade_negocio: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {UNIDADES_NEGOCIO.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createReceita.isPending}>
              {createReceita.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Lançar receita
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
