-- 1. Categorias: novo grupo DRE (aditivo, sem transformar o legado) + inativação
ALTER TABLE public.categorias_despesa
  ADD COLUMN IF NOT EXISTS grupo_dre text,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.categorias_despesa
  DROP CONSTRAINT IF EXISTS categorias_despesa_grupo_dre_check;
ALTER TABLE public.categorias_despesa
  ADD CONSTRAINT categorias_despesa_grupo_dre_check CHECK (
    grupo_dre IS NULL OR grupo_dre IN (
      'receita_operacional','deducoes_receita','custos_variaveis','despesas_fixas',
      'despesas_comerciais','resultado_financeiro','depreciacao_amortizacao',
      'tributos_lucro','fora_dre'
    )
  );

DROP TRIGGER IF EXISTS update_categorias_despesa_updated_at ON public.categorias_despesa;
CREATE TRIGGER update_categorias_despesa_updated_at
  BEFORE UPDATE ON public.categorias_despesa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Subcategorias
CREATE TABLE IF NOT EXISTS public.subcategorias_despesa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.categorias_despesa(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subcategorias_despesa_cat_nome_uidx
  ON public.subcategorias_despesa (categoria_id, lower(btrim(nome)));

GRANT SELECT, INSERT, UPDATE ON public.subcategorias_despesa TO authenticated;
GRANT ALL ON public.subcategorias_despesa TO service_role;
ALTER TABLE public.subcategorias_despesa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read subcategorias" ON public.subcategorias_despesa;
CREATE POLICY "Authenticated read subcategorias" ON public.subcategorias_despesa
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Privileged insert subcategorias" ON public.subcategorias_despesa;
CREATE POLICY "Privileged insert subcategorias" ON public.subcategorias_despesa
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
DROP POLICY IF EXISTS "Privileged update subcategorias" ON public.subcategorias_despesa;
CREATE POLICY "Privileged update subcategorias" ON public.subcategorias_despesa
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

DROP TRIGGER IF EXISTS update_subcategorias_despesa_updated_at ON public.subcategorias_despesa;
CREATE TRIGGER update_subcategorias_despesa_updated_at
  BEFORE UPDATE ON public.subcategorias_despesa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Séries de recorrência (identidade real, sem inferência textual)
CREATE TABLE IF NOT EXISTS public.series_recorrencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('receita','despesa')),
  nome text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  encerrada_em date,
  motivo_encerramento text,
  unidade_negocio text,
  categoria_id uuid REFERENCES public.categorias_despesa(id) ON DELETE RESTRICT,
  subcategoria_id uuid REFERENCES public.subcategorias_despesa(id) ON DELETE RESTRICT,
  setor_id uuid REFERENCES public.setores_despesa(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS series_recorrencia_user_idx ON public.series_recorrencia (user_id, tipo, ativa);

GRANT SELECT, INSERT, UPDATE ON public.series_recorrencia TO authenticated;
GRANT ALL ON public.series_recorrencia TO service_role;
ALTER TABLE public.series_recorrencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own series" ON public.series_recorrencia;
CREATE POLICY "Users manage own series" ON public.series_recorrencia
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_series_recorrencia_updated_at ON public.series_recorrencia;
CREATE TRIGGER update_series_recorrencia_updated_at
  BEFORE UPDATE ON public.series_recorrencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Despesas: campos explícitos de data, subcategoria, cancelamento lógico, série e versão
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES public.subcategorias_despesa(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS competencia date,
  ADD COLUMN IF NOT EXISTS vencimento date,
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS serie_id uuid REFERENCES public.series_recorrencia(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS despesas_user_competencia_idx ON public.despesas (user_id, competencia);
CREATE INDEX IF NOT EXISTS despesas_user_pagamento_idx ON public.despesas (user_id, data_pagamento);
CREATE INDEX IF NOT EXISTS despesas_user_vencimento_idx ON public.despesas (user_id, vencimento);
CREATE INDEX IF NOT EXISTS despesas_serie_idx ON public.despesas (serie_id);

-- 5. Receitas: mesmos campos explícitos
ALTER TABLE public.receitas
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.categorias_despesa(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES public.subcategorias_despesa(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS competencia date,
  ADD COLUMN IF NOT EXISTS vencimento date,
  ADD COLUMN IF NOT EXISTS data_recebimento date,
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS serie_id uuid REFERENCES public.series_recorrencia(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS receitas_user_competencia_idx ON public.receitas (user_id, competencia);
CREATE INDEX IF NOT EXISTS receitas_user_recebimento_idx ON public.receitas (user_id, data_recebimento);
CREATE INDEX IF NOT EXISTS receitas_user_vencimento_idx ON public.receitas (user_id, vencimento);
CREATE INDEX IF NOT EXISTS receitas_serie_idx ON public.receitas (serie_id);

-- 6. Operações MCP: contagem de itens do lote
ALTER TABLE public.mcp_operacoes
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 1;

-- 7. Aplicação atômica de lote (uma transação, tudo ou nada, com checagem de versão)
CREATE OR REPLACE FUNCTION public.mcp_aplicar_lote(_op_id uuid, _itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_op public.mcp_operacoes;
  v_item jsonb;
  v_tabela text;
  v_id uuid;
  v_versao integer;
  v_atual jsonb;
  v_merged jsonb;
  v_cols text;
  v_sel text;
  v_antes jsonb := '[]'::jsonb;
  v_depois jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_op FROM public.mcp_operacoes WHERE id = _op_id FOR UPDATE;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'Operação não encontrada'; END IF;
  IF v_op.status <> 'pending' THEN RAISE EXCEPTION 'Operação já processada (status: %)', v_op.status; END IF;
  IF v_op.expires_at <= now() THEN
    UPDATE public.mcp_operacoes SET status = 'expired' WHERE id = _op_id;
    RAISE EXCEPTION 'Operação expirada';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    v_tabela := v_item->>'tabela';
    IF v_tabela NOT IN ('receitas','despesas') THEN
      RAISE EXCEPTION 'Tabela não permitida: %', v_tabela;
    END IF;
    v_id := (v_item->>'id')::uuid;
    v_versao := NULLIF(v_item->>'versao','')::integer;

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 FOR UPDATE', v_tabela)
      INTO v_atual USING v_id;
    IF v_atual IS NULL THEN
      RAISE EXCEPTION 'Lançamento % não encontrado ou sem permissão', v_id;
    END IF;
    IF v_versao IS NOT NULL AND (v_atual->>'versao')::integer <> v_versao THEN
      RAISE EXCEPTION 'Conflito de concorrência no lançamento % (versão % ≠ %)', v_id, v_atual->>'versao', v_versao;
    END IF;

    v_merged := v_atual || coalesce(v_item->'patch','{}'::jsonb)
      || jsonb_build_object('versao', (v_atual->>'versao')::integer + 1)
      || jsonb_build_object('id', v_atual->>'id', 'user_id', v_atual->>'user_id');

    SELECT string_agg(quote_ident(column_name), ','),
           string_agg('x.' || quote_ident(column_name), ',')
      INTO v_cols, v_sel
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_tabela
       AND column_name NOT IN ('id','user_id','created_at');

    EXECUTE format(
      'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) x) WHERE t.id = $2',
      v_tabela, v_cols, v_sel, v_tabela)
      USING v_merged, v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Falha ao atualizar lançamento % (sem permissão)', v_id;
    END IF;

    v_antes := v_antes || jsonb_build_array(v_atual);
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela)
      INTO v_merged USING v_id;
    v_depois := v_depois || jsonb_build_array(v_merged);
  END LOOP;

  UPDATE public.mcp_operacoes
     SET status = 'executed', executed_at = now(), before_data = v_antes, after_data = v_depois
   WHERE id = _op_id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'antes', v_antes, 'depois', v_depois);
END;
$function$;

REVOKE ALL ON FUNCTION public.mcp_aplicar_lote(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_aplicar_lote(uuid, jsonb) TO authenticated, service_role;