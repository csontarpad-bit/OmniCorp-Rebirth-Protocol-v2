# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tmpdebug.spec.js >> debug page
- Location: tmpdebug.spec.js:3:1

# Error details

```
Error: Channel closed
```

```
Error: page.waitForTimeout: Test ended.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - paragraph [ref=e9]: 11%
  - generic [ref=e10]:
    - 'heading "FIGYELMEZTETÉS: FÉNYÉRZÉKENY EPILEPSZIA" [level=1] [ref=e11]'
    - paragraph [ref=e12]: Ez a játék vizuális effekteket, villogó fényeket, hirtelen képernyő-torzulásokat (glitch) és intenzív ingereket tartalmaz. Képernyőn megjelenő villogó fényekre vagy mintázatokra az emberek egy nagyon kis százaléka epilepsziás rohammal reagálhat. Még ha korábban nem is volt epilepsziás rohama, a játék közben jelentkezhetnek tünetek. Ha Ön vagy családtagja epilepsziás tünetekkel rendelkezik, a játék megkezdése előtt konzultáljon orvosával! Ha szédülést, látászavart, szem- vagy izomrángást észlel, AZONNAL hagyja abba a játékot!
    - button "TUDOMÁSUL VETTEM" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1  | const { test } = require('@playwright/test');
  2  | 
  3  | test('debug page', async ({ page }) => {
  4  |   page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.type(), msg.text()));
  5  |   page.on('pageerror', err => console.log('PAGEERROR:', err.toString()));
  6  |   page.on('requestfailed', req => console.log('REQ_FAILED:', req.url(), req.failure() && req.failure().errorText));
  7  |   const res = await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  8  |   console.log('STATUS:', res && res.status());
> 9  |   await page.waitForTimeout(15000);
     |              ^ Error: page.waitForTimeout: Test ended.
  10 |   console.log('TITLE:', await page.title());
  11 |   console.log('BODYTEXT_LEN:', (await page.locator('body').innerText()).length);
  12 |   await page.screenshot({ path: '/tmp/omnicorp-debug.png', fullPage: true });
  13 | });
  14 | 
```