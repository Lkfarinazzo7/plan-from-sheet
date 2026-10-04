CREATE TABLE public.metas_financeiras (
  chave text PRIMARY KEY,
  valor numeric NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.metas_financeiras TO authenticated;
GRANT ALL ON public.metas_financeiras TO service_role;
ALTER TABLE public.metas_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores leem metas" ON public.metas_financeiras FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "Admins inserem metas" ON public.metas_financeiras FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "Admins alteram metas" ON public.metas_financeiras FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE TRIGGER update_metas_financeiras_updated_at BEFORE UPDATE ON public.metas_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.metas_financeiras (chave, valor, descricao) VALUES
 ('margem_contribuicao_min', 40, 'Margem de contribuição desejada (% mínimo)'),
 ('custo_fixo_max', 15, 'Custo fixo desejado (% máximo da receita líquida)'),
 ('geracao_caixa_min', 30, 'Geração de caixa desejada (% mínimo das entradas)');