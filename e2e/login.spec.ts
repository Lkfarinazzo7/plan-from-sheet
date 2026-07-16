import { test, expect } from '@playwright/test';

test('exibe o formulário de autenticação', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sistema Financeiro' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByLabel('Senha')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
