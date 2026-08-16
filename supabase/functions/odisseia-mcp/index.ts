// Servidor MCP remoto do Financeiro Odisseia (Streamable HTTP, stateless).
// Autenticação: Bearer token do Supabase Auth (OAuth 2.1 Server). RLS sempre respeitada.
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { findIdentityArgViolation } from './logic.ts';
import { buildServer, type Ctx } from './server.ts';
import { SERVER_NAME, SERVER_VERSION } from './tools.ts';

const FUNCTION_NAME = 'odisseia-mcp';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SCOPES = 'openid email profile';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version, last-event-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version, www-authenticate',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });

// ------------------------------------------------------- logs estruturados
// NUNCA registrar token, Authorization, argumentos, e-mail ou resultados.

type LogFields = {
  request_id: string;
  event: string;
  method?: string | null;
  tool?: string | null;
  ok?: boolean;
  status?: number;
  duration_ms?: number;
  error_kind?: string;
};

function log(fields: LogFields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), server: SERVER_NAME, version: SERVER_VERSION, ...fields }));
}

/** Extrai apenas método JSON-RPC e nome da tool — nunca argumentos. */
function describeRpc(raw: string): { method: string | null; tool: string | null } {
  try {
    const parsed = JSON.parse(raw);
    const msgs = Array.isArray(parsed) ? parsed : [parsed];
    const methods = msgs.map((m) => (typeof m?.method === 'string' ? m.method : null)).filter(Boolean);
    const tools = msgs
      .map((m) => (typeof m?.params?.name === 'string' && m?.method === 'tools/call' ? m.params.name : null))
      .filter(Boolean);
    return { method: methods.join(',') || null, tool: tools.join(',') || null };
  } catch {
    return { method: null, tool: null };
  }
}

// ------------------------------------------------------------------ handler

function canonicalUrl(): string {
  // URL pública canônica da função (o host interno do runtime não deve vazar).
  return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`;
}

function unauthorized(requestId: string, detail: string) {
  const resource = `${canonicalUrl()}/.well-known/oauth-protected-resource`;
  log({ request_id: requestId, event: 'auth_rejected', ok: false, status: 401, error_kind: 'unauthorized' });
  return json({ error: 'unauthorized', error_description: detail }, 401, {
    'WWW-Authenticate':
      `Bearer realm="${SERVER_NAME}", error="invalid_token", error_description="${detail}", ` +
      `scope="${SCOPES}", resource_metadata="${resource}"`,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const url = new URL(req.url);
  // Caminho relativo à função (o prefixo real pode variar entre ambientes).
  const idx = url.pathname.indexOf(`/${FUNCTION_NAME}`);
  const subPath = (idx >= 0 ? url.pathname.slice(idx + FUNCTION_NAME.length + 1) : url.pathname) || '/';

  if (req.method === 'GET' && subPath.includes('/.well-known/oauth-protected-resource')) {
    const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
    log({ request_id: requestId, event: 'oauth_metadata', ok: true, status: 200 });
    return json({
      resource: canonicalUrl(),
      authorization_servers: [`https://${projectRef}.supabase.co/auth/v1`],
      scopes_supported: SCOPES.split(' '),
      bearer_methods_supported: ['header'],
      resource_name: 'Financeiro Odisseia MCP',
    });
  }

  if (req.method === 'GET') {
    log({ request_id: requestId, event: 'health', ok: true, status: 200 });
    return json({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION, transport: 'streamable-http' });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return unauthorized(requestId, 'Token de acesso ausente.');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return unauthorized(requestId, 'Token de acesso inválido ou expirado.');

  const rawBody = await req.text();
  const { method, tool } = describeRpc(rawBody);
  log({ request_id: requestId, event: 'rpc_start', method, tool });

  const violation = findIdentityArgViolation(rawBody);
  if (violation) {
    log({ request_id: requestId, event: 'identity_arg_rejected', method, tool, ok: false, status: 400, error_kind: 'forbidden_arg' });
    return json(
      {
        error: 'invalid_request',
        error_description: `Argumento não permitido: "${violation}". A identidade do usuário vem do token de acesso.`,
      },
      400,
    );
  }


  const ctx: Ctx = { supabase, userId: userData.user.id, email: userData.user.email ?? null };

  try {
    const server = buildServer(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport(); // stateless
    await server.connect(transport);
    // Stateless: o transporte vive apenas durante esta requisição.
    // Não fechar o server aqui — isso abortaria o stream da resposta.
    const forwarded = new Request(req.url, { method: 'POST', headers: req.headers, body: rawBody });
    const response = await transport.handleRequest(forwarded);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    log({
      request_id: requestId,
      event: 'rpc_end',
      method,
      tool,
      ok: response.status < 400,
      status: response.status,
      duration_ms: Date.now() - startedAt,
    });
    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    log({
      request_id: requestId,
      event: 'rpc_end',
      method,
      tool,
      ok: false,
      status: 500,
      duration_ms: Date.now() - startedAt,
      error_kind: (e as Error)?.name ?? 'Error',
    });
    return json({ error: 'internal_error' }, 500);
  }
});
