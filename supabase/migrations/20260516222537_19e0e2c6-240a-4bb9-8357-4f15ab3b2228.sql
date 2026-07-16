-- Setores de despesa were created in the hosted database before their schema
-- was committed. Keep this migration self-contained so a fresh database can
-- be rebuilt exclusively from source control.
CREATE TABLE IF NOT EXISTS public.setores_despesa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.setores_despesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS setor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'despesas_setor_id_fkey'
  ) THEN
    ALTER TABLE public.despesas
      ADD CONSTRAINT despesas_setor_id_fkey
      FOREIGN KEY (setor_id)
      REFERENCES public.setores_despesa(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_setores_despesa_updated_at'
  ) THEN
    CREATE TRIGGER update_setores_despesa_updated_at
      BEFORE UPDATE ON public.setores_despesa
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
