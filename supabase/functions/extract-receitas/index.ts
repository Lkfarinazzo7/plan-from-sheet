// Edge function: extract receitas from pasted image or text using Lovable AI
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

    if (!image && !text) {
      return new Response(JSON.stringify({ error: "Forneça imagem ou texto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você extrai lançamentos financeiros de receitas a partir de imagens (prints) ou texto colado.
Cada linha geralmente tem: descrição (proposta/cliente), operadora (entre colchetes ou no texto), valor em reais.
Operadoras cadastradas (use exatamente um destes nomes quando casar, senão null): ${operadoras.join(", ") || "nenhuma"}.
Vendedores cadastrados (use exatamente um destes nomes quando casar, senão null): ${vendedores.join(", ") || "nenhum"}.
Categoria: "Bancária" (padrão para planos de saúde/seguros) ou "Vida". Se incerto, use "Bancária".
Data no formato YYYY-MM-DD; se não houver data explícita, retorne null.
Valor sempre em número (ex: 1620.68), nunca string com R$.
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
      tools: [
        {
          type: "function",
          function: {
            name: "registrar_lancamentos",
            description: "Registra os lançamentos de receita identificados.",
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
                      valor: { type: "number" },
                      operadora_nome: { type: ["string", "null"] },
                      vendedor_nome: { type: ["string", "null"] },
                      categoria: { type: ["string", "null"], enum: ["Bancária", "Vida", null] },
                    },
                    required: ["descricao", "valor"],
                  },
                },
              },
              required: ["lancamentos"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "registrar_lancamentos" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
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
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    return new Response(JSON.stringify({ lancamentos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-receitas error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
