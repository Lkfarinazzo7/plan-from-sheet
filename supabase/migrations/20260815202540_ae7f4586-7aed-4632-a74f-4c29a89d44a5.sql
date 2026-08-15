CREATE TABLE public.mcp_operacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tool_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_data jsonb,
  after_data jsonb,
  summary text,
  error text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcp_operacoes_status_check CHECK (status IN ('pending','executed','cancelled','expired','failed'))
);

GRANT SELECT, INSERT, UPDATE ON public.mcp_operacoes TO authenticated;
GRANT ALL ON public.mcp_operacoes TO service_role;

ALTER TABLE public.mcp_operacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own mcp operations"
  ON public.mcp_operacoes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own mcp operations"
  ON public.mcp_operacoes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own mcp operations"
  ON public.mcp_operacoes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_mcp_operacoes_user_status ON public.mcp_operacoes (user_id, status);
CREATE INDEX idx_mcp_operacoes_expires_at ON public.mcp_operacoes (expires_at) WHERE status = 'pending';
CREATE INDEX idx_mcp_operacoes_created_at ON public.mcp_operacoes (created_at DESC);

CREATE TRIGGER update_mcp_operacoes_updated_at
  BEFORE UPDATE ON public.mcp_operacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reserva atômica e idempotente de uma operação pendente (security invoker: respeita RLS)
CREATE OR REPLACE FUNCTION public.mcp_claim_operacao(_id uuid)
RETURNS public.mcp_operacoes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_op public.mcp_operacoes;
BEGIN
  SELECT * INTO v_op FROM public.mcp_operacoes WHERE id = _id FOR UPDATE;
  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada';
  END IF;
  IF v_op.status <> 'pending' THEN
    RAISE EXCEPTION 'Operação já processada (status: %)', v_op.status;
  END IF;
  IF v_op.expires_at <= now() THEN
    UPDATE public.mcp_operacoes SET status = 'expired' WHERE id = _id RETURNING * INTO v_op;
    RAISE EXCEPTION 'Operação expirada';
  END IF;
  UPDATE public.mcp_operacoes SET status = 'executed', executed_at = now()
    WHERE id = _id AND status = 'pending' RETURNING * INTO v_op;
  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'Operação já processada';
  END IF;
  RETURN v_op;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_claim_operacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_claim_operacao(uuid) TO authenticated;