CREATE OR REPLACE FUNCTION public.mcp_executar_operacao(_op_id uuid, _plano jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_op public.mcp_operacoes;
  v_item jsonb;
  v_tabela text;
  v_id uuid;
  v_versao bigint;
  v_atual jsonb;
  v_novo jsonb;
  v_patch jsonb;
  v_ref text;
  v_refs jsonb := '{}'::jsonb;
  v_k text;
  v_v text;
  v_inseridos jsonb := '[]'::jsonb;
  v_atualizados jsonb := '[]'::jsonb;
  v_total int := 0;
  v_permitidas text[] := ARRAY['receitas','despesas','categorias_despesa','subcategorias_despesa','series_recorrencia'];
BEGIN
  -- 1. Reserva: trava a linha da operação e valida estado ANTES de qualquer gravação.
  SELECT * INTO v_op FROM public.mcp_operacoes WHERE id = _op_id FOR UPDATE;
  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada';
  END IF;
  IF v_op.status <> 'pending' THEN
    RAISE EXCEPTION 'Operação já processada (status: %)', v_op.status;
  END IF;
  IF v_op.expires_at <= now() THEN
    UPDATE public.mcp_operacoes SET status = 'expired' WHERE id = _op_id;
    RAISE EXCEPTION 'Operação expirada';
  END IF;

  -- 2. Inserções (na ordem informada), guardando ids por referência simbólica.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_plano->'inserts', '[]'::jsonb))
  LOOP
    v_tabela := v_item->>'tabela';
    IF NOT (v_tabela = ANY(v_permitidas)) THEN
      RAISE EXCEPTION 'Tabela não permitida: %', v_tabela;
    END IF;
    EXECUTE format(
      'INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).* RETURNING to_jsonb(%I.*)',
      v_tabela, v_tabela, v_tabela
    ) INTO v_novo USING (v_item->'row');
    v_ref := v_item->>'ref';
    IF v_ref IS NOT NULL THEN
      v_refs := v_refs || jsonb_build_object(v_ref, v_novo->>'id');
    END IF;
    v_inseridos := v_inseridos || jsonb_build_array(jsonb_build_object('tabela', v_tabela, 'registro', v_novo));
    v_total := v_total + 1;
  END LOOP;

  -- 3. Atualizações: trava linha a linha, confere versão e aplica o patch.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_plano->'updates', '[]'::jsonb))
  LOOP
    v_tabela := v_item->>'tabela';
    IF NOT (v_tabela = ANY(v_permitidas)) THEN
      RAISE EXCEPTION 'Tabela não permitida: %', v_tabela;
    END IF;
    v_id := (v_item->>'id')::uuid;
    EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1 FOR UPDATE', v_tabela)
      INTO v_atual USING v_id;
    IF v_atual IS NULL THEN
      RAISE EXCEPTION 'Registro % não encontrado em % (ou sem acesso)', v_id, v_tabela;
    END IF;

    v_versao := NULLIF(v_item->>'versao', '')::bigint;
    IF v_versao IS NOT NULL AND (v_atual->>'versao') IS NOT NULL
       AND (v_atual->>'versao')::bigint <> v_versao THEN
      RAISE EXCEPTION 'Registro % foi alterado depois do preparo (versão % vs %). Refaça o preparo.',
        v_id, v_atual->>'versao', v_versao;
    END IF;

    v_patch := COALESCE(v_item->'patch', '{}'::jsonb);
    -- Substituições simbólicas (ex.: serie_id apontando para um insert deste mesmo plano).
    IF v_item ? 'refs' THEN
      FOR v_k, v_v IN SELECT key, value FROM jsonb_each_text(v_item->'refs')
      LOOP
        IF NOT (v_refs ? v_v) THEN
          RAISE EXCEPTION 'Referência % não resolvida no plano', v_v;
        END IF;
        v_patch := v_patch || jsonb_build_object(v_k, v_refs->>v_v);
      END LOOP;
    END IF;
    IF (v_atual->>'versao') IS NOT NULL THEN
      v_patch := v_patch || jsonb_build_object('versao', (v_atual->>'versao')::bigint + 1);
    END IF;

    EXECUTE format(
      'UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(t.*, $1) p) WHERE t.id = $2 RETURNING to_jsonb(t.*)',
      v_tabela,
      (SELECT string_agg(quote_ident(k), ', ') FROM jsonb_object_keys(v_patch) k),
      (SELECT string_agg('p.' || quote_ident(k), ', ') FROM jsonb_object_keys(v_patch) k)
    ) INTO v_novo USING v_patch, v_id;

    v_atualizados := v_atualizados || jsonb_build_array(
      jsonb_build_object('tabela', v_tabela, 'id', v_id, 'antes', v_atual, 'depois', v_novo)
    );
    v_total := v_total + 1;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Plano vazio: nada a executar';
  END IF;

  -- 4. Auditoria e resultado, na MESMA transação das gravações.
  UPDATE public.mcp_operacoes
     SET status = 'executed',
         executed_at = now(),
         item_count = v_total,
         after_data = jsonb_build_object('inserts', v_inseridos, 'updates', v_atualizados)
   WHERE id = _op_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operação já processada durante a execução';
  END IF;

  RETURN jsonb_build_object('status', 'executed', 'itens', v_total, 'inserts', v_inseridos, 'updates', v_atualizados);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mcp_executar_operacao(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_executar_operacao(uuid, jsonb) FROM anon;