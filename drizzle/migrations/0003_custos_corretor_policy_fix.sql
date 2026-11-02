DROP POLICY "Admin/gestor gerenciam custos de corretor" ON public.custos_corretor;
CREATE POLICY "Usuarios financeiros gerenciam custos de corretor" ON public.custos_corretor
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(),'adm_pipeline') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (NOT public.has_role(auth.uid(),'adm_pipeline') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));