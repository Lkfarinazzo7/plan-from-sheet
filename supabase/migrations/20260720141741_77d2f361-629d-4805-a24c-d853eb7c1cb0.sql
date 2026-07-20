
-- pipeline_contratos: replace permissive policies
DROP POLICY IF EXISTS "Authenticated read pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Authenticated update pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Authenticated delete pipeline" ON public.pipeline_contratos;

CREATE POLICY "Users read own or admin" ON public.pipeline_contratos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own or admin" ON public.pipeline_contratos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own or admin" ON public.pipeline_contratos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- storage: restrict pipeline anexos SELECT to owner folder or admin
DROP POLICY IF EXISTS "Authenticated read pipeline anexos" ON storage.objects;
CREATE POLICY "Owner or admin read pipeline anexos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pipeline-anexos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- user_roles: remove bootstrap admin race
DROP POLICY IF EXISTS "Bootstrap first admin" ON public.user_roles;

-- Restrict SECURITY DEFINER admin functions
REVOKE ALL ON FUNCTION public.grant_role_by_email(text, app_role, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_users_with_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_role_by_email(text, app_role, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO service_role;

-- has_role is used inside RLS policies; keep executable but revoke from anon
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
