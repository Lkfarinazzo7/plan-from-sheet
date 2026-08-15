import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, AlertTriangle } from 'lucide-react';

type Details = {
  authorization_id: string;
  redirect_uri: string;
  client: { name?: string; client_id?: string; client_uri?: string | null; logo_uri?: string | null };
  user: { id: string; email: string };
  scope: string;
};

const SCOPE_LABEL: Record<string, string> = {
  openid: 'Identificar você (login)',
  email: 'Ver seu e-mail',
  profile: 'Ver seu perfil básico',
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id');
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authorizationId) {
        setError('Parâmetro "authorization_id" ausente na URL.');
        setLoading(false);
        return;
      }
      const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else if (data && 'redirect_url' in data) {
        window.location.href = data.redirect_url;
        return;
      } else {
        setDetails(data as Details);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  const decide = async (decision: 'approve' | 'deny') => {
    if (!authorizationId) return;
    setActing(decision);
    const api = (supabase.auth as any).oauth;
    const { data, error } =
      decision === 'approve'
        ? await api.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await api.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error) {
      setError(error.message);
      setActing(null);
      return;
    }
    window.location.href = data.redirect_url;
  };

  const scopes = (details?.scope || '').split(' ').filter(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl">Autorizar acesso</CardTitle>
            <CardDescription className="mt-1">
              Um aplicativo está solicitando acesso à sua conta do Financeiro Odisseia.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && <p className="text-center text-muted-foreground">Carregando solicitação...</p>}

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {details && !error && (
            <>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Aplicativo</span>
                  <span className="font-medium text-right">{details.client?.name || details.client?.client_id || 'Cliente MCP'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Conta</span>
                  <span className="font-medium text-right">{details.user?.email}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground shrink-0">Redirecionar para</span>
                  <span className="text-sm font-mono break-all text-right">{details.redirect_uri}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Permissões solicitadas</p>
                <ul className="space-y-2">
                  {scopes.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-sm">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span>{SCOPE_LABEL[s] || s}</span>
                      <Badge variant="secondary" className="ml-auto font-mono text-[11px]">{s}</Badge>
                    </li>
                  ))}
                  {!scopes.length && <li className="text-sm text-muted-foreground">Nenhum escopo específico solicitado.</li>}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                O aplicativo poderá consultar seus dados financeiros respeitando as mesmas permissões da sua conta.
                Alterações só acontecem após a sua confirmação explícita.
              </p>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" disabled={!!acting} onClick={() => decide('deny')}>
                  {acting === 'deny' ? 'Negando...' : 'Negar'}
                </Button>
                <Button className="flex-1" disabled={!!acting} onClick={() => decide('approve')}>
                  {acting === 'approve' ? 'Autorizando...' : 'Permitir'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
