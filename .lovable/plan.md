
## Escopo

Duas frentes: (A) corrigir os bugs mais impactantes do relatório de auditoria, (B) adicionar duas novas visualizações financeiras — DRE mensal em cascata e DFC (Demonstrativo de Fluxo de Caixa).

---

## A. Correção de bugs

### 🔴 Críticos
1. **Datas UTC nos formulários** — trocar `new Date().toISOString().split('T')[0]` por `todayStr()` local (YYYY-MM-DD) em:
   - `src/pages/Receitas.tsx` (emptyForm e bulkDate)
   - `src/pages/Despesas.tsx` (emptyForm)
   - Qualquer outro ponto que use `toISOString()` para data de lançamento.

2. **Auto-promoção a admin** — remover o botão "Tornar-me admin" da aba Usuários em `Cadastros.tsx`. Substituir por instrução: "Peça ao administrador atual para conceder acesso." O primeiro admin será criado manualmente via banco (uma vez).

3. **Edge function `extract-receitas` sem validação** — em `supabase/functions/extract-receitas/index.ts`:
   - Limitar tamanho de `image` (base64) a ~5 MB e `text` a ~20 mil caracteres.
   - Retornar 413 quando exceder.
   - Adicionar tratamento explícito para 429/402 do gateway com mensagem clara ao usuário.

### 🟡 Médios
4. **Sidebar por papel** — em `AppSidebar.tsx`, usar `useUserRoles`/`useIsAdmPipelineOnly` para ocultar itens que o usuário não tem permissão de acessar (evita cliques em abas que dão erro RLS).

5. **`useMonthlyComparison` respeitar "sem unidade"** — em `useFinancialData.ts`, aceitar `unidade === 'none'` como filtro `IS NULL`, alinhando com Receitas/Despesas/Contratos.

6. **Duplicação de propostas no fluxo IA** — em `useBulkCreateReceita`, chamar `ensurePropostaId` (que já faz upsert por nome) para cada descrição antes do insert, evitando propostas órfãs.

7. **Auto-marcar "Atrasado"** — em `Despesas.tsx`, limpar o `Set` do `useRef` quando `month`/`year` mudarem; adicionar guarda `if (updateDespesa.isPending) return` para evitar disparos concorrentes.

8. **`QueryClient` sem cache config** — em `App.tsx`, adicionar `defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } }` para reduzir refetches.

9. **`formatCurrency` sem fallback** — em `src/lib/format.ts`, tratar `null/undefined/NaN` retornando `R$ 0,00`.

10. **`confirm()` nativo em Cadastros** — trocar por `AlertDialog` para manter identidade visual.

### 🟢 Baixo (rápidos)
11. **`index.html`** — título, descrição, og:title, og:description para "Sistema Financeiro – Corretora".
12. **Código morto `signUp`** — remover do `useAuth.tsx` (não é usado).

---

## B. DRE Mensal em Cascata

Nova seção no Dashboard, abaixo do comparativo mensal, mostrando a estrutura financeira do período selecionado em formato waterfall (barras conectadas).

### Estrutura da cascata
```text
(+) Receita Bruta          →  soma de receitas "Recebido"
(–) Despesas Operacionais  →  despesas exceto categorias marcadas como "Custo Fixo"/"Impostos"
(=) Margem Operacional
(–) Custos Fixos           →  despesas de categorias "Custos Fixos"
(=) Margem de Contribuição
(–) Impostos / Taxas       →  despesas de categorias "Impostos"
(=) Resultado Líquido
```

### Como classificar
Adicionar campo `tipo_dre` em `categorias_despesa` com valores: `operacional` (default), `custo_fixo`, `imposto`. Editável no cadastro de categorias. Sem migration destrutiva: default = `operacional`.

### UI
- Componente `DREWaterfall` usando `BarChart` do Recharts com barras verdes (positivas) e vermelhas (negativas) e uma linha de resultado.
- Respeita todos os filtros do Dashboard (mês, período, unidade).
- Tooltip mostrando valor absoluto e % sobre receita bruta.

---

## C. Demonstrativo de Fluxo de Caixa (DFC)

Nova aba no menu principal: **Fluxo de Caixa**.

### Visões dentro da aba

**1. DFC Realizado (período filtrado)**
Tabela com 3 blocos:
- **Operacional**: recebimentos de receitas "Recebido" – pagamentos de despesas "Pago".
- **Financeiro**: opcional futuro (por ora zerado).
- **Saldo do período** = soma dos blocos.

**2. Fluxo de Caixa Projetado (30/60/90 dias)**
- Entradas previstas: receitas com status "Aguardando" agrupadas por semana até 90 dias à frente (baseado em `data`).
- Saídas previstas: despesas com status "A pagar" idem.
- Saldo acumulado semana a semana.
- Gráfico de linha com duas séries (entradas/saídas) + área do saldo acumulado.

**3. Cards de topo**
- Caixa líquido do período
- Entradas realizadas × previstas
- Saídas realizadas × previstas
- Saldo projetado em 30/60/90d

### Filtros
Mesmos filtros do Dashboard (mês, período livre, unidade).

---

## Arquivos alterados / criados

| Arquivo | Alteração |
|---|---|
| `src/pages/Receitas.tsx`, `src/pages/Despesas.tsx` | Bug 1 (datas) |
| `src/pages/Cadastros.tsx` | Bug 2 + Bug 10 + campo `tipo_dre` em Categorias |
| `supabase/functions/extract-receitas/index.ts` | Bug 3 (validação) |
| `src/components/AppSidebar.tsx` | Bug 4 (papéis) |
| `src/hooks/useFinancialData.ts` | Bugs 5, 6 + hooks novos: `useDRE`, `useDFCRealizado`, `useDFCProjetado` |
| `src/pages/Despesas.tsx` | Bug 7 (Set + guarda) |
| `src/App.tsx` | Bug 8 (QueryClient config) + rota `/fluxo-caixa` |
| `src/lib/format.ts` | Bug 9 (fallback NaN) |
| `src/hooks/useAuth.tsx` | Bug 12 (remover signUp) |
| `index.html` | Bug 11 (metadata) |
| `src/pages/Dashboard.tsx` | Adicionar componente DRE Waterfall |
| `src/components/DREWaterfall.tsx` **(novo)** | Gráfico waterfall Recharts |
| `src/pages/FluxoCaixa.tsx` **(novo)** | Página DFC + projeção |
| **Migration** | `ALTER TABLE categorias_despesa ADD COLUMN tipo_dre text NOT NULL DEFAULT 'operacional' CHECK (tipo_dre IN ('operacional','custo_fixo','imposto'))` |

Sem quebra de dados. Categorias existentes assumem `operacional` — o usuário reclassifica pelas Cadastros conforme quiser refinar a DRE.

---

## Ordem de entrega
1. Migration + bug 1 e 2 (mais críticos e rápidos).
2. Bugs 3–12.
3. DRE Waterfall no Dashboard.
4. Página Fluxo de Caixa (DFC realizado + projetado).
