-- Additive repair. No financial history, classification, competence or payment
-- date is backfilled. Existing pending operations lacking versions must be prepared again.
ALTER TABLE public.mcp_operacoes ADD COLUMN IF NOT EXISTS resultado jsonb;
ALTER TABLE public.categorias_despesa ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;
ALTER TABLE public.subcategorias_despesa ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;
ALTER TABLE public.series_recorrencia ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.tg_incrementa_versao()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  NEW.versao := OLD.versao + 1;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER categorias_versao BEFORE UPDATE ON public.categorias_despesa
FOR EACH ROW EXECUTE FUNCTION public.tg_incrementa_versao();
CREATE OR REPLACE TRIGGER subcategorias_versao BEFORE UPDATE ON public.subcategorias_despesa
FOR EACH ROW EXECUTE FUNCTION public.tg_incrementa_versao();
CREATE OR REPLACE TRIGGER series_versao BEFORE UPDATE ON public.series_recorrencia
FOR EACH ROW EXECUTE FUNCTION public.tg_incrementa_versao();

-- Shared catalog writes require the same explicit role in UI and MCP.
DROP POLICY IF EXISTS "Authenticated users can manage categorias" ON public.categorias_despesa;
DROP POLICY IF EXISTS "Authenticated read categorias" ON public.categorias_despesa;
CREATE POLICY "Authenticated read categorias" ON public.categorias_despesa
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Privileged create categorias" ON public.categorias_despesa;
CREATE POLICY "Privileged create categorias" ON public.categorias_despesa
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
DROP POLICY IF EXISTS "Privileged edit categorias" ON public.categorias_despesa;
CREATE POLICY "Privileged edit categorias" ON public.categorias_despesa
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
REVOKE DELETE ON public.categorias_despesa,public.subcategorias_despesa,public.series_recorrencia FROM authenticated;

-- Definer confirmation needs to write its audit and metadata; clients do not.
CREATE OR REPLACE FUNCTION public.tg_mcp_operacao_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_internal boolean := current_user = pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.mcp_executar_operacao(uuid)'::regprocedure));
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT v_internal AND (NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.status<>'pending'
       OR NEW.executed_at IS NOT NULL OR NEW.resultado IS NOT NULL) THEN
      RAISE EXCEPTION 'Somente uma operação própria pendente pode ser preparada.';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT v_internal THEN
    IF (to_jsonb(NEW)-ARRAY['status','error','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','error','updated_at']) THEN
      RAISE EXCEPTION 'Plano, prévia e resultado da operação são imutáveis.';
    END IF;
    IF OLD.status<>'pending' OR NEW.status NOT IN ('cancelled','failed') THEN
      RAISE EXCEPTION 'A transição de status exige confirmação atômica; operação processada não pode ser reaberta.';
    END IF;
  ELSE
    IF NEW.plano IS DISTINCT FROM OLD.plano OR NEW.before_data IS DISTINCT FROM OLD.before_data
       OR NEW.after_data IS DISTINCT FROM OLD.after_data OR NEW.arguments IS DISTINCT FROM OLD.arguments
       OR NEW.tool_name IS DISTINCT FROM OLD.tool_name OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'A confirmação não pode reescrever o plano ou a prévia.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER mcp_operacao_imutavel BEFORE INSERT OR UPDATE ON public.mcp_operacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_mcp_operacao_imutavel();
REVOKE UPDATE ON public.mcp_operacoes FROM authenticated;
GRANT UPDATE(status,error) ON public.mcp_operacoes TO authenticated;

-- Validate links in the DB, including calls coming from the ordinary UI.
CREATE OR REPLACE FUNCTION public.tg_lancamento_coerencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tipo text:=TG_ARGV[0]; v_serie public.series_recorrencia; v_sub public.subcategorias_despesa;
  v_liquidado boolean; v_data text; v_assigned boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'UUID e proprietário do lançamento são imutáveis.';
    END IF;
    IF OLD.cancelado THEN RAISE EXCEPTION 'Lançamento cancelado é histórico e não pode ser reaberto ou editado.'; END IF;
    v_data:=CASE v_tipo WHEN 'despesa' THEN to_jsonb(OLD)->>'data_pagamento' ELSE to_jsonb(OLD)->>'data_recebimento' END;
    v_liquidado:=OLD.status IN ('Pago','Recebido') OR v_data IS NOT NULL;
    IF v_liquidado AND OLD.valor>0 AND NEW.valor<=0 THEN RAISE EXCEPTION 'A alteração não pode zerar uma liquidação histórica.'; END IF;
    IF NEW.cancelado AND v_liquidado THEN RAISE EXCEPTION 'Lançamento liquidado não pode ser cancelado; preserve os pagamentos históricos.'; END IF;
    IF v_liquidado AND (NEW.status IS DISTINCT FROM OLD.status OR
       (v_data IS NOT NULL AND (CASE v_tipo WHEN 'despesa' THEN to_jsonb(NEW)->>'data_pagamento' ELSE to_jsonb(NEW)->>'data_recebimento' END) IS NULL)) THEN
      RAISE EXCEPTION 'A alteração não pode remover uma liquidação histórica.';
    END IF;
  END IF;
  IF NEW.cancelado AND (NEW.status IN ('Pago','Recebido') OR
     (CASE v_tipo WHEN 'despesa' THEN to_jsonb(NEW)->>'data_pagamento' ELSE to_jsonb(NEW)->>'data_recebimento' END) IS NOT NULL) THEN
    RAISE EXCEPTION 'Lançamento liquidado não pode ser cancelado.';
  END IF;
  v_assigned:=TG_OP='INSERT' OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id OR NEW.subcategoria_id IS DISTINCT FROM OLD.subcategoria_id;
  IF NEW.subcategoria_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subcategorias_despesa WHERE id=NEW.subcategoria_id FOR KEY SHARE;
    IF v_sub.id IS NULL OR NEW.categoria_id IS NULL OR v_sub.categoria_id<>NEW.categoria_id THEN
      RAISE EXCEPTION 'Subcategoria não pertence à categoria informada.';
    END IF;
    IF v_assigned AND NOT v_sub.ativo THEN RAISE EXCEPTION 'Subcategoria inativa não aceita novos vínculos.'; END IF;
  END IF;
  IF v_assigned AND NEW.categoria_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categorias_despesa WHERE id=NEW.categoria_id AND ativo) THEN
    RAISE EXCEPTION 'Categoria inexistente ou inativa não aceita novos vínculos.';
  END IF;
  IF NEW.serie_id IS NOT NULL THEN
    SELECT * INTO v_serie FROM public.series_recorrencia WHERE id=NEW.serie_id FOR UPDATE;
    IF v_serie.id IS NULL OR v_serie.user_id<>NEW.user_id OR v_serie.tipo<>v_tipo THEN
      RAISE EXCEPTION 'Série não encontrada ou incompatível com usuário/tipo do lançamento.';
    END IF;
    IF TG_OP='INSERT' OR NEW.serie_id IS DISTINCT FROM OLD.serie_id OR NEW.ocorrencia IS DISTINCT FROM OLD.ocorrencia THEN
      IF NOT v_serie.ativa OR v_serie.encerrada_em IS NOT NULL THEN RAISE EXCEPTION 'Série encerrada não aceita novas ocorrências ou vínculos.'; END IF;
    END IF;
    IF TG_OP='INSERT' AND NEW.ocorrencia IS NULL THEN
      RAISE EXCEPTION 'Nova ocorrência exige data de ocorrência explícita; não é inferida do histórico.';
    END IF;
  ELSIF NEW.ocorrencia IS NOT NULL THEN
    RAISE EXCEPTION 'Ocorrência exige uma série identificada por UUID.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_lancamento_coerencia() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tg_serie_coerencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.tipo IS DISTINCT FROM OLD.tipo) THEN
    RAISE EXCEPTION 'UUID, proprietário e tipo da série são imutáveis.';
  END IF;
  IF TG_OP='UPDATE' AND NOT OLD.ativa AND (NEW.ativa OR NEW.encerrada_em IS DISTINCT FROM OLD.encerrada_em) THEN
    RAISE EXCEPTION 'Série encerrada não pode ser renovada automaticamente; crie uma nova série explícita.';
  END IF;
  IF NEW.ativa AND NEW.encerrada_em IS NOT NULL THEN RAISE EXCEPTION 'Série ativa não pode ter data de encerramento.'; END IF;
  IF NEW.subcategoria_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.subcategorias_despesa WHERE id=NEW.subcategoria_id AND categoria_id=NEW.categoria_id) THEN
    RAISE EXCEPTION 'Subcategoria da série não pertence à categoria informada.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_serie_coerencia() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER serie_coerencia BEFORE INSERT OR UPDATE ON public.series_recorrencia
FOR EACH ROW EXECUTE FUNCTION public.tg_serie_coerencia();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.series_recorrencia'::regclass AND conname='series_subcategoria_coerente_fkey') THEN
    ALTER TABLE public.series_recorrencia ADD CONSTRAINT series_subcategoria_coerente_fkey
      FOREIGN KEY(subcategoria_id,categoria_id) REFERENCES public.subcategorias_despesa(id,categoria_id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_protege_delete_liquidado()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.status IN ('Pago','Recebido') OR OLD.cancelado OR
     COALESCE(to_jsonb(OLD)->>'data_pagamento',to_jsonb(OLD)->>'data_recebimento') IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento liquidado ou cancelado não pode ser excluído; preserve o histórico (id %).',OLD.id;
  END IF;
  RETURN OLD;
END $$;

-- This is the same deterministic translation as planoDaOperacao in server.ts.
-- It makes tool name, preview and persisted plan one coherent authority boundary.
CREATE OR REPLACE FUNCTION public.mcp_plano_esperado(_tool text,_after jsonb,_user uuid)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE ins jsonb:='[]'; ups jsonb:='[]'; i jsonb; tab text;
BEGIN
  CASE _tool
    WHEN 'preparar_alteracao_lote' THEN
      FOR i IN SELECT * FROM jsonb_array_elements(_after->'itens') LOOP
        ups:=ups||jsonb_build_array(jsonb_build_object('tabela',i->'tabela','id',i->'id','versao',i->'versao','patch',i->'patch'));
      END LOOP;
    WHEN 'preparar_criacao_receita' THEN
      ins:=jsonb_build_array(jsonb_build_object('tabela','receitas','row',_after||jsonb_build_object('comissao',0,'user_id',_user)));
    WHEN 'preparar_criacao_despesa' THEN
      ins:=jsonb_build_array(jsonb_build_object('tabela','despesas','row',_after||jsonb_build_object('user_id',_user)));
    WHEN 'preparar_criacao_categoria','preparar_criacao_subcategoria' THEN
      tab:=CASE _tool WHEN 'preparar_criacao_categoria' THEN 'categorias_despesa' ELSE 'subcategorias_despesa' END;
      IF _after->>'tabela' IS DISTINCT FROM tab THEN RAISE EXCEPTION 'Tabela incompatível com ferramenta.'; END IF;
      ins:=jsonb_build_array(jsonb_build_object('tabela',tab,'row',_after->'payload'));
    WHEN 'preparar_criacao_serie' THEN
      ins:=jsonb_build_array(jsonb_build_object('tabela','series_recorrencia','row',(_after->'payload')||jsonb_build_object('user_id',_user),'ref','serie'));
      FOR i IN SELECT * FROM jsonb_array_elements(COALESCE(_after->'lancamentos','[]')) LOOP
        IF i->>'tabela' IS DISTINCT FROM (CASE _after->'payload'->>'tipo' WHEN 'despesa' THEN 'despesas' WHEN 'receita' THEN 'receitas' END) THEN
          RAISE EXCEPTION 'Tipo de lançamento incompatível com série.';
        END IF;
        ups:=ups||jsonb_build_array(jsonb_build_object('tabela',i->'tabela','id',i->'id','versao',i->'versao','patch','{}'::jsonb,'refs',jsonb_build_object('serie_id','serie')));
      END LOOP;
    WHEN 'preparar_alteracao_lancamento','preparar_marcacao_status','preparar_cancelamento_lancamento',
         'preparar_alteracao_categoria','preparar_alteracao_subcategoria','preparar_encerramento_serie' THEN
      tab:=_after->>'tabela';
      IF (_tool IN ('preparar_alteracao_lancamento','preparar_marcacao_status','preparar_cancelamento_lancamento') AND tab NOT IN ('receitas','despesas'))
      OR (_tool='preparar_alteracao_categoria' AND tab IS DISTINCT FROM 'categorias_despesa')
      OR (_tool='preparar_alteracao_subcategoria' AND tab IS DISTINCT FROM 'subcategorias_despesa')
      OR (_tool='preparar_encerramento_serie' AND tab IS DISTINCT FROM 'series_recorrencia') THEN RAISE EXCEPTION 'Tabela incompatível com ferramenta.'; END IF;
      IF _tool='preparar_marcacao_status' AND (SELECT count(*) FROM jsonb_object_keys(_after->'updates'))<>1 THEN RAISE EXCEPTION 'Marcação de status contém campos incompatíveis.'; END IF;
      IF _tool='preparar_marcacao_status' AND NOT ((_after->'updates')?'status') THEN RAISE EXCEPTION 'Marcação sem status.'; END IF;
      IF _tool='preparar_encerramento_serie' AND ((_after->'updates'->>'ativa')::boolean IS DISTINCT FROM false OR _after->'updates'->>'encerrada_em' IS NULL) THEN RAISE EXCEPTION 'Encerramento de série inválido.'; END IF;
      IF _tool='preparar_cancelamento_lancamento' AND (_after->'updates'->>'cancelado')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cancelamento sem marca explícita.'; END IF;
      ups:=jsonb_build_array(jsonb_build_object('tabela',tab,'id',_after->'id','versao',_after->'versao','patch',_after->'updates'));
    ELSE RAISE EXCEPTION 'Ferramenta não suportada: %',_tool;
  END CASE;
  RETURN jsonb_build_object('inserts',ins,'updates',ups);
END $$;
REVOKE ALL ON FUNCTION public.mcp_plano_esperado(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mcp_campos_permitidos(_tabela text,_insert boolean)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
SELECT CASE _tabela
 WHEN 'categorias_despesa' THEN ARRAY['nome','grupo_dre','ativo']
 WHEN 'subcategorias_despesa' THEN ARRAY['nome','categoria_id','grupo_dre','ativo']
 WHEN 'series_recorrencia' THEN CASE WHEN _insert THEN ARRAY['nome','tipo','ativa','unidade_negocio','categoria_id','subcategoria_id','setor_id','user_id'] ELSE ARRAY['nome','ativa','encerrada_em','motivo_encerramento','unidade_negocio','categoria_id','subcategoria_id','setor_id'] END
 WHEN 'despesas' THEN ARRAY['data','descricao','categoria_id','subcategoria_id','setor_id','responsavel','recorrente','tipo','valor','status','unidade_negocio','observacoes','competencia','vencimento','data_pagamento','ocorrencia','serie_id']||CASE WHEN _insert THEN ARRAY['user_id'] ELSE ARRAY['cancelado','cancelado_em','motivo_cancelamento'] END
 WHEN 'receitas' THEN ARRAY['data','descricao','categoria','categoria_id','subcategoria_id','setor_id','responsavel','recorrente','operadora_id','vendedor_id','contrato_id','valor','status','unidade_negocio','observacoes','competencia','vencimento','data_recebimento','ocorrencia','serie_id']||CASE WHEN _insert THEN ARRAY['user_id','comissao'] ELSE ARRAY['cancelado','cancelado_em','motivo_cancelamento'] END
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_campos_permitidos(text,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mcp_executar_operacao(_op_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.mcp_operacoes; plano jsonb; item jsonb; tab text; idv uuid; atual jsonb; patch jsonb;
  novo jsonb; ins boolean; permitidos text[]; cols text; sels text; keyv text; refv text;
  refs jsonb:='{}'; vistos text[]:=ARRAY[]::text[]; antes jsonb:='[]'; depois jsonb:='[]'; resultv jsonb;
  usuario uuid:=auth.uid(); n integer; affected integer; privileged boolean;
BEGIN
  IF usuario IS NULL THEN RAISE EXCEPTION 'Sessão inválida.'; END IF;
  SELECT * INTO op FROM public.mcp_operacoes WHERE id=_op_id AND user_id=usuario FOR UPDATE;
  IF op.id IS NULL THEN RAISE EXCEPTION 'Operação não encontrada.'; END IF;
  IF op.status<>'pending' THEN RAISE EXCEPTION 'Operação já processada (status: %).',op.status; END IF;
  IF op.expires_at<=now() THEN RAISE EXCEPTION 'Operação expirada; refaça o preparo.'; END IF;
  plano:=public.mcp_plano_esperado(op.tool_name,op.after_data,usuario);
  IF op.plano IS NULL OR op.plano IS DISTINCT FROM plano THEN RAISE EXCEPTION 'Plano não corresponde à ferramenta e à prévia persistida; refaça o preparo.'; END IF;
  n:=jsonb_array_length(plano->'inserts')+jsonb_array_length(plano->'updates');
  IF n<1 OR n>200 THEN RAISE EXCEPTION 'Operação deve conter entre 1 e 200 itens.'; END IF;
  privileged:=public.has_role(usuario,'admin') OR public.has_role(usuario,'gestor');
  FOR item,ins IN
    SELECT value,is_insert FROM (
      SELECT value,true AS is_insert,0 AS phase,ordinality FROM jsonb_array_elements(plano->'inserts') WITH ORDINALITY
      UNION ALL
      SELECT value,false AS is_insert,1 AS phase,ordinality FROM jsonb_array_elements(plano->'updates') WITH ORDINALITY
    ) entries ORDER BY phase,ordinality
  LOOP
    tab:=item->>'tabela';permitidos:=public.mcp_campos_permitidos(tab,ins);
    IF permitidos IS NULL THEN RAISE EXCEPTION 'Tabela não permitida: %',tab; END IF;
    IF tab IN ('categorias_despesa','subcategorias_despesa') AND NOT privileged THEN RAISE EXCEPTION 'A alteração de cadastros exige admin ou gestor.'; END IF;
    patch:=CASE WHEN ins THEN item->'row' ELSE item->'patch' END;
    IF patch IS NULL OR jsonb_typeof(patch)<>'object' THEN RAISE EXCEPTION 'Payload inválido em %.',tab; END IF;
    FOR keyv IN SELECT jsonb_object_keys(patch) LOOP
      IF NOT keyv=ANY(permitidos) THEN RAISE EXCEPTION 'Campo não permitido em %: %',tab,keyv; END IF;
    END LOOP;
    IF ins AND tab IN ('receitas','despesas','series_recorrencia') THEN
      IF patch?'user_id' AND patch->>'user_id' IS DISTINCT FROM usuario::text THEN RAISE EXCEPTION 'Proprietário incompatível.'; END IF;
      patch:=patch||jsonb_build_object('user_id',usuario);
    END IF;
    IF item?'refs' THEN
      FOR keyv,refv IN SELECT key,value FROM jsonb_each_text(item->'refs') LOOP
        IF keyv<>'serie_id' OR NOT keyv=ANY(permitidos) OR NOT refs?refv THEN RAISE EXCEPTION 'Referência simbólica inválida ou não resolvida.'; END IF;
        patch:=patch||jsonb_build_object(keyv,refs->>refv);
      END LOOP;
    END IF;
    IF patch='{}'::jsonb THEN RAISE EXCEPTION 'Operação sem campos.'; END IF;
    IF patch?'valor' AND (patch->>'valor')::numeric<0 THEN RAISE EXCEPTION 'Valor não pode ser negativo.'; END IF;
    IF patch?'nome' AND btrim(COALESCE(patch->>'nome',''))='' THEN RAISE EXCEPTION 'Nome não pode ser vazio.'; END IF;
    IF patch?'descricao' AND btrim(COALESCE(patch->>'descricao',''))='' THEN RAISE EXCEPTION 'Descrição não pode ser vazia.'; END IF;
    -- Only keys actually provided appear in INSERT/UPDATE. Omitted columns retain defaults/current values.
    SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('x.%I',k),',' ORDER BY k)
      INTO cols,sels FROM jsonb_object_keys(patch) k;
    IF ins THEN
      EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x RETURNING to_jsonb(%I.*)',tab,cols,sels,tab,tab)
        INTO novo USING patch;
      idv:=(novo->>'id')::uuid;atual:=NULL;
      IF item?'ref' THEN
        IF refs?(item->>'ref') OR item->>'ref' IS NULL THEN RAISE EXCEPTION 'Referência simbólica duplicada.'; END IF;
        refs:=refs||jsonb_build_object(item->>'ref',idv);
      END IF;
    ELSE
      idv:=(item->>'id')::uuid;
      IF idv IS NULL OR tab||':'||idv=ANY(vistos) THEN RAISE EXCEPTION 'Registro ausente ou repetido no plano.'; END IF;
      vistos:=array_append(vistos,tab||':'||idv);
      IF tab IN ('receitas','despesas','series_recorrencia') THEN
        EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND user_id=$2 FOR UPDATE',tab) INTO atual USING idv,usuario;
      ELSE
        EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',tab) INTO atual USING idv;
      END IF;
      IF atual IS NULL THEN RAISE EXCEPTION 'Registro % não encontrado ou sem acesso.',idv; END IF;
      IF item->>'versao' IS NULL THEN RAISE EXCEPTION 'Alteração sem versão de referência; refaça o preparo.'; END IF;
      IF (item->>'versao')::integer<>(atual->>'versao')::integer THEN RAISE EXCEPTION 'Registro foi alterado depois do preparo; refaça o preparo.'; END IF;
      IF op.tool_name='preparar_criacao_serie' AND atual->>'serie_id' IS NOT NULL THEN RAISE EXCEPTION 'Lançamento já está vinculado a uma série.'; END IF;
      EXECUTE format('UPDATE public.%I t SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x) WHERE id=$2 RETURNING to_jsonb(t.*)',tab,cols,sels,tab)
        INTO novo USING patch,idv;
      GET DIAGNOSTICS affected=ROW_COUNT;
      IF affected<>1 THEN RAISE EXCEPTION 'Alteração não atingiu exatamente um registro.'; END IF;
      antes:=antes||jsonb_build_array(atual);
    END IF;
    depois:=depois||jsonb_build_array(novo);
    INSERT INTO public.mcp_auditoria_registros(operacao_id,user_id,tabela,registro_id,acao,antes,depois)
      VALUES(_op_id,usuario,tab,idv,CASE WHEN ins THEN 'insert' ELSE 'update' END,atual,novo);
  END LOOP;
  resultv:=jsonb_build_object('ok',true,'itens',n,'antes',antes,'depois',depois);
  UPDATE public.mcp_operacoes SET status='executed',executed_at=now(),item_count=n,resultado=resultv WHERE id=_op_id;
  RETURN resultv;
END $$;
REVOKE ALL ON FUNCTION public.mcp_executar_operacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_executar_operacao(uuid) TO authenticated;
-- The pre-transaction reservation API cannot be used to forge an executed state.
REVOKE ALL ON FUNCTION public.mcp_claim_operacao(uuid) FROM PUBLIC,anon,authenticated;

-- Explicit UI generation: one unambiguous source per active series, no textual matching.
CREATE OR REPLACE FUNCTION public.gerar_ocorrencias_recorrentes(_source_inicio date,_source_fim date,_target_inicio date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE usuario uuid:=auth.uid(); serie public.series_recorrencia; origem public.despesas; novo public.despesas;
  target_end date; occurrence_date date; sources integer; criadas integer:=0; existentes integer:=0; legadas integer; ambiguas integer:=0;
  pendencias jsonb:='[]'; opid uuid; resultv jsonb;
BEGIN
  IF usuario IS NULL THEN RAISE EXCEPTION 'Sessão inválida.'; END IF;
  IF _source_inicio IS NULL OR _source_fim IS NULL OR _target_inicio IS NULL OR _source_inicio>_source_fim
     OR _target_inicio<>date_trunc('month',_target_inicio)::date OR _target_inicio<=_source_fim THEN
    RAISE EXCEPTION 'Informe período de origem válido e primeiro dia de mês posterior para destino.';
  END IF;
  target_end:=(_target_inicio+interval '1 month'-interval '1 day')::date;
  SELECT count(*) INTO legadas FROM public.despesas WHERE user_id=usuario AND recorrente AND NOT cancelado AND serie_id IS NULL AND data BETWEEN _source_inicio AND _source_fim;
  INSERT INTO public.mcp_operacoes(user_id,tool_name,status,arguments,summary)
    VALUES(usuario,'gerar_ocorrencias_recorrentes','pending',jsonb_build_object('source_inicio',_source_inicio,'source_fim',_source_fim,'target_inicio',_target_inicio),'Geração explícita de recorrências pela interface') RETURNING id INTO opid;
  FOR serie IN SELECT s.* FROM public.series_recorrencia s WHERE s.user_id=usuario AND s.tipo='despesa'
     AND EXISTS(SELECT 1 FROM public.despesas d WHERE d.user_id=usuario AND d.serie_id=s.id AND d.recorrente AND NOT d.cancelado AND d.data BETWEEN _source_inicio AND _source_fim)
     ORDER BY s.id FOR UPDATE LOOP
    IF NOT serie.ativa OR serie.encerrada_em IS NOT NULL THEN
      pendencias:=pendencias||jsonb_build_array(jsonb_build_object('serie_id',serie.id,'motivo','Série encerrada; nenhuma renovação criada.'));CONTINUE;
    END IF;
    SELECT count(*) INTO sources FROM public.despesas WHERE user_id=usuario AND serie_id=serie.id AND recorrente AND NOT cancelado AND data BETWEEN _source_inicio AND _source_fim;
    IF sources<>1 THEN
      ambiguas:=ambiguas+1;pendencias:=pendencias||jsonb_build_array(jsonb_build_object('serie_id',serie.id,'motivo','Mais de uma origem no período; revise o agendamento antes de gerar.'));CONTINUE;
    END IF;
    IF serie.categoria_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.categorias_despesa WHERE id=serie.categoria_id AND ativo) THEN
      pendencias:=pendencias||jsonb_build_array(jsonb_build_object('serie_id',serie.id,'motivo','Série sem categoria ativa explícita.'));CONTINUE;
    END IF;
    IF EXISTS(SELECT 1 FROM public.despesas WHERE user_id=usuario AND serie_id=serie.id AND ocorrencia BETWEEN _target_inicio AND target_end) THEN existentes:=existentes+1;CONTINUE;END IF;
    SELECT * INTO origem FROM public.despesas WHERE user_id=usuario AND serie_id=serie.id AND recorrente AND NOT cancelado AND data BETWEEN _source_inicio AND _source_fim;
    occurrence_date:=_target_inicio+(LEAST(EXTRACT(day FROM COALESCE(origem.vencimento,origem.data))::integer,EXTRACT(day FROM target_end)::integer)-1);
    INSERT INTO public.despesas(user_id,data,descricao,categoria_id,subcategoria_id,setor_id,tipo,valor,responsavel,recorrente,status,unidade_negocio,observacoes,serie_id,ocorrencia,vencimento)
      VALUES(usuario,occurrence_date,origem.descricao,serie.categoria_id,serie.subcategoria_id,serie.setor_id,origem.tipo,origem.valor,origem.responsavel,true,'A pagar',serie.unidade_negocio,origem.observacoes,serie.id,occurrence_date,occurrence_date) RETURNING * INTO novo;
    INSERT INTO public.mcp_auditoria_registros(operacao_id,user_id,tabela,registro_id,acao,antes,depois)
      VALUES(opid,usuario,'despesas',novo.id,'insert',NULL,to_jsonb(novo));
    criadas:=criadas+1;
  END LOOP;
  resultv:=jsonb_build_object('criadas',criadas,'ignoradas_existentes',existentes,'legadas_sem_serie',legadas,'ignoradas_ambiguas',ambiguas,'pendencias',pendencias);
  UPDATE public.mcp_operacoes SET status='executed',executed_at=now(),item_count=criadas,resultado=resultv WHERE id=opid;
  RETURN resultv;
END $$;
REVOKE ALL ON FUNCTION public.gerar_ocorrencias_recorrentes(date,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gerar_ocorrencias_recorrentes(date,date,date) TO authenticated;

-- Catalogs are shared: privileged previews return global aggregates, never other users' rows.
CREATE OR REPLACE FUNCTION public.mcp_impacto_categoria(_categoria_id uuid,_subcategoria_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
DECLARE usuario uuid:=auth.uid(); des jsonb; rec jsonb; subs integer; series integer;
BEGIN
  IF usuario IS NULL OR NOT (public.has_role(usuario,'admin') OR public.has_role(usuario,'gestor')) THEN
    RAISE EXCEPTION 'A consulta global de impacto exige admin ou gestor.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.categorias_despesa WHERE id=_categoria_id) THEN RAISE EXCEPTION 'Categoria não encontrada.'; END IF;
  IF _subcategoria_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.subcategorias_despesa WHERE id=_subcategoria_id AND categoria_id=_categoria_id) THEN
    RAISE EXCEPTION 'Subcategoria não pertence à categoria informada.';
  END IF;
  SELECT jsonb_build_object('quantidade',count(*),'valor',COALESCE(sum(valor),0),
      'liquidados',count(*) FILTER(WHERE status='Pago' OR data_pagamento IS NOT NULL),
      'usuarios_afetados',count(DISTINCT user_id),'data_inicio',min(data),'data_fim',max(data)) INTO des
    FROM public.despesas WHERE categoria_id=_categoria_id AND (_subcategoria_id IS NULL OR subcategoria_id=_subcategoria_id);
  SELECT jsonb_build_object('quantidade',count(*),'valor',COALESCE(sum(valor),0),
      'liquidados',count(*) FILTER(WHERE status='Recebido' OR data_recebimento IS NOT NULL),
      'usuarios_afetados',count(DISTINCT user_id),'data_inicio',min(data),'data_fim',max(data)) INTO rec
    FROM public.receitas WHERE categoria_id=_categoria_id AND (_subcategoria_id IS NULL OR subcategoria_id=_subcategoria_id);
  SELECT count(*) INTO subs FROM public.subcategorias_despesa WHERE categoria_id=_categoria_id AND (_subcategoria_id IS NULL OR id=_subcategoria_id);
  SELECT count(*) INTO series FROM public.series_recorrencia WHERE categoria_id=_categoria_id AND (_subcategoria_id IS NULL OR subcategoria_id=_subcategoria_id);
  RETURN jsonb_build_object('despesas_vinculadas',des,'receitas_vinculadas',rec,'subcategorias',subs,'series_vinculadas',series,'escopo','global_agregado');
END $$;
REVOKE ALL ON FUNCTION public.mcp_impacto_categoria(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_impacto_categoria(uuid,uuid) TO authenticated;
