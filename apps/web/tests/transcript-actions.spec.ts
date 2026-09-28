import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('transcript actions', () => {
  test('copy original shows brief success feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=listening');

    const original = page.getByRole('region', { name: /Original Korean/i });
    await original.getByRole('button', { name: 'Copy original' }).click();
    await expect(original.getByRole('button', { name: /copied/i })).toBeVisible();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('안녕하세요');
  });

  test('clear both asks for confirmation when text exists', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=listening');

    await page.getByRole('button', { name: 'Clear both' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Clear both transcripts/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep text' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('region', { name: /Original Korean/i })).toContainText('안녕하세요');
  });

  test('200% zoom keeps toolbar usable without horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=listening');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 4,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: path.join('test-results', 'workspace-zoom-200.png'),
      fullPage: false,
    });
  });
});
