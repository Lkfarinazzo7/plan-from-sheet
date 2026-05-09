
-- 1. Comissões: novos campos
ALTER TABLE public.comissoes
  ADD COLUMN operadora_id uuid,
  ADD COLUMN supervisor_id uuid,
  ADD COLUMN pct_vendedor numeric(5,2),
  ADD COLUMN pct_supervisor numeric(5,2);

-- Backfill operadora_id em registros antigos com a primeira operadora
UPDATE public.comissoes
SET operadora_id = 'f79dbd71-610b-4438-b952-2f84491b536e'
WHERE operadora_id IS NULL;

ALTER TABLE public.comissoes
  ALTER COLUMN operadora_id SET NOT NULL;

-- 2. Setores de despesa
CREATE TABLE public.setores_despesa (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.setores_despesa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage setores"
ON public.setores_despesa FOR ALL TO authenticated
USING (true) WITH CHECK (true);

INSERT INTO public.setores_despesa (nome) VALUES
  ('Pré-vendas'), ('Vendas'), ('Supervisão'),
  ('Escritório'), ('Administrativo'), ('RH');

-- Coluna setor_id em despesas
ALTER TABLE public.despesas ADD COLUMN setor_id uuid;
