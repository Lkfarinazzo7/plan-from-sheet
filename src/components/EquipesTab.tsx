import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

export function EquipesTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['equipes-cadastro'],
    queryFn: async () => {
      const [e, v, s] = await Promise.all([
        supabase.from('equipes' as any).select('id,nome,supervisor_id,ativo').order('nome'),
        supabase.from('vendedores').select('id,nome,ativo,equipe_id' as any).eq('ativo', true).order('nome'),
        supabase.from('supervisores').select('id,nome,ativo').eq('ativo', true).order('nome'),
      ]);
      if (e.error || v.error || s.error) throw e.error || v.error || s.error;
      return { equipes: (e.data ?? []) as any[], vendedores: (v.data ?? []) as any[], supervisores: s.data ?? [] };
    },
  });
  const mover = useMutation({
    mutationFn: async ({ id, equipe_id }: { id: string; equipe_id: string | null }) => {
      const { error } = await supabase.from('vendedores').update({ equipe_id } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipes-cadastro'] }); qc.invalidateQueries({ queryKey: ['painel-base'] }); toast.success('Equipe atualizada'); },
    onError: (e: any) => toast.error(e.message),
  });
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const sup = (id: string) => data.supervisores.find(s => s.id === id)?.nome ?? '—';
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Equipes</CardTitle>
        <p className="text-sm text-muted-foreground">{data.equipes.filter(e => e.ativo).map(e => `${e.nome} (supervisor: ${sup(e.supervisor_id)})`).join(' · ')}</p>
      </CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>Corretor</TableHead><TableHead>Equipe</TableHead></TableRow></TableHeader>
          <TableBody>{data.vendedores.map(v => (
            <TableRow key={v.id}><TableCell className="font-medium">{v.nome}</TableCell><TableCell>
              <Select value={v.equipe_id ?? 'none'} onValueChange={val => mover.mutate({ id: v.id, equipe_id: val === 'none' ? null : val })}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sem equipe</SelectItem>{data.equipes.filter(e => e.ativo).map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
              </Select>
            </TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
