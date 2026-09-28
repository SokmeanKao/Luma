import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('transcript paragraph layout', () => {
  test('shows continuous dual panels without fragment chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/preview/transcript');

    const original = page.getByRole('region', { name: /Original Korean/i });
    const translation = page.getByRole('region', { name: /Translation English/i });
    await expect(original).toBeVisible();
    await expect(translation).toBeVisible();

    // Continuous paragraphs — not one card per second.
    await expect(original.locator('.dual-flow-para')).toHaveCount(3);
    await expect(translation.locator('.dual-flow-para')).toHaveCount(3);

    // No per-chunk timestamps / Updating labels.
    await expect(page.locator('.dual-para-time')).toHaveCount(0);
    await expect(page.getByText('Updating')).toHaveCount(0);

    // Accumulated readable text present.
    await expect(translation).toContainText('Hello. Let’s start today’s meeting.');
    await expect(translation).toContainText('paragraph-style captions');
    await expect(original).toContainText('안녕하세요. 오늘 회의를 시작하겠습니다.');

    const shot = path.join('test-results', 'transcript-paragraphs.png');
    await page.locator('.dual-transcript').screenshot({ path: shot });
  });

  test('narrow screen stacks continuous panels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/preview/transcript');

    const stack = page.locator('.dual-transcript-stack');
    await expect(stack).toBeVisible();
    await expect(page.locator('.dual-transcript-cols')).toBeHidden();
    await expect(stack.getByLabel(/Original Korean/i)).toBeVisible();
    await expect(stack.getByLabel(/Translation English/i)).toBeVisible();
    await expect(stack.locator('.dual-flow-para').first()).toBeVisible();
    await expect(page.getByText('Updating')).toHaveCount(0);
  });
});
