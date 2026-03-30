
CREATE TABLE public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id),
  data date NOT NULL,
  descricao text NOT NULL DEFAULT '',
  valor_proposta numeric NOT NULL DEFAULT 0,
  valor_recebido numeric NOT NULL DEFAULT 0,
  comissao_vendedor numeric NOT NULL DEFAULT 0,
  comissao_supervisor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their comissoes" ON public.comissoes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_comissoes_updated_at
  BEFORE UPDATE ON public.comissoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
