ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS observacoes text;