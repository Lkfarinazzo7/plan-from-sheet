// Edge function: extract comissões from pasted image or text using Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const image: string | undefined = body.image;
    const text: string | undefined = body.text;
    const operadoras: string[] = Array.isArray(body.operadoras) ? body.operadoras : [];
    const vendedores: string[] = Array.isArray(body.vendedores) ? body.vendedores : [];
    const supervisores: string[] = Array.isArray(body.supervisores) ? body.supervisores : [];

    if (!image && !text) {
      return new Response(JSON.stringify({ error: "Forneça imagem ou texto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você extrai lançamentos de comissões a partir de imagens (prints) ou texto colado.
Cada linha geralmente contém: descrição/cliente, operadora, vendedor, opcionalmente supervisor, valor da proposta, valor recebido e percentual de comissão.
Operadoras cadastradas (use exatamente um destes nomes quando casar, senão null): ${operadoras.join(", ") || "nenhuma"}.
Vendedores cadastrados: ${vendedores.join(", ") || "nenhum"}.
Supervisores cadastrados: ${supervisores.join(", ") || "nenhum"}.
Data no formato YYYY-MM-DD; se não houver data explícita, retorne null.
Valores sempre em número (ex: 1620.68), nunca string com R$.
Se houver percentual de comissão (ex: "10%"), retorne em pct_vendedor/pct_supervisor; senão deixe null e use comissao_vendedor/comissao_supervisor em R$ se disponível.
Retorne TODAS as linhas detectadas, sem agrupar nem deduplicar.`;

    const userContent: any[] = [];
    if (text) userContent.push({ type: "text", text: `Texto colado:\n${text}` });
    if (image) {
      userContent.push({ type: "text", text: "Extraia os lançamentos da imagem abaixo:" });
      userContent.push({ type: "image_url", image_url: { url: image } });
    }

    const aiBody = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [{
        type: "function",
        function: {
          name: "registrar_comissoes",
          description: "Registra os lançamentos de comissão identificados.",
          parameters: {
            type: "object",
            properties: {
              lancamentos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    data: { type: ["string", "null"] },
                    descricao: { type: "string" },
                    valor_proposta: { type: "number" },
                    valor_recebido: { type: ["number", "null"] },
                    operadora_nome: { type: ["string", "null"] },
                    vendedor_nome: { type: ["string", "null"] },
                    supervisor_nome: { type: ["string", "null"] },
                    pct_vendedor: { type: ["number", "null"] },
                    pct_supervisor: { type: ["number", "null"] },
                    comissao_vendedor: { type: ["number", "null"] },
                    comissao_supervisor: { type: ["number", "null"] },
                  },
                  required: ["descricao", "valor_proposta"],
                },
              },
            },
            required: ["lancamentos"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "registrar_comissoes" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(aiBody),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "Erro ao chamar IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let lancamentos: any[] = [];
    if (args) {
      try {
        const parsed = typeof args === "string" ? JSON.parse(args) : args;
        lancamentos = parsed.lancamentos || [];
      } catch (e) { console.error("Failed to parse tool args:", e); }
    }

    return new Response(JSON.stringify({ lancamentos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-comissoes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
