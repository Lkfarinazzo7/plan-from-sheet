ALTER TABLE public.categorias_despesa
ADD COLUMN IF NOT EXISTS tipo_dre text NOT NULL DEFAULT 'operacional'
CHECK (tipo_dre IN ('operacional','custo_fixo','imposto'));