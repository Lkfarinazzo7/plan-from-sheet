import { LayoutDashboard, ArrowUpCircle, ArrowDownCircle, FileSignature, HandCoins, ClipboardList, LogOut, TrendingUp } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmPipelineOnly } from '@/hooks/useUserRole';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const allMenuItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Receitas', url: '/receitas', icon: ArrowUpCircle },
  { title: 'Despesas', url: '/despesas', icon: ArrowDownCircle },
  { title: 'Fluxo de Caixa', url: '/fluxo-caixa', icon: TrendingUp },
  { title: 'Contratos', url: '/contratos', icon: FileSignature },
  { title: 'Comissões', url: '/comissoes', icon: HandCoins },
  { title: 'Cadastros', url: '/cadastros', icon: ClipboardList },
];

// Restrição de menu para usuários "adm_pipeline" (sem acesso ao financeiro completo)
const admPipelineAllowed = new Set(['/contratos', '/comissoes']);

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut } = useAuth();
  const { isAdmPipelineOnly } = useIsAdmPipelineOnly();

  const menuItems = isAdmPipelineOnly
    ? allMenuItems.filter(m => admPipelineAllowed.has(m.url))
    : allMenuItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider">
            {!collapsed && 'Financeiro'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && 'Sair'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
