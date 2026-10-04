CREATE TABLE IF NOT EXISTS public.despesas_backup_20261004 AS SELECT * FROM public.despesas;
CREATE TABLE IF NOT EXISTS public.receitas_backup_20261004 AS SELECT * FROM public.receitas;
ALTER TABLE public.despesas_backup_20261004 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas_backup_20261004 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.despesas_backup_20261004, public.receitas_backup_20261004 FROM anon, authenticated;

ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS datas_legado boolean NOT NULL DEFAULT false;
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS datas_legado boolean NOT NULL DEFAULT false;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS revisao_manual text;

UPDATE public.despesas SET
  competencia=COALESCE(competencia,data),
  data_pagamento=CASE WHEN status='Pago' THEN COALESCE(data_pagamento,data) ELSE data_pagamento END,
  vencimento=CASE WHEN status<>'Pago' THEN COALESCE(vencimento,data) ELSE vencimento END,
  datas_legado=true
WHERE NOT cancelado AND (competencia IS NULL OR (status='Pago' AND data_pagamento IS NULL) OR (status<>'Pago' AND vencimento IS NULL));

UPDATE public.receitas SET
  competencia=COALESCE(competencia,data),
  data_recebimento=CASE WHEN status='Recebido' THEN COALESCE(data_recebimento,data) ELSE data_recebimento END,
  vencimento=CASE WHEN status<>'Recebido' THEN COALESCE(vencimento,data) ELSE vencimento END,
  datas_legado=true
WHERE NOT cancelado AND (competencia IS NULL OR (status='Recebido' AND data_recebimento IS NULL) OR (status<>'Recebido' AND vencimento IS NULL));

-- Categorias -> grupo DRE
UPDATE public.categorias_despesa SET grupo_dre=CASE nome
  WHEN 'Comissão' THEN 'custos_variaveis'
  WHEN 'Marketing' THEN 'despesas_comerciais'
  WHEN 'Impostos' THEN 'deducoes_receita'
  WHEN 'Empréstimo' THEN 'fora_dre'
  ELSE 'despesas_fixas' END
WHERE grupo_dre IS NULL;

INSERT INTO public.categorias_despesa(nome,tipo_dre,grupo_dre,ativo)
SELECT 'Receita operacional','operacional','receita_operacional',true
WHERE NOT EXISTS(SELECT 1 FROM public.categorias_despesa WHERE nome='Receita operacional');

INSERT INTO public.subcategorias_despesa(categoria_id,nome,grupo_dre,ativo)
SELECT c.id,s.nome,s.grupo,true FROM public.categorias_despesa c
JOIN (VALUES ('Impostos','DAS Odisseia','deducoes_receita'),('Impostos','DAS colaboradores','despesas_fixas'),
             ('Empréstimo','Principal','fora_dre'),('Empréstimo','Juros','resultado_financeiro')) s(cat,nome,grupo) ON s.cat=c.nome
WHERE NOT EXISTS(SELECT 1 FROM public.subcategorias_despesa x WHERE x.categoria_id=c.id AND x.nome=s.nome);

UPDATE public.despesas d SET subcategoria_id=s.id FROM public.subcategorias_despesa s JOIN public.categorias_despesa c ON c.id=s.categoria_id
WHERE c.nome='Impostos' AND d.categoria_id=c.id AND NOT d.cancelado AND d.subcategoria_id IS NULL
  AND s.nome=CASE WHEN btrim(d.descricao)='DAS' THEN 'DAS Odisseia' ELSE 'DAS colaboradores' END;

UPDATE public.despesas d SET revisao_manual='Parcela de empréstimo: separar juros e principal (aguardando nº de parcelas).'
FROM public.categorias_despesa c WHERE c.id=d.categoria_id AND c.nome='Empréstimo' AND NOT d.cancelado;

UPDATE public.receitas SET categoria_id=(SELECT id FROM public.categorias_despesa WHERE nome='Receita operacional')
WHERE categoria_id IS NULL AND NOT cancelado;

-- Novos lançamentos: estrutura de datas obrigatória (preenchida a partir da data quando omitida)
CREATE OR REPLACE FUNCTION public.tg_lancamento_datas() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE liq boolean; efetiva date;
BEGIN
  IF NEW.cancelado THEN RETURN NEW; END IF;
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
END $$;
DROP TRIGGER IF EXISTS despesas_datas ON public.despesas;
CREATE TRIGGER despesas_datas BEFORE INSERT OR UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.tg_lancamento_datas();
DROP TRIGGER IF EXISTS receitas_datas ON public.receitas;
CREATE TRIGGER receitas_datas BEFORE INSERT OR UPDATE ON public.receitas FOR EACH ROW EXECUTE FUNCTION public.tg_lancamento_datas();