import { expect, test } from '@playwright/test';

test('demo mode shows English subtitle after Start demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Interactive demo/i)).toBeVisible();
  await page.getByRole('button', { name: /Start demo/i }).click();
  await expect(page.getByText(/Hello|meeting|screen|week|questions/i).first()).toBeVisible({
    timeout: 6000,
  });
});
