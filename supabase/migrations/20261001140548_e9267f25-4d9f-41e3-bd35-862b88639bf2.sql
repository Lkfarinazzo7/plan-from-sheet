DO $$
DECLARE d record; sid uuid;
BEGIN
 FOR d IN SELECT * FROM public.despesas WHERE recorrente AND NOT cancelado AND serie_id IS NULL AND data BETWEEN '2026-09-01' AND '2026-09-30' ORDER BY data, id LOOP
  INSERT INTO public.series_recorrencia(user_id,tipo,nome,ativa,unidade_negocio,categoria_id,subcategoria_id,setor_id)
   VALUES(d.user_id,'despesa',d.descricao,true,d.unidade_negocio,d.categoria_id,d.subcategoria_id,d.setor_id) RETURNING id INTO sid;
  UPDATE public.despesas SET serie_id=sid, ocorrencia=d.data WHERE id=d.id;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.gerar_ocorrencias_recorrentes(_source_inicio date, _source_fim date, _target_inicio date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE usuario uuid:=auth.uid(); serie public.series_recorrencia; origem public.despesas; novo public.despesas; target_end date; occurrence_date date; criadas integer:=0; existentes integer:=0; legadas integer; ambiguas integer:=0; pendencias jsonb:='[]'; opid uuid; resultv jsonb;
BEGIN
 IF usuario IS NULL THEN RAISE EXCEPTION 'Sessão inválida.'; END IF;
 IF _source_inicio IS NULL OR _source_fim IS NULL OR _target_inicio IS NULL OR _source_inicio>_source_fim OR _target_inicio<>date_trunc('month',_target_inicio)::date OR _target_inicio<=_source_fim THEN RAISE EXCEPTION 'Informe período de origem válido e primeiro dia de mês posterior para destino.'; END IF;
 target_end:=(_target_inicio+interval '1 month'-interval '1 day')::date;
 SELECT count(*) INTO legadas FROM public.despesas WHERE user_id=usuario AND recorrente AND NOT cancelado AND serie_id IS NULL AND data BETWEEN _source_inicio AND _source_fim;
 INSERT INTO public.mcp_operacoes(user_id,tool_name,status,arguments,summary) VALUES(usuario,'gerar_ocorrencias_recorrentes','pending',jsonb_build_object('source_inicio',_source_inicio,'source_fim',_source_fim,'target_inicio',_target_inicio),'Geração explícita de recorrências pela interface') RETURNING id INTO opid;
 FOR serie IN SELECT s.* FROM public.series_recorrencia s WHERE s.user_id=usuario AND s.tipo='despesa' AND EXISTS(SELECT 1 FROM public.despesas d WHERE d.user_id=usuario AND d.serie_id=s.id AND d.recorrente AND NOT d.cancelado AND d.data BETWEEN _source_inicio AND _source_fim) ORDER BY s.id FOR UPDATE LOOP
  IF NOT serie.ativa OR serie.encerrada_em IS NOT NULL THEN pendencias:=pendencias||jsonb_build_array(jsonb_build_object('serie_id',serie.id,'motivo','Série encerrada; nenhuma renovação criada.'));CONTINUE; END IF;
  IF serie.categoria_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.categorias_despesa WHERE id=serie.categoria_id AND ativo) THEN pendencias:=pendencias||jsonb_build_array(jsonb_build_object('serie_id',serie.id,'motivo','Série sem categoria ativa explícita.'));CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.despesas WHERE user_id=usuario AND serie_id=serie.id AND ocorrencia BETWEEN _target_inicio AND target_end) THEN existentes:=existentes+1;CONTINUE;END IF;
  SELECT * INTO origem FROM public.despesas WHERE user_id=usuario AND serie_id=serie.id AND recorrente AND NOT cancelado AND data BETWEEN _source_inicio AND _source_fim ORDER BY data DESC, created_at DESC LIMIT 1;
  occurrence_date:=_target_inicio+(LEAST(EXTRACT(day FROM COALESCE(origem.vencimento,origem.data))::integer,EXTRACT(day FROM target_end)::integer)-1);
  INSERT INTO public.despesas(user_id,data,descricao,categoria_id,subcategoria_id,setor_id,tipo,valor,responsavel,recorrente,status,unidade_negocio,observacoes,serie_id,ocorrencia,vencimento) VALUES(usuario,occurrence_date,origem.descricao,serie.categoria_id,serie.subcategoria_id,serie.setor_id,origem.tipo,origem.valor,origem.responsavel,true,'A pagar',serie.unidade_negocio,origem.observacoes,serie.id,occurrence_date,occurrence_date) RETURNING * INTO novo;
  INSERT INTO public.mcp_auditoria_registros(operacao_id,user_id,tabela,registro_id,acao,antes,depois) VALUES(opid,usuario,'despesas',novo.id,'insert',NULL,to_jsonb(novo));
  criadas:=criadas+1;
 END LOOP;
 resultv:=jsonb_build_object('criadas',criadas,'ignoradas_existentes',existentes,'legadas_sem_serie',legadas,'ignoradas_ambiguas',ambiguas,'pendencias',pendencias);
 UPDATE public.mcp_operacoes SET status='executed',executed_at=now(),item_count=criadas,resultado=resultv WHERE id=opid;
 RETURN resultv;
END $function$;