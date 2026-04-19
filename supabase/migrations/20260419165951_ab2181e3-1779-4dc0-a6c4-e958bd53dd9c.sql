ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS unidade_negocio text;
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS unidade_negocio text;