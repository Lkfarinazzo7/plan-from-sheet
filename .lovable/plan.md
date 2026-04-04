

# Corrigir bug de data aparecendo um dia antes

## Problema

Quando voce cadastra uma despesa com data `2026-04-08`, o banco armazena corretamente `2026-04-08`. Porem, ao exibir na tela, o sistema faz `new Date("2026-04-08")` que cria a data em UTC (meia-noite UTC). Ao formatar com `Intl.DateTimeFormat('pt-BR')`, ele converte para o fuso horario do Brasil (UTC-3), resultando em `2026-04-07 21:00` -- ou seja, o dia anterior.

## Solucao

Alterar a funcao `formatDate` em `src/lib/format.ts` para tratar a string de data como local em vez de UTC. Basta adicionar `T00:00:00` ao final da string ou fazer split manual do `YYYY-MM-DD`.

A abordagem mais segura e fazer split manual:

```typescript
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(y, m - 1, d));
}
```

Tambem corrigir os locais em `useFinancialData.ts` que usam `new Date(year, month, day).toISOString().split('T')[0]` -- quando o fuso local e negativo (Brasil), `toISOString()` pode gerar o dia anterior. Substituir por formatacao manual `YYYY-MM-DD`:

```typescript
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
```

## Arquivos alterados

| Arquivo | Alteracao |
|---|---|
| `src/lib/format.ts` | Corrigir `formatDate` para usar split manual em vez de `new Date(str)` |
| `src/hooks/useFinancialData.ts` | Substituir `new Date(...).toISOString().split('T')[0]` por helper de formatacao manual para evitar offsets de timezone |

