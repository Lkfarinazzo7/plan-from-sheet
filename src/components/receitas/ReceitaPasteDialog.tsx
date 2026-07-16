import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVendedores, useOperadoras, useBulkCreateReceita } from '@/hooks/useFinancialData';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Image as ImageIcon, X, AlertCircle } from 'lucide-react';

type ParsedRow = {
  data: string;
  descricao: string;
  valor: string;
  operadora_id: string;
  vendedor_id: string;
  categoria: string;
  status: string;
  selected: boolean;
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20_000;

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function matchByName<T extends { id: string; nome: string }>(items: T[], nome: string | null | undefined): string {
  if (!nome) return '';
  const n = norm(nome);
  if (!n) return '';
  // exact
  let found = items.find((i) => norm(i.nome) === n);
  if (found) return found.id;
  // includes both ways
  found = items.find((i) => norm(i.nome).includes(n) || n.includes(norm(i.nome)));
  return found?.id || '';
}

export function ReceitaPasteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: operadoras = [] } = useOperadoras();
  const { data: vendedores = [] } = useVendedores();
  const bulkCreate = useBulkCreateReceita();

  const [text, setText] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setText(''); setImageData(null); setRows(null); setLoading(false);
    }
  }, [open]);

  const loadImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Selecione um arquivo de imagem válido', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast({ title: 'Imagem muito grande', description: 'O limite é 3 MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.onerror = () => toast({ title: 'Não foi possível abrir a imagem', variant: 'destructive' });
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          loadImage(file);
          e.preventDefault();
          return;
        }
      }
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    loadImage(file);
  };

  const analyze = async () => {
    if (!text.trim() && !imageData) {
      toast({ title: 'Cole um texto ou imagem primeiro', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-receitas', {
        body: {
          text: text.trim() || undefined,
          image: imageData || undefined,
          operadoras: operadoras.map((o) => o.nome),
          vendedores: vendedores.map((v) => v.nome),
        },
      });
      if (error) throw error;
      const lancs: any[] = data?.lancamentos || [];
      if (lancs.length === 0) {
        toast({ title: 'Nenhum lançamento identificado', variant: 'destructive' });
        return;
      }
      const today = todayStr();
      setRows(
        lancs.map((l) => ({
          data: l.data || today,
          descricao: l.descricao || '',
          valor: String(l.valor ?? ''),
          operadora_id: matchByName(operadoras, l.operadora_nome),
          vendedor_id: matchByName(vendedores, l.vendedor_nome),
          categoria: l.categoria || 'Bancária',
          status: 'Aguardando',
          selected: true,
        }))
      );
    } catch (e: any) {
      toast({ title: 'Erro ao analisar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (i: number, patch: Partial<ParsedRow>) => {
    setRows((prev) => prev?.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) || null);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev?.filter((_, idx) => idx !== i) || null);
  };

  const submit = async () => {
    if (!rows) return;
    const selected = rows.filter((r) => r.selected);
    const invalid = selected.filter(
      (r) => !r.descricao || !r.valor || !Number.isFinite(Number(r.valor)) ||
        !r.operadora_id || !r.vendedor_id || !r.data
    );
    if (invalid.length > 0) {
      toast({
        title: 'Existem campos obrigatórios em branco',
        description: `${invalid.length} linha(s) sem operadora, vendedor, descrição, data ou valor.`,
        variant: 'destructive',
      });
      return;
    }
    if (selected.length === 0) {
      toast({ title: 'Selecione pelo menos uma linha', variant: 'destructive' });
      return;
    }
    try {
      await bulkCreate.mutateAsync(
        selected.map((r) => ({
          data: r.data,
          descricao: r.descricao,
          categoria: r.categoria,
          operadora_id: r.operadora_id,
          vendedor_id: r.vendedor_id,
          valor: Number(r.valor),
          status: r.status,
        }))
      );
      toast({ title: `${selected.length} receita(s) lançada(s)!` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Colar e identificar receitas
          </DialogTitle>
        </DialogHeader>

        {!rows && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cole um print (Ctrl+V) ou texto contendo os lançamentos. A IA vai identificar e abrir uma lista
              para você revisar antes de salvar.
            </p>

            <div
              onPaste={handlePaste}
              className="border-2 border-dashed rounded-lg p-4 min-h-[200px] focus-within:border-primary"
            >
              {imageData ? (
                <div className="relative inline-block">
                  <img src={imageData} alt="Pré-visualização" className="max-h-64 rounded border" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7 absolute -top-2 -right-2 rounded-full"
                    onClick={() => setImageData(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={MAX_TEXT_LENGTH}
                  placeholder="Cole o texto aqui ou pressione Ctrl+V para colar uma imagem..."
                  rows={8}
                  className="border-0 focus-visible:ring-0 resize-none"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImageIcon className="h-4 w-4 mr-1" /> Selecionar imagem
              </Button>
              {imageData && (
                <span className="text-xs text-muted-foreground">
                  Imagem carregada — também pode adicionar texto extra abaixo:
                </span>
              )}
            </div>

            {imageData && (
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                placeholder="(Opcional) Texto adicional..."
                rows={3}
              />
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={analyze} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Analisar com IA
              </Button>
            </DialogFooter>
          </div>
        )}

        {rows && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {rows.length} lançamento(s) detectado(s). Revise e ajuste antes de salvar.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setRows(null)}>Voltar</Button>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-[130px]">Data</TableHead>
                    <TableHead className="min-w-[200px]">Descrição</TableHead>
                    <TableHead className="w-[160px]">Operadora</TableHead>
                    <TableHead className="w-[160px]">Vendedor</TableHead>
                    <TableHead className="w-[120px]">Categoria</TableHead>
                    <TableHead className="w-[120px]">Valor (R$)</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const missing = !r.operadora_id || !r.vendedor_id || !r.descricao || !r.valor;
                    return (
                      <TableRow key={i} className={missing ? 'bg-warning/5' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={r.selected}
                            onCheckedChange={(v) => updateRow(i, { selected: !!v })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input type="date" value={r.data} onChange={(e) => updateRow(i, { data: e.target.value })} className="h-8" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {missing && <AlertCircle className="h-3 w-3 text-warning shrink-0" />}
                            <Input value={r.descricao} onChange={(e) => updateRow(i, { descricao: e.target.value })} className="h-8" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={r.operadora_id} onValueChange={(v) => updateRow(i, { operadora_id: v })}>
                            <SelectTrigger className={`h-8 ${!r.operadora_id ? 'border-warning' : ''}`}>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {operadoras.map((o) => (
                                <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={r.vendedor_id} onValueChange={(v) => updateRow(i, { vendedor_id: v })}>
                            <SelectTrigger className={`h-8 ${!r.vendedor_id ? 'border-warning' : ''}`}>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {vendedores.map((v) => (
                                <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={r.categoria} onValueChange={(v) => updateRow(i, { categoria: v })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Bancária">Bancária</SelectItem>
                              <SelectItem value="Vida">Vida</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={r.valor} onChange={(e) => updateRow(i, { valor: e.target.value })} className="h-8" />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={bulkCreate.isPending}>
                {bulkCreate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Lançar selecionados ({rows.filter((r) => r.selected).length})
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
