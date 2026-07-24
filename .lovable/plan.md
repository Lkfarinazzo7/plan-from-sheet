## Ajustes na tela de Despesas

### 1. Filtro de Período — adicionar "Hoje"
Incluir a opção **Hoje** no seletor de período, ao lado de "Todo mês", "Esta semana", "Personalizado". Quando ativa, filtra apenas lançamentos com `data === hoje`.

### 2. Rótulos visíveis nos filtros
Cada filtro passa a exibir seu **nome** antes do valor, tanto no botão fechado quanto na lista aberta. Padrão visual:

```text
[ Categoria: Todas ▾ ]   [ Status: A pagar, Pago ▾ ]   [ Período: Este mês ▾ ]
[ Tipo: Todos ▾ ]        [ Responsável: Todos ▾ ]      [ Unidade: Todas ▾ ]
[ Setor: Pré-vendas ▾ ]
```

Quando houver múltiplas seleções, mostra "Categoria: 2 selecionadas" (ou os primeiros nomes + "+N"). Quando não houver seleção, mostra "Categoria: Todas".

### 3. Seleção múltipla em todos os filtros
Trocar os `Select` de valor único por um componente **MultiSelect** (Popover + Checkboxes, no padrão shadcn) para: Categoria, Status, Período (mantém single — não faz sentido múltiplo), Tipo, Responsável, Unidade e Setor.

- Estado interno passa de `string` para `string[]` (vazio = "Todas").
- Lógica de `filtered` atualizada: em vez de `d.categoria_id !== filtro`, usa `filtroArr.length && !filtroArr.includes(d.categoria_id)`.
- "Sem unidade" / "Sem setor" continuam como opções especiais dentro do MultiSelect (valor `__none__`).
- Botão **Limpar filtros** aparece quando qualquer filtro está ativo.

### 4. Revisão visual da lista de lançamentos
Reorganizar a `Table` para leitura mais clara, sem mudar dados exibidos:

- **Densidade e alinhamento**: linhas com `py-3`, valores monetários alinhados à direita e tabulares (`tabular-nums font-medium`), datas em `text-muted-foreground` menor.
- **Hierarquia**: `Descrição` em peso normal como coluna principal; `Categoria` e `Setor` como badges coloridos (reaproveitando `tagStyle`/`getTagColor`); `Tipo` como badge sutil (Fixo/Variável).
- **Status**: badge colorido — verde (Pago), âmbar (A pagar), vermelho (Atrasado) — usando tokens do design system.
- **Zebra + hover**: `odd:bg-muted/30 hover:bg-muted/60` para escaneabilidade.
- **Observações**: ícone `StickyNote` permanece à direita da descrição com tooltip; sem mudar comportamento.
- **Ações**: agrupadas em uma célula fixa à direita, ícones em `size-8 ghost`, com tooltip.
- **Cabeçalho**: sticky (`sticky top-0 bg-background z-10`) para não perder contexto ao rolar.
- **Rodapé**: linha de total já existente, reforçada com separador superior e tipografia consistente.

### Detalhes técnicos

- Novo componente `src/components/MultiSelectFilter.tsx` (Popover + Command + Checkbox) recebendo `label`, `options: {value,label}[]`, `value: string[]`, `onChange`.
- Em `Despesas.tsx`: converter os `useState<string>('all')` em `useState<string[]>([])`; ajustar `filtered` e resets.
- `filterPeriodo` permanece single, mas ganha a opção `hoje` e passa a exibir label ("Período: Hoje").
- Escopo restrito a `src/pages/Despesas.tsx` + novo componente de filtro. Nenhuma alteração em hooks/dados/DB.
