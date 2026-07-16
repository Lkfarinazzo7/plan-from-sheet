# Plan from Sheet

Aplicação financeira para acompanhar receitas, despesas, contratos, comissões e cadastros auxiliares. O frontend usa React, Vite, TypeScript e Supabase.

## Requisitos

- Node.js 20.19+ ou 22.12+
- npm 10 ou superior
- Um projeto Supabase
- Supabase CLI para aplicar as migrações

## Configuração local

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Crie um arquivo `.env` na raiz:

   ```env
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_ANON
   ```

3. Vincule o projeto e aplique as migrações:

   ```bash
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push
   ```

   Para habilitar a extração de receitas por IA, configure e publique a função:

   ```bash
   npx supabase secrets set LOVABLE_API_KEY=SUA_CHAVE
   npx supabase functions deploy extract-receitas
   ```

4. Inicie o frontend:

   ```bash
   npm run dev
   ```

No primeiro acesso de uma instalação sem papéis cadastrados, o usuário autenticado pode criar o primeiro administrador na tela **Cadastros**. Depois disso, somente administradores podem alterar papéis de acesso.

## Verificações

```bash
npm run lint
npx tsc -b --pretty false
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Os arquivos Excel são processados no navegador e limitados a 10 MB e 5.000 linhas por importação.
