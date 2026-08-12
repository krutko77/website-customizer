const { chromium } = require('playwright');

const TARGET_URL = 'https://es-trans.ru/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let consentGiven = false;
  const events = [];

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('mc.yandex.ru')) {
      events.push({ type: 'request', url, beforeConsent: !consentGiven, t: Date.now() });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('mc.yandex.ru')) {
      let setCookie = null;
      try {
        const headers = res.headers();
        setCookie = headers['set-cookie'] || null;
      } catch (e) {}
      events.push({ type: 'response', url, status: res.status(), beforeConsent: !consentGiven, setCookie });
    }
  });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  const cookiesBeforeClick = await context.cookies();
  const bhBefore = cookiesBeforeClick.find((c) => c.name === 'bh');

  // check tag.js already loaded before any consent action
  const tagJsLoadedBeforeConsent = events.some((e) => e.url.includes('tag.js') && e.beforeConsent);

  consentGiven = true;
  await page.locator('.cookie-banner__btn--accept').click().catch(() => {});
  await page.waitForTimeout(2000);

  const cookiesAfterClick = await context.cookies();
  const bhAfter = cookiesAfterClick.find((c) => c.name === 'bh');

  console.log(JSON.stringify({
    events,
    tagJsLoadedBeforeConsent,
    bhCookiePresentBeforeConsentClick: !!bhBefore,
    bhCookieValueSample: bhBefore ? bhBefore.value.slice(0, 20) + '...' : null,
    bhCookiePresentAfterConsentClick: !!bhAfter,
  }, null, 2));

  await browser.close();
})();
