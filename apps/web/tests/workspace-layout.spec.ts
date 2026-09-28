import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('compact workspace layout', () => {
  test('1366×768 keeps transcripts above the fold', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript');

    await expect(page.locator('.session-toolbar')).toBeVisible();
    await expect(page.locator('.setup-steps')).toHaveCount(0);
    await expect(page.getByText('Voice debug')).toHaveCount(0);

    const transcript = page.locator('.transcript-stage');
    const box = await transcript.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeLessThan(280);
    expect(box!.height / 768).toBeGreaterThan(0.55);

    await expect(page.getByRole('region', { name: /Original Korean/i })).toContainText(
      '안녕하세요. 오늘 회의를 시작하겠습니다.',
    );
    await expect(page.getByRole('region', { name: /Translation English/i })).toContainText(
      'Hello. Let’s start today’s meeting.',
    );
    await expect(page.getByRole('button', { name: 'Copy original' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy translation' })).toBeVisible();
    await expect(page.locator('.dual-live-pill')).toHaveCount(0);
    await expect(page.getByRole('region', { name: /Original Korean/i }).getByText('Live')).toHaveCount(0);

    await page.screenshot({
      path: path.join('test-results', 'workspace-1366.png'),
      fullPage: false,
    });
  });

  test('1920×1080 transcript-first layout', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/preview/transcript');
    const box = await page.locator('.transcript-stage').boundingBox();
    expect(box!.height / 1080).toBeGreaterThan(0.6);
    await page.screenshot({
      path: path.join('test-results', 'workspace-1920.png'),
      fullPage: false,
    });
  });

  test('narrow mobile wraps without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/preview/transcript');
    await expect(page.locator('.dual-transcript-stack')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await page.screenshot({
      path: path.join('test-results', 'workspace-mobile.png'),
      fullPage: false,
    });
  });

  test('audio settings dialog shows visible full-width sliders', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript');
    await page.getByRole('button', { name: 'Audio settings' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Translation volume')).toBeVisible();
    const metrics = await dialog.locator('.volume-row').first().evaluate((el) => {
      const track = el.querySelector('.volume-track') as HTMLElement | null;
      return {
        rowW: el.getBoundingClientRect().width,
        trackW: track?.getBoundingClientRect().width ?? 0,
        trackH: track?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(metrics.rowW).toBeGreaterThan(200);
    expect(metrics.trackW).toBeGreaterThan(200);
    expect(metrics.trackH).toBeGreaterThan(12);
    await dialog.screenshot({
      path: path.join('test-results', 'audio-settings-dialog.png'),
    });
  });
});
