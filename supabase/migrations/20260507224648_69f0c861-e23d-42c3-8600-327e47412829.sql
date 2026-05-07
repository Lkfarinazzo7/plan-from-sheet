
-- Concede / revoga adm_pipeline por e-mail
CREATE OR REPLACE FUNCTION public.grant_role_by_email(_email text, _role public.app_role, _grant boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não encontrado');
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role = _role;
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid);
END;
$$;

-- Lista usuários com pelo menos um papel
CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE(user_id uuid, email text, roles public.app_role[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem listar usuários';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, array_agg(ur.role) AS roles
  FROM auth.users u
  JOIN public.user_roles ur ON ur.user_id = u.id
  GROUP BY u.id, u.email
  ORDER BY u.email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_role_by_email(text, public.app_role, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.list_users_with_roles() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_role_by_email(text, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO authenticated;
