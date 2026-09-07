-- =====================================================================
-- 1. COLUNAS QUE FALTAVAM (aditivo, sem tocar em dado histórico)
-- =====================================================================
ALTER TABLE public.receitas
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores_despesa(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS responsavel text,
  ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocorrencia date;

ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS ocorrencia date;

ALTER TABLE public.subcategorias_despesa
  ADD COLUMN IF NOT EXISTS grupo_dre text;

ALTER TABLE public.subcategorias_despesa
  DROP CONSTRAINT IF EXISTS subcategorias_despesa_grupo_dre_check;
ALTER TABLE public.subcategorias_despesa
  ADD CONSTRAINT subcategorias_despesa_grupo_dre_check CHECK (
    grupo_dre IS NULL OR grupo_dre IN (
      'receita_operacional','deducoes_receita','custos_variaveis','despesas_fixas',
      'despesas_comerciais','resultado_financeiro','depreciacao_amortizacao','tributos_lucro','fora_dre'
    )
  );

CREATE INDEX IF NOT EXISTS receitas_setor_idx ON public.receitas(user_id, setor_id);

-- Uma ocorrência por série por competência (não bloqueia o histórico: só vale quando ambos existem)
CREATE UNIQUE INDEX IF NOT EXISTS despesas_serie_ocorrencia_uidx
  ON public.despesas(serie_id, ocorrencia) WHERE serie_id IS NOT NULL AND ocorrencia IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS receitas_serie_ocorrencia_uidx
  ON public.receitas(serie_id, ocorrencia) WHERE serie_id IS NOT NULL AND ocorrencia IS NOT NULL;

-- =====================================================================
-- 2. INTEGRIDADE: subcategoria x categoria, série x usuário/tipo
-- =====================================================================
ALTER TABLE public.subcategorias_despesa
  DROP CONSTRAINT IF EXISTS subcategorias_despesa_id_categoria_key;
ALTER TABLE public.subcategorias_despesa
  ADD CONSTRAINT subcategorias_despesa_id_categoria_key UNIQUE (id, categoria_id);

ALTER TABLE public.series_recorrencia
  DROP CONSTRAINT IF EXISTS series_recorrencia_id_user_tipo_key;
ALTER TABLE public.series_recorrencia
  ADD CONSTRAINT series_recorrencia_id_user_tipo_key UNIQUE (id, user_id, tipo);

-- FK composta: a subcategoria precisa pertencer à categoria gravada na linha.
-- NOT VALID: passa a valer para tudo que for gravado/alterado daqui em diante, sem reescrever histórico.
ALTER TABLE public.despesas DROP CONSTRAINT IF EXISTS despesas_subcategoria_coerente_fkey;
ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_subcategoria_coerente_fkey
  FOREIGN KEY (subcategoria_id, categoria_id)
  REFERENCES public.subcategorias_despesa(id, categoria_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.receitas DROP CONSTRAINT IF EXISTS receitas_subcategoria_coerente_fkey;
ALTER TABLE public.receitas
  ADD CONSTRAINT receitas_subcategoria_coerente_fkey
  FOREIGN KEY (subcategoria_id, categoria_id)
  REFERENCES public.subcategorias_despesa(id, categoria_id) ON DELETE RESTRICT NOT VALID;

-- Série nunca mais some silenciosamente do histórico
ALTER TABLE public.despesas DROP CONSTRAINT IF EXISTS despesas_serie_id_fkey;
ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_serie_id_fkey FOREIGN KEY (serie_id)
  REFERENCES public.series_recorrencia(id) ON DELETE RESTRICT;

ALTER TABLE public.receitas DROP CONSTRAINT IF EXISTS receitas_serie_id_fkey;
ALTER TABLE public.receitas
  ADD CONSTRAINT receitas_serie_id_fkey FOREIGN KEY (serie_id)
  REFERENCES public.series_recorrencia(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.tg_lancamento_coerencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tipo text := TG_ARGV[0];
  v_serie public.series_recorrencia;
BEGIN
  -- Subcategoria exige categoria explícita (a FK composta só age com as duas preenchidas)
  IF NEW.subcategoria_id IS NOT NULL AND NEW.categoria_id IS NULL THEN
    RAISE EXCEPTION 'Subcategoria informada sem categoria: preencha a categoria correspondente.';
  END IF;

  IF NEW.serie_id IS NOT NULL THEN
    SELECT * INTO v_serie FROM public.series_recorrencia WHERE id = NEW.serie_id;
    IF v_serie.id IS NULL THEN
      RAISE EXCEPTION 'Série de recorrência % não encontrada.', NEW.serie_id;
    END IF;
    IF v_serie.user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'A série de recorrência pertence a outro usuário.';
    END IF;
    IF v_serie.tipo <> v_tipo THEN
      RAISE EXCEPTION 'A série é do tipo % e não pode ser usada em %.', v_serie.tipo, v_tipo;
    END IF;
  END IF;

  -- Lançamento cancelado é histórico: não pode ser editado (só o próprio cancelamento grava a marca)
  IF TG_OP = 'UPDATE' AND OLD.cancelado AND NEW.cancelado THEN
    RAISE EXCEPTION 'Lançamento cancelado não pode ser alterado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS despesas_coerencia ON public.despesas;
CREATE TRIGGER despesas_coerencia BEFORE INSERT OR UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.tg_lancamento_coerencia('despesa');
DROP TRIGGER IF EXISTS receitas_coerencia ON public.receitas;
CREATE TRIGGER receitas_coerencia BEFORE INSERT OR UPDATE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_lancamento_coerencia('receita');

-- =====================================================================
-- 3. VERSÃO AUTOMÁTICA EM TODO UPDATE (inclusive pela interface)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_incrementa_versao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.versao := COALESCE(OLD.versao, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS despesas_versao ON public.despesas;
CREATE TRIGGER despesas_versao BEFORE UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.tg_incrementa_versao();
DROP TRIGGER IF EXISTS receitas_versao ON public.receitas;
CREATE TRIGGER receitas_versao BEFORE UPDATE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_incrementa_versao();

-- =====================================================================
-- 4. PROTEÇÃO CONTRA EXCLUSÃO DE LANÇAMENTO LIQUIDADO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_protege_delete_liquidado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_data date := CASE TG_TABLE_NAME WHEN 'despesas' THEN OLD.data_pagamento ELSE OLD.data_recebimento END;
BEGIN
  IF OLD.status IN ('Pago','Recebido') OR v_data IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento liquidado não pode ser excluído (id %). Use o cancelamento lógico.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS despesas_protege_delete ON public.despesas;
CREATE TRIGGER despesas_protege_delete BEFORE DELETE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.tg_protege_delete_liquidado();
DROP TRIGGER IF EXISTS receitas_protege_delete ON public.receitas;
CREATE TRIGGER receitas_protege_delete BEFORE DELETE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_protege_delete_liquidado();

-- =====================================================================
-- 5. PLANO PERSISTIDO E IMUTÁVEL + AUDITORIA POR REGISTRO
-- =====================================================================
ALTER TABLE public.mcp_operacoes ADD COLUMN IF NOT EXISTS plano jsonb;

-- Depois de criada, a operação só pode mudar de status/erro: o plano da prévia fica travado.
REVOKE UPDATE ON public.mcp_operacoes FROM authenticated;
GRANT UPDATE (status, error) ON public.mcp_operacoes TO authenticated;

CREATE TABLE IF NOT EXISTS public.mcp_auditoria_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id uuid NOT NULL REFERENCES public.mcp_operacoes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mcp_auditoria_registros TO authenticated;
GRANT ALL ON public.mcp_auditoria_registros TO service_role;
ALTER TABLE public.mcp_auditoria_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own mcp audit" ON public.mcp_auditoria_registros;
CREATE POLICY "Users read own mcp audit" ON public.mcp_auditoria_registros
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS mcp_auditoria_registro_idx
  ON public.mcp_auditoria_registros(user_id, tabela, registro_id, created_at DESC);

-- =====================================================================
-- 6. EXECUÇÃO: SOMENTE A PARTIR DO PLANO PERSISTIDO
-- =====================================================================
DROP FUNCTION IF EXISTS public.mcp_aplicar_lote(uuid, jsonb);
DROP FUNCTION IF EXISTS public.mcp_executar_operacao(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.mcp_executar_operacao(_op_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c_max_itens constant int := 200;
  v_op public.mcp_operacoes;
  v_plano jsonb;
  v_item jsonb;
  v_tabela text;
  v_id uuid;
  v_versao int;
  v_patch jsonb;
  v_key text;
  v_atual jsonb;
  v_merged jsonb;
  v_cols text;
  v_sel text;
  v_rows int;
  v_ref text;
  v_refs jsonb;
  v_novo_id uuid;
  v_mapa_refs jsonb := '{}'::jsonb;
  v_vistos text[] := ARRAY[]::text[];
  v_chave text;
  v_itens int := 0;
  v_antes jsonb := '[]'::jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_user uuid := auth.uid();
  v_permitidos text[];
  v_tabelas_usuario constant text[] := ARRAY['receitas','despesas','series_recorrencia'];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  SELECT * INTO v_op FROM public.mcp_operacoes WHERE id = _op_id FOR UPDATE;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'Operação não encontrada'; END IF;
  IF v_op.user_id <> v_user THEN RAISE EXCEPTION 'Operação de outro usuário'; END IF;
  IF v_op.status <> 'pending' THEN RAISE EXCEPTION 'Operação já processada (status: %)', v_op.status; END IF;
  IF v_op.expires_at <= now() THEN
    UPDATE public.mcp_operacoes SET status = 'expired' WHERE id = _op_id;
    RAISE EXCEPTION 'Operação expirada';
  END IF;

  -- O plano é o que foi gravado na PRÉVIA. Nada vem do cliente na confirmação.
  v_plano := v_op.plano;
  IF v_plano IS NULL OR jsonb_typeof(v_plano) <> 'object' THEN
    RAISE EXCEPTION 'Operação sem plano persistido: refaça o preparo.';
  END IF;

  v_itens := jsonb_array_length(COALESCE(v_plano->'inserts','[]'::jsonb))
           + jsonb_array_length(COALESCE(v_plano->'updates','[]'::jsonb));
  IF v_itens = 0 THEN RAISE EXCEPTION 'Plano vazio: nada a executar.'; END IF;
  IF v_itens > c_max_itens THEN
    RAISE EXCEPTION 'Plano com % itens excede o limite de %.', v_itens, c_max_itens;
  END IF;

  ---------------------------------------------------------------- INSERTS
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_plano->'inserts','[]'::jsonb))
  LOOP
    v_tabela := v_item->>'tabela';
    v_permitidos := CASE v_tabela
      WHEN 'categorias_despesa' THEN ARRAY['nome','grupo_dre','tipo_dre','ativo']
      WHEN 'subcategorias_despesa' THEN ARRAY['nome','categoria_id','grupo_dre','ativo']
      WHEN 'series_recorrencia' THEN ARRAY['nome','tipo','ativa','unidade_negocio','categoria_id','subcategoria_id','setor_id','user_id']
      WHEN 'receitas' THEN ARRAY['data','descricao','categoria','categoria_id','subcategoria_id','setor_id','responsavel','recorrente','operadora_id','vendedor_id','contrato_id','valor','comissao','status','unidade_negocio','observacoes','competencia','vencimento','data_recebimento','ocorrencia','serie_id','user_id']
      WHEN 'despesas' THEN ARRAY['data','descricao','categoria_id','subcategoria_id','setor_id','responsavel','recorrente','tipo','valor','status','unidade_negocio','observacoes','competencia','vencimento','data_pagamento','ocorrencia','serie_id','user_id']
      ELSE NULL END;
    IF v_permitidos IS NULL THEN RAISE EXCEPTION 'Tabela não permitida para inserção: %', v_tabela; END IF;

    v_merged := COALESCE(v_item->'row','{}'::jsonb);
    IF jsonb_typeof(v_merged) <> 'object' OR v_merged = '{}'::jsonb THEN
      RAISE EXCEPTION 'Inserção sem conteúdo em %', v_tabela;
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_merged) LOOP
      IF NOT (v_key = ANY(v_permitidos)) THEN
        RAISE EXCEPTION 'Campo não permitido em %: %', v_tabela, v_key;
      END IF;
    END LOOP;

    IF v_tabela = ANY(v_tabelas_usuario) THEN
      v_merged := v_merged || jsonb_build_object('user_id', v_user);
    END IF;

    -- resolve referências simbólicas geradas dentro do próprio plano
    v_refs := COALESCE(v_item->'refs','{}'::jsonb);
    FOR v_key IN SELECT jsonb_object_keys(v_refs) LOOP
      v_merged := v_merged || jsonb_build_object(v_key, v_mapa_refs->>(v_refs->>v_key));
    END LOOP;

    SELECT string_agg(quote_ident(column_name), ','), string_agg('x.' || quote_ident(column_name), ',')
      INTO v_cols, v_sel
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_tabela
       AND column_name = ANY(v_permitidos);

    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) x RETURNING id',
      v_tabela, v_cols, v_sel, v_tabela)
      INTO v_novo_id USING v_merged;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'Inserção em % não gravou exatamente uma linha (%).', v_tabela, v_rows; END IF;

    v_ref := v_item->>'ref';
    IF v_ref IS NOT NULL THEN
      v_mapa_refs := v_mapa_refs || jsonb_build_object(v_ref, v_novo_id::text);
    END IF;

    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela) INTO v_merged USING v_novo_id;
    v_depois := v_depois || jsonb_build_array(v_merged);
    INSERT INTO public.mcp_auditoria_registros(operacao_id, user_id, tabela, registro_id, acao, antes, depois)
      VALUES (_op_id, v_user, v_tabela, v_novo_id, 'insert', NULL, v_merged);
  END LOOP;

  ---------------------------------------------------------------- UPDATES
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_plano->'updates','[]'::jsonb))
  LOOP
    v_tabela := v_item->>'tabela';
    v_permitidos := CASE v_tabela
      WHEN 'categorias_despesa' THEN ARRAY['nome','grupo_dre','tipo_dre','ativo']
      WHEN 'subcategorias_despesa' THEN ARRAY['nome','categoria_id','grupo_dre','ativo']
      WHEN 'series_recorrencia' THEN ARRAY['nome','ativa','encerrada_em','motivo_encerramento','unidade_negocio','categoria_id','subcategoria_id','setor_id']
      WHEN 'receitas' THEN ARRAY['data','descricao','categoria','categoria_id','subcategoria_id','setor_id','responsavel','recorrente','operadora_id','vendedor_id','contrato_id','valor','status','unidade_negocio','observacoes','competencia','vencimento','data_recebimento','ocorrencia','serie_id','cancelado','cancelado_em','motivo_cancelamento']
      WHEN 'despesas' THEN ARRAY['data','descricao','categoria_id','subcategoria_id','setor_id','responsavel','recorrente','tipo','valor','status','unidade_negocio','observacoes','competencia','vencimento','data_pagamento','ocorrencia','serie_id','cancelado','cancelado_em','motivo_cancelamento']
      ELSE NULL END;
    IF v_permitidos IS NULL THEN RAISE EXCEPTION 'Tabela não permitida para alteração: %', v_tabela; END IF;

    BEGIN
      v_id := (v_item->>'id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Identificador inválido no plano: %', v_item->>'id';
    END;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Alteração sem identificador em %', v_tabela; END IF;

    v_chave := v_tabela || ':' || v_id::text;
    IF v_chave = ANY(v_vistos) THEN
      RAISE EXCEPTION 'Registro repetido no plano: % em %', v_id, v_tabela;
    END IF;
    v_vistos := v_vistos || v_chave;

    v_patch := COALESCE(v_item->'patch','{}'::jsonb);
    v_refs := COALESCE(v_item->'refs','{}'::jsonb);
    IF jsonb_typeof(v_patch) <> 'object' THEN RAISE EXCEPTION 'Alteração inválida em %', v_tabela; END IF;
    IF v_patch = '{}'::jsonb AND v_refs = '{}'::jsonb THEN
      RAISE EXCEPTION 'Alteração sem campos para o registro % em %', v_id, v_tabela;
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
      IF NOT (v_key = ANY(v_permitidos)) THEN
        RAISE EXCEPTION 'Campo não permitido em %: %', v_tabela, v_key;
      END IF;
    END LOOP;
    FOR v_key IN SELECT jsonb_object_keys(v_refs) LOOP
      IF NOT (v_key = ANY(v_permitidos)) THEN
        RAISE EXCEPTION 'Campo não permitido em %: %', v_tabela, v_key;
      END IF;
      v_patch := v_patch || jsonb_build_object(v_key, v_mapa_refs->>(v_refs->>v_key));
    END LOOP;

    IF v_tabela = ANY(v_tabelas_usuario) THEN
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 AND t.user_id = $2 FOR UPDATE', v_tabela)
        INTO v_atual USING v_id, v_user;
    ELSE
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 FOR UPDATE', v_tabela)
        INTO v_atual USING v_id;
    END IF;
    IF v_atual IS NULL THEN
      RAISE EXCEPTION 'Registro % não encontrado em % ou sem permissão', v_id, v_tabela;
    END IF;

    -- Controle de concorrência: obrigatório onde existe versão
    IF v_atual ? 'versao' THEN
      IF v_item->>'versao' IS NULL THEN
        RAISE EXCEPTION 'Alteração de % sem versão de referência: refaça o preparo.', v_id;
      END IF;
      v_versao := (v_item->>'versao')::int;
      IF (v_atual->>'versao')::int <> v_versao THEN
        RAISE EXCEPTION 'Registro % foi alterado depois do preparo (versão % vs %). Refaça o preparo.',
          v_id, v_atual->>'versao', v_versao;
      END IF;
    END IF;

    v_merged := v_atual || v_patch;

    SELECT string_agg(quote_ident(column_name), ','), string_agg('x.' || quote_ident(column_name), ',')
      INTO v_cols, v_sel
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_tabela
       AND column_name = ANY(v_permitidos);

    EXECUTE format(
      'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) x) WHERE t.id = $2',
      v_tabela, v_cols, v_sel, v_tabela)
      USING v_merged, v_id;
    -- EXECUTE não atualiza FOUND: conferir explicitamente.
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Alteração de % em % atingiu % linha(s); esperado exatamente 1.', v_id, v_tabela, v_rows;
    END IF;

    v_antes := v_antes || jsonb_build_array(v_atual);
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', v_tabela) INTO v_merged USING v_id;
    v_depois := v_depois || jsonb_build_array(v_merged);
    INSERT INTO public.mcp_auditoria_registros(operacao_id, user_id, tabela, registro_id, acao, antes, depois)
      VALUES (_op_id, v_user, v_tabela, v_id, 'update', v_atual, v_merged);
  END LOOP;

  -- O plano NUNCA é sobrescrito pelo resultado: o resultado vai para before_data/after_data.
  UPDATE public.mcp_operacoes
     SET status = 'executed', executed_at = now(), item_count = v_itens,
         before_data = jsonb_build_object('registros', v_antes),
         after_data  = jsonb_build_object('registros', v_depois)
   WHERE id = _op_id AND status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Operação já processada em paralelo.'; END IF;

  RETURN jsonb_build_object('ok', true, 'itens', v_itens, 'antes', v_antes, 'depois', v_depois);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_executar_operacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_executar_operacao(uuid) TO authenticated;

-- =====================================================================
-- 7. CANCELADOS FORA DE TODOS OS AGREGADOS DE CONTRATO
-- =====================================================================
DROP VIEW IF EXISTS public.contratos_financeiro;
CREATE VIEW public.contratos_financeiro WITH (security_invoker = true) AS
SELECT
  c.id AS contrato_id,
  c.user_id,
  c.nome,
  c.valor_contrato AS producao,
  COALESCE(SUM(r.valor), 0) AS receita_prevista,
  COALESCE(SUM(r.valor) FILTER (WHERE r.status = 'Recebido'), 0) AS receita_recebida,
  COALESCE(SUM(r.valor) FILTER (WHERE r.status <> 'Recebido'), 0) AS receita_pendente,
  COUNT(r.id) AS qtd_receitas
FROM public.contratos c
LEFT JOIN public.receitas r
  ON r.contrato_id = c.id AND r.user_id = c.user_id AND r.cancelado = false
GROUP BY c.id, c.user_id, c.nome, c.valor_contrato;

GRANT SELECT ON public.contratos_financeiro TO authenticated;