import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIsAdmPipelineOnly } from "@/hooks/useUserRole";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Receitas from "./pages/Receitas";
import Despesas from "./pages/Despesas";
import Comissoes from "./pages/Comissoes";
import Cadastros from "./pages/Cadastros";
import Pipeline from "./pages/Pipeline";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, pipelineOnly = false }: { children: React.ReactNode; pipelineOnly?: boolean }) {
  const { user, loading } = useAuth();
  const { isLoading: rolesLoading, isAdmPipelineOnly } = useIsAdmPipelineOnly();
  if (loading || rolesLoading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmPipelineOnly && !pipelineOnly) return <Navigate to="/pipeline" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/receitas" element={<ProtectedRoute><Receitas /></ProtectedRoute>} />
            <Route path="/despesas" element={<ProtectedRoute><Despesas /></ProtectedRoute>} />
            <Route path="/comissoes" element={<ProtectedRoute><Comissoes /></ProtectedRoute>} />
            <Route path="/cadastros" element={<ProtectedRoute><Cadastros /></ProtectedRoute>} />
            <Route path="/pipeline" element={<ProtectedRoute pipelineOnly><Pipeline /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
