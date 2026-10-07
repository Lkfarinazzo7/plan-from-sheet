ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS comissao_papel text CHECK (comissao_papel IN ('supervisor_a','supervisor_b','corretor'));
CREATE UNIQUE INDEX IF NOT EXISTS despesas_comissao_unica ON public.despesas(contrato_id, comissao_papel) WHERE contrato_id IS NOT NULL AND comissao_papel IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_contrato_sync_comissoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE papel text; pid uuid; pct numeric; val numeric; pago boolean; nome_p text; rotulo text; d date; existente public.despesas; cat uuid := 'e16c7642-3992-40d3-b494-59986fec70c7';
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 d := COALESCE(NEW.data_implantacao, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
 FOREACH papel IN ARRAY ARRAY['supervisor_a','supervisor_b','corretor'] LOOP
  IF papel='supervisor_a' THEN pid:=NEW.supervisor_a_id; pct:=NEW.supervisor_a_percentual; val:=NEW.supervisor_a_valor; pago:=NEW.supervisor_a_pago; rotulo:='Supervisor A';
   SELECT nome INTO nome_p FROM public.supervisores WHERE id=pid;
  ELSIF papel='supervisor_b' THEN pid:=NEW.supervisor_b_id; pct:=NEW.supervisor_b_percentual; val:=NEW.supervisor_b_valor; pago:=NEW.supervisor_b_pago; rotulo:='Supervisor B';
   SELECT nome INTO nome_p FROM public.supervisores WHERE id=pid;
  ELSE pid:=NEW.corretor_id; pct:=NEW.corretor_percentual; val:=NEW.corretor_valor; pago:=NEW.corretor_pago; rotulo:='Corretor';
   SELECT nome INTO nome_p FROM public.vendedores WHERE id=pid;
  END IF;
  IF pid IS NOT NULL AND COALESCE(val,0)<=0 THEN val:=COALESCE(NEW.valor_contrato,0)*COALESCE(pct,0)/100; END IF;
  SELECT * INTO existente FROM public.despesas WHERE contrato_id=NEW.id AND comissao_papel=papel;
  IF pid IS NULL OR COALESCE(val,0)<=0 THEN
   IF existente.id IS NOT NULL AND existente.status<>'Pago' AND NOT existente.cancelado THEN DELETE FROM public.despesas WHERE id=existente.id; END IF;
   CONTINUE;
  END IF;
  IF existente.id IS NULL THEN
   IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1) THEN NULL; END IF;
   INSERT INTO public.despesas(user_id,data,descricao,categoria_id,tipo,valor,responsavel,recorrente,status,unidade_negocio,vencimento,data_pagamento,contrato_id,comissao_papel)
   VALUES(NEW.user_id,d,'Comissão '||rotulo||' – '||COALESCE(nome_p,'?')||' – '||NEW.nome,cat,'Variável',round(val,2),nome_p,false,CASE WHEN pago THEN 'Pago' ELSE 'A pagar' END,NEW.unidade_negocio,d,CASE WHEN pago THEN d END,NEW.id,papel);
  ELSIF NOT existente.cancelado THEN
   IF existente.status<>'Pago' THEN
    UPDATE public.despesas SET descricao='Comissão '||rotulo||' – '||COALESCE(nome_p,'?')||' – '||NEW.nome, valor=round(val,2), responsavel=nome_p, data=d, vencimento=d, unidade_negocio=NEW.unidade_negocio,
      status=CASE WHEN pago THEN 'Pago' ELSE 'A pagar' END, data_pagamento=CASE WHEN pago THEN d END WHERE id=existente.id;
   ELSIF NOT pago THEN
    UPDATE public.despesas SET status='A pagar', data_pagamento=NULL WHERE id=existente.id;
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

CREATE TRIGGER contratos_sync_comissoes AFTER INSERT OR UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION public.tg_contrato_sync_comissoes();

CREATE OR REPLACE FUNCTION public.tg_despesa_sync_comissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
DECLARE p boolean := NEW.status='Pago';
BEGIN
 IF pg_trigger_depth() > 1 OR NEW.contrato_id IS NULL OR NEW.comissao_papel IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.comissao_papel='supervisor_a' THEN UPDATE public.contratos SET supervisor_a_pago=p WHERE id=NEW.contrato_id;
 ELSIF NEW.comissao_papel='supervisor_b' THEN UPDATE public.contratos SET supervisor_b_pago=p WHERE id=NEW.contrato_id;
 ELSE UPDATE public.contratos SET corretor_pago=p WHERE id=NEW.contrato_id; END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER despesas_sync_comissao AFTER UPDATE OF status ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.tg_despesa_sync_comissao();

REVOKE EXECUTE ON FUNCTION public.tg_contrato_sync_comissoes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_despesa_sync_comissao() FROM PUBLIC, anon, authenticated;