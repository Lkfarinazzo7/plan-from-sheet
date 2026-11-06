import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { isValidPeriod, periodLabel, periodRange } from '@/lib/exportPeriod';
import { useToast } from '@/hooks/use-toast';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  month: number;
  year: number;
  onExport: (start: string, end: string, label: string, applyFilters: boolean) => Promise<number>;
}

export function ExportPeriodDialog({ open, onOpenChange, title, month, year, onExport }: Props) {
  const { toast } = useToast();
  const [fm, setFm] = useState(month);
  const [fy, setFy] = useState(year);
  const [tm, setTm] = useState(month);
  const [ty, setTy] = useState(year);
  const [applyFilters, setApplyFilters] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setFm(month); setFy(year); setTm(month); setTy(year); } }, [open, month, year]);

  const today = new Date();
  const years = Array.from({ length: 8 }, (_, i) => today.getFullYear() - 5 + i);
  const valid = isValidPeriod(fm, fy, tm, ty);

  const set = (a: number, b: number, c: number, d: number) => { setFm(a); setFy(b); setTm(c); setTy(d); };

  const run = async () => {
    setBusy(true);
    try {
      const { start, end } = periodRange(fm, fy, tm, ty);
      const n = await onExport(start, end, periodLabel(fm, fy, tm, ty), applyFilters);
      toast({ title: 'Exportado', description: `${n} lançamento(s) exportado(s).` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao exportar', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const MonthYear = ({ m, y, onM, onY }: { m: number; y: number; onM: (v: number) => void; onY: (v: number) => void }) => (
    <div className="flex gap-2">
      <Select value={String(m)} onValueChange={v => onM(Number(v))}>
        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>{MESES.map((n, i) => <SelectItem key={i} value={String(i)}>{n}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={String(y)} onValueChange={v => onY(Number(v))}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>{years.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Escolha o período que vai para a planilha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => set(month, year, month, year)}>Mês atual</Button>
            <Button size="sm" variant="secondary" onClick={() => set(0, today.getFullYear(), today.getMonth(), today.getFullYear())}>Ano até hoje</Button>
            <Button size="sm" variant="secondary" onClick={() => set(0, year, 11, year)}>Ano inteiro ({year})</Button>
          </div>
          <div className="space-y-1"><Label>De</Label><MonthYear m={fm} y={fy} onM={setFm} onY={setFy} /></div>
          <div className="space-y-1"><Label>Até</Label><MonthYear m={tm} y={ty} onM={setTm} onY={setTy} /></div>
          {!valid && <p className="text-sm text-destructive">O mês inicial precisa ser antes do mês final.</p>}
          <div className="flex items-center gap-2">
            <Checkbox id="apply-filters" checked={applyFilters} onCheckedChange={v => setApplyFilters(!!v)} />
            <Label htmlFor="apply-filters" className="font-normal">Aplicar os filtros da tela</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={run} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
