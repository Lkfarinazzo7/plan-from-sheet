import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AppRole = 'admin' | 'gestor' | 'adm_pipeline';

export function useUserRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-roles', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.role as AppRole);
    },
  });
}

export function useIsAdmPipelineOnly() {
  const { data: roles = [], isLoading, isError } = useUserRoles();
  const isAdmPipeline = roles.includes('adm_pipeline');
  const isAdmin = roles.includes('admin');
  const isGestor = roles.includes('gestor');
  const canManageCadastros = isAdmin || isGestor;
  return {
    isLoading,
    isError,
    isAdmPipelineOnly: isAdmPipeline && !canManageCadastros,
    isAdmin,
    isGestor,
    canManageCadastros,
    roles,
  };
}
