const { chromium } = require('playwright');
const fs = require('fs');
const TARGET_URL = 'https://es-trans.ru/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  const fixedJs = fs.readFileSync('/home/my_workspace/website-customizer/sites/es-trans-ru/messenger-consent/messenger-consent.js', 'utf8');
  await page.addScriptTag({ content: fixedJs });
  await page.locator('a.social__link, a[href*="max.ru/"]').first().click();
  await page.waitForTimeout(300);

  const overlays = await page.locator('.messenger-consent-overlay').all();
  const last = overlays[overlays.length - 1];
  const html = await last.locator('.messenger-consent').innerHTML();
  console.log(html);

  await browser.close();
})();
