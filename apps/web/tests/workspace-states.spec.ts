import { expect, test } from '@playwright/test';
import path from 'node:path';

const shots = path.join('test-results');

test.describe('toolbar and transcript states', () => {
  test('empty state: From/To labels, primary choose source, balanced empties', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=empty');

    await expect(page.getByText('From', { exact: true })).toBeVisible();
    await expect(page.getByText('To', { exact: true })).toBeVisible();
    await expect(page.locator('.session-source-placeholder')).toContainText('Not chosen yet');
    await expect(page.getByRole('button', { name: 'Choose audio source' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Audio settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(page.locator('.subtitle-pair')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear both' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy original' })).toHaveCount(0);
    await expect(
      page.locator('.dual-transcript-cols').getByRole('region', { name: /Original Korean/i }).getByText('Your captured speech appears here.'),
    ).toBeVisible();
    await expect(
      page.locator('.dual-transcript-cols').getByRole('region', { name: /Translation English/i }).getByText('Your translation appears here.'),
    ).toBeVisible();
    await expect(page.locator('.session-help')).toContainText('Needs a Chrome tab');
    await expect(page.locator('.dual-transcript-toolbar')).toContainText('Text size');

    await page.screenshot({ path: path.join(shots, 'state-empty.png'), fullPage: false });
  });

  test('source-ready state', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=ready');
    await expect(page.getByText('YouTube — Product roadmap review')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start translation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(
      page.locator('.dual-transcript-cols').getByRole('region', { name: /Original Korean/i }).getByText('Audio ready — your captured speech appears here.'),
    ).toBeVisible();
    await expect(
      page.locator('.dual-transcript-cols').getByRole('region', { name: /Translation English/i }).getByText('Audio ready — your translation appears here.'),
    ).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'state-ready.png'), fullPage: false });
  });

  test('listening with paragraphs', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=listening');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear both' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy original' })).toBeVisible();
    await expect(page.getByRole('region', { name: /Original Korean/i })).toContainText('안녕하세요');
    await page.screenshot({ path: path.join(shots, 'state-listening.png'), fullPage: false });
  });

  test('paused state', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=paused');
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'state-paused.png'), fullPage: false });
  });

  test('error state', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/preview/transcript?state=error');
    await expect(page.locator('[data-slot="alert"]')).toContainText('Something went wrong');
    await expect(page.getByRole('button', { name: 'Choose source again' })).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'state-error.png'), fullPage: false });
  });
});
