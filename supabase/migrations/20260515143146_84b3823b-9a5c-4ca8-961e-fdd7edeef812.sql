ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_operadora_id_fkey FOREIGN KEY (operadora_id) REFERENCES public.operadoras(id) ON DELETE SET NULL,
  ADD CONSTRAINT contratos_supervisor_a_id_fkey FOREIGN KEY (supervisor_a_id) REFERENCES public.supervisores(id) ON DELETE SET NULL,
  ADD CONSTRAINT contratos_supervisor_b_id_fkey FOREIGN KEY (supervisor_b_id) REFERENCES public.supervisores(id) ON DELETE SET NULL,
  ADD CONSTRAINT contratos_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.vendedores(id) ON DELETE SET NULL;