ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS contrato_id uuid;

ALTER TABLE public.contratos ADD CONSTRAINT contratos_user_id_id_key UNIQUE (user_id, id);

ALTER TABLE public.receitas
  ADD CONSTRAINT receitas_contrato_user_fkey
  FOREIGN KEY (user_id, contrato_id)
  REFERENCES public.contratos (user_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_receitas_user_contrato_data ON public.receitas (user_id, contrato_id, data DESC, id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_data_implantacao ON public.contratos (user_id, data_implantacao DESC NULLS LAST, id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_operadora ON public.contratos (user_id, operadora_id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_corretor ON public.contratos (user_id, corretor_id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_supervisor_a ON public.contratos (user_id, supervisor_a_id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_supervisor_b ON public.contratos (user_id, supervisor_b_id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_unidade ON public.contratos (user_id, unidade_negocio);

WITH cand AS (
  SELECT r.id AS receita_id,
         c.id AS contrato_id,
         count(*) OVER (PARTITION BY r.id) AS n
  FROM public.receitas r
  JOIN public.contratos c
    ON c.user_id = r.user_id
   AND lower(btrim(c.nome)) = lower(btrim(r.descricao))
   AND (c.operadora_id IS NULL OR r.operadora_id IS NULL OR c.operadora_id = r.operadora_id)
   AND (c.corretor_id IS NULL OR r.vendedor_id IS NULL OR c.corretor_id = r.vendedor_id)
   AND (c.unidade_negocio IS NULL OR r.unidade_negocio IS NULL OR c.unidade_negocio = r.unidade_negocio)
  WHERE r.contrato_id IS NULL
)
UPDATE public.receitas r
SET contrato_id = cand.contrato_id
FROM cand
WHERE cand.receita_id = r.id AND cand.n = 1;

CREATE OR REPLACE VIEW public.contratos_financeiro
WITH (security_invoker = true) AS
SELECT
  c.id AS contrato_id,
  c.user_id,
  c.nome,
  c.valor_contrato AS producao,
  COALESCE(SUM(r.valor), 0) AS receita_prevista,
  COALESCE(SUM(r.valor) FILTER (WHERE r.status = 'Recebido'), 0) AS receita_recebida,
  COALESCE(SUM(r.valor) FILTER (WHERE r.status = 'Aguardando'), 0) AS receita_pendente,
  COUNT(r.id) AS qtd_receitas
FROM public.contratos c
LEFT JOIN public.receitas r
  ON r.contrato_id = c.id AND r.user_id = c.user_id
GROUP BY c.id, c.user_id, c.nome, c.valor_contrato;

GRANT SELECT ON public.contratos_financeiro TO authenticated;