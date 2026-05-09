
# Lançamento Inteligente de Receitas (colar imagem/texto)

Adicionar em **Receitas** um botão "Colar e identificar" que aceita print (Ctrl+V de imagem) ou texto colado, envia para a IA, identifica os lançamentos e abre uma lista para revisão antes de salvar em lote.

## Fluxo do usuário

1. Em `/receitas`, novo botão **"Colar e identificar"** ao lado dos botões existentes (Importar/Exportar/Nova).
2. Abre um diálogo com:
   - Área grande que aceita **Ctrl+V de imagem** (print) ou **texto colado**.
   - Também permite arrastar arquivo de imagem ou clicar para selecionar.
   - Botão "Analisar com IA".
3. IA processa e retorna uma lista de lançamentos detectados.
4. Tela de **revisão em lote**:
   - Tabela com colunas: ✓ (checkbox), Data, Descrição, Operadora, Vendedor, Categoria, Valor.
   - Cada linha é editável (selects para Operadora/Vendedor/Categoria, inputs para o resto).
   - Linhas com campos faltantes ficam destacadas (badge "Revisar").
   - Operadora/Vendedor são "casados" automaticamente com o cadastro existente (match case-insensitive por nome/parcial).
5. Botão **"Lançar selecionados"** salva tudo de uma vez (usa `useBulkCreateReceita`).

## Backend (Edge Function)

Criar `supabase/functions/extract-receitas/index.ts`:

- Recebe `{ image?: dataUrlBase64, text?: string }` + listas de operadoras e vendedores cadastrados (para a IA tentar casar pelo nome).
- Chama Lovable AI Gateway com `google/gemini-3-flash-preview` (suporta imagem + texto).
- Usa **tool calling** para retornar JSON estruturado:

```ts
{
  lancamentos: [{
    data: "YYYY-MM-DD" | null,
    descricao: string,
    valor: number,
    operadora_nome: string | null,
    vendedor_nome: string | null,
    categoria: "Bancária" | "Vida" | null
  }]
}
```

- Trata 429/402 e devolve mensagens claras.
- `verify_jwt = true` (default) — usuário precisa estar logado.

## Frontend

**Novos arquivos:**
- `src/components/receitas/ReceitaPasteDialog.tsx` — diálogo de colagem (paste handler para imagem e texto).
- `src/components/receitas/ReceitaPasteReview.tsx` — tabela de revisão/edição em lote.

**Edits:**
- `src/pages/Receitas.tsx` — adicionar botão "Colar e identificar" e montar o diálogo.

**Detalhes técnicos:**
- Captura de imagem: `onPaste` lê `clipboardData.items`, converte para `data:image/png;base64,...`.
- Match de operadora/vendedor no cliente: normaliza (lowercase, sem acentos) e compara `includes` em ambas direções; se não casar, deixa o select vazio para o usuário escolher.
- Categoria default: "Bancária" se a IA não identificar.
- Status default: "Aguardando".
- Data default: hoje (YYYY-MM-DD local) se a IA não retornar.
- Reusa `useBulkCreateReceita` já existente em `useFinancialData.ts`.

## Fora de escopo

- OCR local (sem IA) — toda extração é via Lovable AI.
- Salvar histórico de colagens.
- Auto-criar Operadora/Vendedor que não existem no cadastro (usuário escolhe manualmente no review).
