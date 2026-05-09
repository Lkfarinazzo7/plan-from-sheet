
-- 1) Create propostas table
CREATE TABLE public.propostas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  operadora_id uuid REFERENCES public.operadoras(id),
  vendedor_id uuid REFERENCES public.vendedores(id),
  unidade_negocio text,
  valor_proposta numeric NOT NULL DEFAULT 0,
  valor_contrato numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome)
);

ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their propostas"
ON public.propostas FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_propostas_updated_at
BEFORE UPDATE ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Auto-create propostas from existing receitas (one per distinct descricao per user)
INSERT INTO public.propostas (user_id, nome, operadora_id, vendedor_id, unidade_negocio, valor_proposta)
SELECT
  user_id,
  descricao AS nome,
  (array_agg(operadora_id ORDER BY data ASC))[1] AS operadora_id,
  (array_agg(vendedor_id ORDER BY data ASC))[1] AS vendedor_id,
  (array_agg(unidade_negocio ORDER BY data ASC))[1] AS unidade_negocio,
  SUM(valor) AS valor_proposta
FROM public.receitas
WHERE descricao IS NOT NULL AND descricao <> ''
GROUP BY user_id, descricao
ON CONFLICT (user_id, nome) DO NOTHING;

-- 3) Add proposta_id column to receitas and backfill
ALTER TABLE public.receitas ADD COLUMN proposta_id uuid REFERENCES public.propostas(id) ON DELETE RESTRICT;

UPDATE public.receitas r
SET proposta_id = p.id
FROM public.propostas p
WHERE p.user_id = r.user_id AND p.nome = r.descricao;

CREATE INDEX idx_receitas_proposta_id ON public.receitas(proposta_id);

-- 4) Drop comissoes table
DROP TABLE IF EXISTS public.comissoes;
