
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'adm_pipeline');

CREATE TYPE public.pipeline_etapa AS ENUM (
  'Montagem de contrato',
  'Assinatura / Declaração de saúde',
  'Entrevista médica',
  'Em análise',
  'Pendências',
  'Aguardando vigência',
  'Implantado'
);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bootstrap: any authenticated user can grant themselves admin if no admin exists yet
CREATE POLICY "Bootstrap first admin"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
  );

-- ============ CANAIS DE VENDA ============
CREATE TABLE public.canais_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.canais_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage canais"
  ON public.canais_venda FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_canais_venda_updated_at
  BEFORE UPDATE ON public.canais_venda
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PIPELINE CONTRATOS ============
CREATE TABLE public.pipeline_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cliente text NOT NULL,
  numero_proposta text,
  tipo text NOT NULL DEFAULT 'PF',
  operadora_id uuid,
  canal_id uuid,
  vendedor_id uuid,
  valor_mensal numeric NOT NULL DEFAULT 0,
  data_vigencia date,
  data_revisao date,
  etapa public.pipeline_etapa NOT NULL DEFAULT 'Montagem de contrato',
  posicao bigint NOT NULL DEFAULT 0,
  observacoes text,
  dados_proposta jsonb DEFAULT '{}'::jsonb,
  declinada boolean NOT NULL DEFAULT false,
  motivo_declinio text,
  declinada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipeline_contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pipeline"
  ON public.pipeline_contratos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pipeline"
  ON public.pipeline_contratos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated update pipeline"
  ON public.pipeline_contratos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete pipeline"
  ON public.pipeline_contratos FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_pipeline_contratos_updated_at
  BEFORE UPDATE ON public.pipeline_contratos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pipeline_etapa ON public.pipeline_contratos(etapa);
CREATE INDEX idx_pipeline_declinada ON public.pipeline_contratos(declinada);

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('pipeline-anexos', 'pipeline-anexos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated read pipeline anexos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pipeline-anexos');
CREATE POLICY "Authenticated upload pipeline anexos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Authenticated update pipeline anexos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Authenticated delete pipeline anexos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);
