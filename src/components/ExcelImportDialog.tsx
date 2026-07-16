import { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { autoMapColumns } from '@/lib/importHelpers';

export interface ParsedRow {
  mapped: Record<string, any>;
  raw: Record<string, any>;
  errors: string[];
}

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  expectedColumns: string[];
  mapRow: (row: Record<string, any>) => ParsedRow;
  onConfirm: (rows: Record<string, any>[]) => Promise<void>;
  columnAliases?: Record<string, string[]>;
}

type Step = 'upload' | 'mapping' | 'preview';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 5_000;

export function ExcelImportDialog({ open, onOpenChange, title, expectedColumns, mapRow, onConfirm, columnAliases }: ExcelImportDialogProps) {
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<Step>('upload');
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'Arquivo muito grande', description: 'O limite para importação é 10 MB.', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(evt.target?.result, { type: 'array', cellDates: true });
        const firstSheetName = wb.SheetNames[0];
        const ws = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
        if (!ws) throw new Error('A planilha não contém uma aba válida.');
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        if (jsonData.length === 0) {
          toast({ title: 'Planilha vazia', variant: 'destructive' });
          if (fileRef.current) fileRef.current.value = '';
          setFileName('');
          return;
        }
        if (jsonData.length > MAX_ROWS) {
          throw new Error(`A planilha excede o limite de ${MAX_ROWS.toLocaleString('pt-BR')} linhas.`);
        }
        const detected = Object.keys(jsonData[0]);
        setHeaders(detected);
        setRawData(jsonData);
        const autoMap = autoMapColumns(expectedColumns, detected, columnAliases);
        setColumnMapping(autoMap);
        setStep('mapping');
      } catch (error) {
        toast({
          title: 'Não foi possível ler a planilha',
          description: error instanceof Error ? error.message : 'Formato inválido ou arquivo corrompido.',
          variant: 'destructive',
        });
        if (fileRef.current) fileRef.current.value = '';
        setFileName('');
      }
    };
    reader.onerror = () => {
      toast({ title: 'Erro ao abrir o arquivo', variant: 'destructive' });
      if (fileRef.current) fileRef.current.value = '';
      setFileName('');
    };
    reader.readAsArrayBuffer(file);
  };

  // Sample values for each detected column
  const sampleValues = useMemo(() => {
    const samples: Record<string, string[]> = {};
    for (const h of headers) {
      samples[h] = rawData.slice(0, 3).map(r => String(r[h] ?? '')).filter(Boolean);
    }
    return samples;
  }, [headers, rawData]);

  const confirmMapping = () => {
    // Re-map raw data using the confirmed column mapping
    const remappedData = rawData.map(row => {
      const remapped: Record<string, any> = {};
      for (const [expected, detected] of Object.entries(columnMapping)) {
        if (detected) {
          remapped[expected] = row[detected];
        }
      }
      return remapped;
    });
    setParsedRows(remappedData.map(mapRow));
    setStep('preview');
  };

  const validRows = parsedRows.filter(r => r.errors.length === 0);
  const errorRows = parsedRows.filter(r => r.errors.length > 0);

  const handleConfirm = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onConfirm(validRows.map(r => r.mapped));
      toast({ title: `${validRows.length} registros importados com sucesso!` });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setParsedRows([]);
    setRawData([]);
    setFileName('');
    setHeaders([]);
    setColumnMapping({});
    setStep('upload');
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const updateMapping = (expected: string, detected: string) => {
    setColumnMapping(prev => ({ ...prev, [expected]: detected === '__none__' ? '' : detected }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Colunas esperadas: <strong>{expectedColumns.join(', ')}</strong>
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{fileName || 'Clique para selecionar um arquivo .xlsx'}</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <p className="text-sm text-muted-foreground">
              Confirme o mapeamento das colunas da planilha <strong>"{fileName}"</strong> para os campos do sistema:
            </p>
            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="space-y-3 pr-4">
                {expectedColumns.map(expected => (
                  <div key={expected} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{expected}</p>
                      <p className="text-xs text-muted-foreground">Campo do sistema</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Select
                        value={columnMapping[expected] || '__none__'}
                        onValueChange={(v) => updateMapping(expected, v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione a coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Não mapear —</SelectItem>
                          {headers.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {columnMapping[expected] && sampleValues[columnMapping[expected]] && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Ex: {sampleValues[columnMapping[expected]].join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Voltar</Button>
              <Button onClick={confirmMapping}>Confirmar Mapeamento</Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-success"><CheckCircle className="h-4 w-4" /> {validRows.length} válidos</span>
              {errorRows.length > 0 && (
                <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4" /> {errorRows.length} com erros</span>
              )}
            </div>

            {errorRows.length > 0 && (
              <div className="bg-destructive/10 rounded p-3 text-sm max-h-24 overflow-auto">
                {errorRows.slice(0, 5).map((r, i) => (
                  <p key={i} className="text-destructive">Linha {parsedRows.indexOf(r) + 2}: {r.errors.join(', ')}</p>
                ))}
                {errorRows.length > 5 && <p className="text-destructive">...e mais {errorRows.length - 5} erros</p>}
              </div>
            )}

            <ScrollArea className="flex-1 border rounded max-h-[40vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {expectedColumns.map(h => <TableHead key={h}>{h}</TableHead>)}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                      {expectedColumns.map(h => (
                        <TableCell key={h} className="text-xs whitespace-nowrap">{String(row.raw[h] ?? '')}</TableCell>
                      ))}
                      <TableCell>
                        {row.errors.length > 0 ? (
                          <span className="text-xs text-destructive">{row.errors[0]}</span>
                        ) : (
                          <CheckCircle className="h-4 w-4 text-success" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>Voltar ao Mapeamento</Button>
              <Button onClick={handleConfirm} disabled={importing || validRows.length === 0}>
                {importing ? 'Importando...' : `Importar ${validRows.length} registros`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
