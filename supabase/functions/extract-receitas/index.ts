// Edge function: extract receitas from pasted image or text using Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_CHARACTERS = 4_300_000;
const MAX_TEXT_CHARACTERS = 20_000;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: "Arquivo ou texto muito grande" }, 413);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo da requisição inválido" }, 400);
    }

    const image = typeof body.image === "string" ? body.image : undefined;
    const text = typeof body.text === "string" ? body.text.trim() : undefined;
    const cleanNames = (value: unknown) => Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 500).map((item) => item.slice(0, 100))
      : [];
    const operadoras = cleanNames(body.operadoras);
    const vendedores = cleanNames(body.vendedores);

    if (!image && !text) {
      return jsonResponse({ error: "Forneça imagem ou texto" }, 400);
    }
    if (text && text.length > MAX_TEXT_CHARACTERS) {
      return jsonResponse({ error: "O texto excede o limite de 20.000 caracteres" }, 413);
    }
    if (image && (!image.startsWith("data:image/") || image.length > MAX_IMAGE_CHARACTERS)) {
      return jsonResponse({ error: "A imagem é inválida ou excede o limite permitido" }, 413);
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
        return jsonResponse({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }, 429);
      }
      if (resp.status === 402) {
        return jsonResponse({ error: "Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage." }, 402);
      }
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return jsonResponse({ error: "Erro ao chamar IA" }, 502);
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let lancamentos: any[] = [];
    if (args) {
      try {
        const parsed = typeof args === "string" ? JSON.parse(args) : args;
        lancamentos = Array.isArray(parsed.lancamentos)
          ? parsed.lancamentos.slice(0, 1_000).flatMap((item: unknown) => {
              if (!item || typeof item !== "object") return [];
              const value = item as Record<string, unknown>;
              if (typeof value.descricao !== "string" ||
                  typeof value.valor !== "number" || !Number.isFinite(value.valor)) return [];
              const date = typeof value.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.data)
                ? value.data
                : null;
              const categoria = value.categoria === "Vida" || value.categoria === "Bancária"
                ? value.categoria
                : null;
              return [{
                data: date,
                descricao: value.descricao.trim().slice(0, 500),
                valor: value.valor,
                operadora_nome: typeof value.operadora_nome === "string" ? value.operadora_nome.slice(0, 100) : null,
                vendedor_nome: typeof value.vendedor_nome === "string" ? value.vendedor_nome.slice(0, 100) : null,
                categoria,
              }];
            })
          : [];
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    return jsonResponse({ lancamentos });
  } catch (e) {
    console.error("extract-receitas error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
