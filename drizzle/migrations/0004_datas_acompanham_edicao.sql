CREATE OR REPLACE FUNCTION public.tg_lancamento_datas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE liq boolean;
BEGIN
  IF NEW.cancelado THEN RETURN NEW; END IF;
  -- Quando só a Data muda, competência e vencimento que acompanhavam a data antiga passam a acompanhar a nova.
  IF TG_OP='UPDATE' AND NEW.data IS DISTINCT FROM OLD.data THEN
    IF NEW.competencia IS NOT DISTINCT FROM OLD.competencia AND OLD.competencia IS NOT DISTINCT FROM OLD.data THEN
      NEW.competencia := NEW.data;
    END IF;
    IF NEW.vencimento IS NOT DISTINCT FROM OLD.vencimento AND OLD.vencimento IS NOT DISTINCT FROM OLD.data THEN
      NEW.vencimento := NEW.data;
    END IF;
  END IF;
  NEW.competencia:=COALESCE(NEW.competencia,NEW.data);
  IF TG_TABLE_NAME='despesas' THEN
    liq:=NEW.status='Pago';
    IF liq THEN NEW.data_pagamento:=COALESCE(NEW.data_pagamento,NEW.data); ELSE NEW.vencimento:=COALESCE(NEW.vencimento,NEW.data); END IF;
  ELSE
    liq:=NEW.status='Recebido';
    IF liq THEN NEW.data_recebimento:=COALESCE(NEW.data_recebimento,NEW.data); ELSE NEW.vencimento:=COALESCE(NEW.vencimento,NEW.data); END IF;
  END IF;
  IF NEW.competencia IS NULL THEN RAISE EXCEPTION 'Lançamento exige data de competência.'; END IF;
  RETURN NEW;
END $function$;