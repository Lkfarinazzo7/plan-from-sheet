CREATE OR REPLACE FUNCTION public.tg_protege_delete_liquidado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF OLD.cancelado THEN RAISE EXCEPTION 'Lançamento cancelado é histórico e não pode ser excluído (id %).',OLD.id; END IF;
 RETURN OLD;
END $function$;