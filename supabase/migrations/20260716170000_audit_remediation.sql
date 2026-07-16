-- Security and data-integrity remediation following the full repository audit.

-- Contracts must link to the proposal they summarize. Names remain display
-- labels and are no longer used as relational keys.
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS proposta_id uuid;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS origem_recorrencia_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contratos_proposta_id_fkey'
  ) THEN
    ALTER TABLE public.contratos
      ADD CONSTRAINT contratos_proposta_id_fkey
      FOREIGN KEY (proposta_id)
      REFERENCES public.propostas(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'despesas_origem_recorrencia_id_fkey'
  ) THEN
    ALTER TABLE public.despesas
      ADD CONSTRAINT despesas_origem_recorrencia_id_fkey
      FOREIGN KEY (origem_recorrencia_id)
      REFERENCES public.despesas(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS despesas_recorrencia_destino_unique
  ON public.despesas(user_id, origem_recorrencia_id, data);
CREATE INDEX IF NOT EXISTS contratos_user_id_idx ON public.contratos(user_id);
CREATE INDEX IF NOT EXISTS pipeline_contratos_user_id_idx ON public.pipeline_contratos(user_id);

-- Enforce ownership integrity for new rows without making deployment depend
-- on the absence of historical orphan records.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_user_id_fkey') THEN
    ALTER TABLE public.contratos
      ADD CONSTRAINT contratos_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'propostas_user_id_fkey') THEN
    ALTER TABLE public.propostas
      ADD CONSTRAINT propostas_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_contratos_user_id_fkey') THEN
    ALTER TABLE public.pipeline_contratos
      ADD CONSTRAINT pipeline_contratos_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_fkey') THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- Backfill only unambiguous, same-owner exact matches. Ambiguous contracts are
-- intentionally left unlinked for a user to resolve in the UI.
WITH unique_contracts AS (
  SELECT user_id, lower(btrim(nome)) AS normalized_name
  FROM public.contratos
  GROUP BY user_id, lower(btrim(nome))
  HAVING count(*) = 1
), matches AS (
  SELECT c.id AS contrato_id, min(p.id::text)::uuid AS proposta_id
  FROM public.contratos c
  JOIN unique_contracts uc
    ON uc.user_id = c.user_id
   AND uc.normalized_name = lower(btrim(c.nome))
  JOIN public.propostas p
    ON p.user_id = c.user_id
   AND lower(btrim(p.nome)) = lower(btrim(c.nome))
  WHERE c.proposta_id IS NULL
  GROUP BY c.id
  HAVING count(*) = 1
)
UPDATE public.contratos c
SET proposta_id = matches.proposta_id
FROM matches
WHERE c.id = matches.contrato_id;

CREATE UNIQUE INDEX IF NOT EXISTS contratos_proposta_id_unique
  ON public.contratos(proposta_id)
  WHERE proposta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_contrato_proposta_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proposta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.propostas p
    WHERE p.id = NEW.proposta_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A proposta selecionada não pertence ao mesmo usuário do contrato';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_contrato_proposta_owner ON public.contratos;
CREATE TRIGGER validate_contrato_proposta_owner
  BEFORE INSERT OR UPDATE OF proposta_id, user_id ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.validate_contrato_proposta_owner();

CREATE OR REPLACE FUNCTION public.validate_receita_proposta_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proposta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.propostas p
    WHERE p.id = NEW.proposta_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A proposta selecionada não pertence ao mesmo usuário da receita';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_receita_proposta_owner ON public.receitas;
CREATE TRIGGER validate_receita_proposta_owner
  BEFORE INSERT OR UPDATE OF proposta_id, user_id ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.validate_receita_proposta_owner();

CREATE OR REPLACE FUNCTION public.validate_despesa_origem_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origem_recorrencia_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.despesas d
    WHERE d.id = NEW.origem_recorrencia_id AND d.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A origem recorrente não pertence ao mesmo usuário da despesa';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_despesa_origem_owner ON public.despesas;
CREATE TRIGGER validate_despesa_origem_owner
  BEFORE INSERT OR UPDATE OF origem_recorrencia_id, user_id ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.validate_despesa_origem_owner();

-- Remove inconsistent legacy commission data before enforcing invariants.
UPDATE public.contratos
SET supervisor_a_percentual = NULL, supervisor_a_valor = NULL, supervisor_a_pago = false
WHERE supervisor_a_id IS NULL;

UPDATE public.contratos
SET supervisor_b_percentual = NULL, supervisor_b_valor = NULL, supervisor_b_pago = false
WHERE supervisor_b_id IS NULL;

UPDATE public.contratos
SET corretor_percentual = NULL, corretor_valor = NULL, corretor_pago = false
WHERE corretor_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_supervisor_a_consistente') THEN
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_supervisor_a_consistente CHECK (
      supervisor_a_id IS NOT NULL OR
      (supervisor_a_percentual IS NULL AND supervisor_a_valor IS NULL AND supervisor_a_pago = false)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_supervisor_b_consistente') THEN
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_supervisor_b_consistente CHECK (
      supervisor_b_id IS NOT NULL OR
      (supervisor_b_percentual IS NULL AND supervisor_b_valor IS NULL AND supervisor_b_pago = false)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_corretor_consistente') THEN
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_corretor_consistente CHECK (
      corretor_id IS NOT NULL OR
      (corretor_percentual IS NULL AND corretor_valor IS NULL AND corretor_pago = false)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_valores_nao_negativos') THEN
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_valores_nao_negativos CHECK (
      valor_contrato >= 0 AND
      (supervisor_a_percentual IS NULL OR supervisor_a_percentual >= 0) AND
      (supervisor_a_valor IS NULL OR supervisor_a_valor >= 0) AND
      (supervisor_b_percentual IS NULL OR supervisor_b_percentual >= 0) AND
      (supervisor_b_valor IS NULL OR supervisor_b_valor >= 0) AND
      (corretor_percentual IS NULL OR corretor_percentual >= 0) AND
      (corretor_valor IS NULL OR corretor_valor >= 0)
    ) NOT VALID;
  END IF;
END $$;

-- Reference data is readable by every authenticated user, but only admins and
-- gestores may change shared values.
DROP POLICY IF EXISTS "Authenticated users can manage vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated users can manage operadoras" ON public.operadoras;
DROP POLICY IF EXISTS "Authenticated users can manage categorias" ON public.categorias_despesa;
DROP POLICY IF EXISTS "Authenticated users can manage supervisores" ON public.supervisores;
DROP POLICY IF EXISTS "Authenticated manage canais" ON public.canais_venda;
DROP POLICY IF EXISTS "Authenticated users can manage setores" ON public.setores_despesa;
DROP POLICY IF EXISTS "Authenticated manage setores" ON public.setores_despesa;
DROP POLICY IF EXISTS "Authenticated users can read vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Managers can manage vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated users can read operadoras" ON public.operadoras;
DROP POLICY IF EXISTS "Managers can manage operadoras" ON public.operadoras;
DROP POLICY IF EXISTS "Authenticated users can read categorias" ON public.categorias_despesa;
DROP POLICY IF EXISTS "Managers can manage categorias" ON public.categorias_despesa;
DROP POLICY IF EXISTS "Authenticated users can read supervisores" ON public.supervisores;
DROP POLICY IF EXISTS "Managers can manage supervisores" ON public.supervisores;
DROP POLICY IF EXISTS "Authenticated users can read setores" ON public.setores_despesa;
DROP POLICY IF EXISTS "Managers can manage setores" ON public.setores_despesa;
DROP POLICY IF EXISTS "Authenticated users can read canais" ON public.canais_venda;
DROP POLICY IF EXISTS "Managers can manage canais" ON public.canais_venda;

CREATE POLICY "Authenticated users can read vendedores"
  ON public.vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage vendedores"
  ON public.vendedores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Authenticated users can read operadoras"
  ON public.operadoras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage operadoras"
  ON public.operadoras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Authenticated users can read categorias"
  ON public.categorias_despesa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage categorias"
  ON public.categorias_despesa FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Authenticated users can read supervisores"
  ON public.supervisores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage supervisores"
  ON public.supervisores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Authenticated users can read setores"
  ON public.setores_despesa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage setores"
  ON public.setores_despesa FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Authenticated users can read canais"
  ON public.canais_venda FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage canais"
  ON public.canais_venda FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- Pipeline records are shared only with the roles that administer the
-- commercial pipeline, instead of every authenticated account.
DROP POLICY IF EXISTS "Authenticated read pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Authenticated insert pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Authenticated update pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Authenticated delete pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Pipeline roles can read pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Pipeline roles can insert pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Pipeline roles can update pipeline" ON public.pipeline_contratos;
DROP POLICY IF EXISTS "Pipeline roles can delete pipeline" ON public.pipeline_contratos;

CREATE POLICY "Pipeline roles can read pipeline"
  ON public.pipeline_contratos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'adm_pipeline')
  );
CREATE POLICY "Pipeline roles can insert pipeline"
  ON public.pipeline_contratos FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
      public.has_role(auth.uid(), 'adm_pipeline')
    )
  );
CREATE POLICY "Pipeline roles can update pipeline"
  ON public.pipeline_contratos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'adm_pipeline')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'adm_pipeline')
  );
CREATE POLICY "Pipeline roles can delete pipeline"
  ON public.pipeline_contratos FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'adm_pipeline')
  );

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin') AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'Não é possível remover o último administrador';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_admin_removal ON public.user_roles;
CREATE TRIGGER prevent_last_admin_removal
  BEFORE DELETE OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- Bootstrap through an atomic SECURITY DEFINER function. The previous policy
-- evaluated a subquery under RLS and allowed a race between first users.
DROP POLICY IF EXISTS "Bootstrap first admin" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles(user_id, role) VALUES (current_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

DROP POLICY IF EXISTS "Authenticated read pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Pipeline roles can read pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Pipeline roles can upload pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Pipeline roles can update pipeline anexos" ON storage.objects;
DROP POLICY IF EXISTS "Pipeline roles can delete pipeline anexos" ON storage.objects;

CREATE POLICY "Pipeline roles can read pipeline anexos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pipeline-anexos' AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
      public.has_role(auth.uid(), 'adm_pipeline')
    )
  );
CREATE POLICY "Pipeline roles can upload pipeline anexos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1] AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
      public.has_role(auth.uid(), 'adm_pipeline')
    )
  );
CREATE POLICY "Pipeline roles can update pipeline anexos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1] AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
      public.has_role(auth.uid(), 'adm_pipeline')
    )
  )
  WITH CHECK (
    bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1] AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
      public.has_role(auth.uid(), 'adm_pipeline')
    )
  );
CREATE POLICY "Pipeline roles can delete pipeline anexos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pipeline-anexos' AND auth.uid()::text = (storage.foldername(name))[1] AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor') OR
      public.has_role(auth.uid(), 'adm_pipeline')
    )
  );

-- Show admins every account, including users that do not have a role yet.
CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE(user_id uuid, email text, roles public.app_role[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem listar usuários';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(
      array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL),
      ARRAY[]::public.app_role[]
    ) AS roles
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  GROUP BY u.id, u.email
  ORDER BY u.email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_users_with_roles() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO authenticated;
