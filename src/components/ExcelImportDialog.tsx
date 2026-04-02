import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

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
}

export function ExcelImportDialog({ open, onOpenChange, title, expectedColumns, mapRow, onConfirm }: ExcelImportDialogProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (jsonData.length === 0) {
        toast({ title: 'Planilha vazia', variant: 'destructive' });
        return;
      }
      setHeaders(Object.keys(jsonData[0]));
      setParsedRows(jsonData.map(mapRow));
    };
    reader.readAsArrayBuffer(file);
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

  const reset = () => { setParsedRows([]); setFileName(''); setHeaders([]); };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {parsedRows.length === 0 ? (
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
        ) : (
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
                    {headers.map(h => <TableHead key={h}>{h}</TableHead>)}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                      {headers.map(h => (
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
              <Button variant="outline" onClick={reset}>Selecionar outro arquivo</Button>
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
