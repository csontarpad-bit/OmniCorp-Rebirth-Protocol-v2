const { test } = require('@playwright/test');

test('debug page', async ({ page, browserName }, testInfo) => {
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.toString()));
  page.on('requestfailed', req => console.log('REQ_FAILED:', req.url(), req.failure() && req.failure().errorText));
  const res = await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('STATUS:', res && res.status());
  await page.waitForTimeout(5000);
  console.log('TITLE:', await page.title());
  console.log('BODYTEXT_LEN:', (await page.locator('body').innerText()).length);
});
