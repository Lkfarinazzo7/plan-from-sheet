CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  operadora_id uuid,
  unidade_negocio text,
  data_implantacao date,
  valor_contrato numeric NOT NULL DEFAULT 0,
  supervisor_a_id uuid,
  supervisor_a_percentual numeric,
  supervisor_a_valor numeric,
  supervisor_a_pago boolean NOT NULL DEFAULT false,
  supervisor_b_id uuid,
  supervisor_b_percentual numeric,
  supervisor_b_valor numeric,
  supervisor_b_pago boolean NOT NULL DEFAULT false,
  corretor_id uuid,
  corretor_percentual numeric,
  corretor_valor numeric,
  corretor_pago boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their contratos"
ON public.contratos
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_contratos_updated_at
BEFORE UPDATE ON public.contratos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();