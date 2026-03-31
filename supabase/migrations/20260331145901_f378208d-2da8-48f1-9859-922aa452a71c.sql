
CREATE TABLE public.supervisores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supervisores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage supervisores"
  ON public.supervisores FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_supervisores_updated_at
  BEFORE UPDATE ON public.supervisores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
