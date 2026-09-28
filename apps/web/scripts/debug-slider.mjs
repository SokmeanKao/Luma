import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto('http://127.0.0.1:3000/preview/transcript');
await page.getByRole('button', { name: 'Audio settings' }).click();
await page.waitForTimeout(800);
const info = await page.locator('[data-slot=popover-content]').evaluate((root) => {
  return [...root.querySelectorAll('[data-slot=slider]')].map((el) => {
    const track = el.querySelector('[data-slot=slider-track]');
    const range = el.querySelector('[data-slot=slider-range]');
    const thumb = el.querySelector('[data-slot=slider-thumb]');
    return {
      id: el.id,
      root: el.getBoundingClientRect().toJSON(),
      track: track?.getBoundingClientRect().toJSON(),
      range: range?.getBoundingClientRect().toJSON(),
      thumb: thumb?.getBoundingClientRect().toJSON(),
      trackStyle: track ? getComputedStyle(track).cssText.slice(0, 200) : null,
      rangeStyle: range ? getComputedStyle(range).cssText.slice(0, 200) : null,
    };
  });
});
console.log(JSON.stringify(info, null, 2));
await page.locator('[data-slot=popover-content]').screenshot({
  path: 'test-results/audio-debug.png',
  animations: 'disabled',
});
await browser.close();
