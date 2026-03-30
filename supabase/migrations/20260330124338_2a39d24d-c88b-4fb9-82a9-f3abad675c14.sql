
-- Create update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Vendedores
CREATE TABLE public.vendedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage vendedores" ON public.vendedores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_vendedores_updated_at BEFORE UPDATE ON public.vendedores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Operadoras
CREATE TABLE public.operadoras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operadoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage operadoras" ON public.operadoras FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Categorias de despesa
CREATE TABLE public.categorias_despesa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categorias_despesa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage categorias" ON public.categorias_despesa FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Receitas (propostas/contratos)
CREATE TABLE public.receitas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('Bancária', 'Vida')),
  operadora_id UUID NOT NULL REFERENCES public.operadoras(id),
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  comissao NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendedor_id UUID NOT NULL REFERENCES public.vendedores(id),
  status TEXT NOT NULL DEFAULT 'Aguardando' CHECK (status IN ('Recebido', 'Aguardando')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their receitas" ON public.receitas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_receitas_updated_at BEFORE UPDATE ON public.receitas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Despesas
CREATE TABLE public.despesas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  categoria_id UUID NOT NULL REFERENCES public.categorias_despesa(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('Fixo', 'Variável')),
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  responsavel TEXT,
  recorrente BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'A pagar' CHECK (status IN ('Pago', 'A pagar', 'Atrasado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their despesas" ON public.despesas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_despesas_updated_at BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_receitas_data ON public.receitas(data);
CREATE INDEX idx_receitas_vendedor ON public.receitas(vendedor_id);
CREATE INDEX idx_receitas_user ON public.receitas(user_id);
CREATE INDEX idx_despesas_data ON public.despesas(data);
CREATE INDEX idx_despesas_user ON public.despesas(user_id);
CREATE INDEX idx_despesas_categoria ON public.despesas(categoria_id);
