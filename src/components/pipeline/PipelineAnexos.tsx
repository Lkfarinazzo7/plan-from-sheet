import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Upload, Trash2, FileIcon, Loader2 } from 'lucide-react';

type Anexo = { name: string; size?: number };

export function PipelineAnexos({ pipelineId }: { pipelineId?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<Anexo[]>([]);
  const [busy, setBusy] = useState(false);

  const prefix = user && pipelineId ? `${user.id}/${pipelineId}` : null;

  const load = async () => {
    if (!prefix) return;
    const { data } = await supabase.storage.from('pipeline-anexos').list(prefix, { limit: 100 });
    setFiles((data ?? []).map((f) => ({ name: f.name, size: (f as any).metadata?.size })));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [prefix]);

  if (!pipelineId) {
    return <p className="text-xs text-muted-foreground">Salve a proposta antes de anexar arquivos.</p>;
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!prefix || !e.target.files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(e.target.files)) {
        const { error } = await supabase.storage
          .from('pipeline-anexos')
          .upload(`${prefix}/${Date.now()}-${file.name}`, file, { upsert: false });
        if (error) throw error;
      }
      toast({ title: 'Arquivos enviados' });
      await load();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const remove = async (name: string) => {
    if (!prefix) return;
    if (!confirm(`Remover ${name}?`)) return;
    await supabase.storage.from('pipeline-anexos').remove([`${prefix}/${name}`]);
    toast({ title: 'Arquivo removido' });
    load();
  };

  const download = async (name: string) => {
    if (!prefix) return;
    const { data } = await supabase.storage.from('pipeline-anexos').createSignedUrl(`${prefix}/${name}`, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 text-sm cursor-pointer rounded-md border px-3 py-1.5 hover:bg-accent">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Adicionar arquivo
        <input type="file" className="hidden" multiple onChange={upload} disabled={busy} />
      </label>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1.5">
              <button type="button" onClick={() => download(f.name)} className="flex items-center gap-2 truncate hover:text-primary">
                <FileIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(f.name)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
