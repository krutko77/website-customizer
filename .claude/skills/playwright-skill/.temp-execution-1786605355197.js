const { chromium } = require('playwright');

const TARGET_URL = 'https://es-trans.ru/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  const telegram = await page.locator('a.chatme__link, a[href*="t.me/"], a[href*="telegram.me/"]').first();
  const max = await page.locator('a.social__link, a[href*="max.ru/"]').first();

  const tgHref = await telegram.count() ? await telegram.getAttribute('href') : null;
  const tgTarget = await telegram.count() ? await telegram.getAttribute('target') : null;
  const maxHref = await max.count() ? await max.getAttribute('href') : null;
  const maxTarget = await max.count() ? await max.getAttribute('target') : null;

  console.log(JSON.stringify({ tgHref, tgTarget, maxHref, maxTarget }, null, 2));

  await browser.close();
})();
