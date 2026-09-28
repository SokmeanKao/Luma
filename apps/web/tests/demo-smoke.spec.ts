import { expect, test } from '@playwright/test';
import path from 'node:path';

const shots = path.join(__dirname, '..', '..', '..', 'docs', 'ux');

test('production home shows choose-source empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Understand what you’re listening to/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Choose audio source/i })).toBeVisible();
  await expect(page.getByText(/Playback audio only · Microphone off/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Start demo/i })).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, 'after-empty-state.png'), fullPage: true });
});

test('dev demo via query shows sample subtitles', async ({ page }) => {
  page.on('pageerror', (err) => {
    console.error('pageerror', err.message);
  });
  await page.goto('/?demo=1');
  await expect(page.locator('[data-demo-ready="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Demo samples/i })).toBeVisible();
  await page.getByRole('button', { name: /Start demo/i }).click();
  await expect(page.getByText(/Hello, everyone/i)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: path.join(shots, 'after-subtitles-demo.png'), fullPage: true });
});
