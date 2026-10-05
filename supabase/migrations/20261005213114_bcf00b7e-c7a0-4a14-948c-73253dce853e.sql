CREATE TABLE public.equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  supervisor_id uuid REFERENCES public.supervisores(id),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipes TO authenticated;
GRANT ALL ON public.equipes TO service_role;
ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores gerenciam equipes" ON public.equipes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE TRIGGER update_equipes_updated_at BEFORE UPDATE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.vendedores ADD COLUMN equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL;