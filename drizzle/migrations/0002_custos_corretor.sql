CREATE TABLE public.custos_corretor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('fixo','percentual','pontual')),
  valor numeric NOT NULL DEFAULT 0,
  frequencia text NOT NULL DEFAULT 'mensal' CHECK (frequencia IN ('mensal','semanal','unica')),
  mes_referencia date,
  inicio date,
  fim date,
  ativo boolean NOT NULL DEFAULT true,
  categoria_id uuid REFERENCES public.categorias_despesa(id),
  termo_match text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custos_corretor TO authenticated;
GRANT ALL ON public.custos_corretor TO service_role;
ALTER TABLE public.custos_corretor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/gestor gerenciam custos de corretor" ON public.custos_corretor
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE INDEX idx_custos_corretor_vendedor ON public.custos_corretor(vendedor_id);
CREATE TRIGGER trg_custos_corretor_updated BEFORE UPDATE ON public.custos_corretor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.vendedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_despesas_vendedor ON public.despesas(vendedor_id);